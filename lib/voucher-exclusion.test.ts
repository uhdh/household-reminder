import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { applyVoucherPurchaseExclusion, isVoucherPurchaseRecord } from "./voucher-exclusion";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000099";
const UPLOAD_ID = "00000000-0000-4000-8000-0000000000aa";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
}

function row(overrides: Partial<typeof transactions.$inferInsert> = {}) {
  return {
    householdId: HOUSEHOLD_ID,
    uploadId: UPLOAD_ID,
    personId: "husband",
    txnDate: "2026-09-10",
    txnTime: null,
    txnType: "지출",
    category: "쇼핑",
    subcategory: "기타",
    description: "테스트",
    amount: "-10000",
    paymentMethod: "카드",
    stdCategory: null,
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    ...overrides,
  };
}

describe("isVoucherPurchaseRecord", () => {
  test("category=서울페이 & subcategory=구매인 행만 true", () => {
    expect(isVoucherPurchaseRecord({ category: "서울페이", subcategory: "구매" })).toBe(true);
    expect(isVoucherPurchaseRecord({ category: "서울페이", subcategory: "결제" })).toBe(false);
    expect(isVoucherPurchaseRecord({ category: "자산수정", subcategory: "구매" })).toBe(false);
    expect(isVoucherPurchaseRecord({ category: null, subcategory: null })).toBe(false);
  });
});

describe("applyVoucherPurchaseExclusion", () => {
  afterEach(() => setDbForTesting(null));

  test("금액이 같고(±1일 이내) 가장 가까운 뱅크샐러드 출금 하나만 잠근다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      // 서울페이 구매 장부(amount는 이미 -A로 저장됨)
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-100000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      // 뱅크샐러드 카드결제 출금 후보 두 개: 하루 차이(더 가까움)와 이틀 차이(범위 밖)
      row({ txnDate: "2026-09-11", category: "카드대금", subcategory: "체크카드", amount: "-100000" }),
      row({ txnDate: "2026-09-12", category: "카드대금", subcategory: "체크카드", amount: "-100000" }),
    ]);

    const result = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(result.excludedCount).toBe(1);

    const rows = await db.select().from(transactions);
    const nearMatch = rows.find((r) => r.txnDate === "2026-09-11")!;
    const farCandidate = rows.find((r) => r.txnDate === "2026-09-12")!;
    expect(nearMatch.stdCategory).toBe("자산수정");
    expect(nearMatch.included).toBe(false);
    expect(nearMatch.categoryLocked).toBe(true);
    // ±1일 범위 밖(이틀 차이)인 후보는 그대로 둔다.
    expect(farCandidate.categoryLocked).toBe(false);
  });

  test("category_locked=true인 후보와 '직접 입력'/'서울페이' 카테고리는 매칭 대상에서 제외한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-50000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      row({ txnDate: "2026-09-10", category: "카드대금", amount: "-50000", categoryLocked: true }), // 이미 잠긴 행: 건드리면 안 됨(그대로 잠긴 상태 유지 확인용)
      row({ txnDate: "2026-09-10", category: "직접 입력", subcategory: "직접 입력", amount: "-50000" }),
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "결제", amount: "-50000" }),
    ]);

    const result = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(result.excludedCount).toBe(0);
  });

  test("멱등: 두 번 실행해도 같은 건만 잠기고 excludedCount는 두 번째 호출에서 0이 된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-30000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      row({ txnDate: "2026-09-10", category: "카드대금", amount: "-30000" }),
    ]);

    const first = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(first.excludedCount).toBe(1);
    const second = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(second.excludedCount).toBe(0);
  });

  test("원본 분류(category)가 비어 있는 뱅크샐러드 출금도 매칭한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-40000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      row({ txnDate: "2026-09-10", category: null, subcategory: null, amount: "-40000" }),
    ]);

    const result = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(result.excludedCount).toBe(1);
  });

  test("재실행 때 이미 짝이 있는 구매가 같은 금액의 다른 거래를 추가로 잠그지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-30000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      row({ txnDate: "2026-09-10", category: "카드대금", amount: "-30000" }),
    ]);
    expect((await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband")).excludedCount).toBe(1);

    // 첫 실행 뒤에 같은 금액·다음 날의 전혀 다른 지출이 새로 들어와도(예: 다음 달 뱅크샐러드 업로드)
    await db.insert(transactions).values(row({ txnDate: "2026-09-11", category: "식비", amount: "-30000", description: "다른 지출" }));
    expect((await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband")).excludedCount).toBe(0);
    const other = (await db.select().from(transactions)).find((r) => r.description === "다른 지출")!;
    expect(other.categoryLocked).toBe(false);
    expect(other.included).toBe(true);
  });

  test("다른 사람/다른 가구의 거래는 건드리지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(transactions).values([
      row({ txnDate: "2026-09-10", category: "서울페이", subcategory: "구매", amount: "-20000", stdCategory: "자산수정", included: false, categoryLocked: true }),
      row({ txnDate: "2026-09-10", personId: "wife", beneficiary: "wife", category: "카드대금", amount: "-20000" }),
      row({ txnDate: "2026-09-10", householdId: "00000000-0000-4000-8000-000000000098", category: "카드대금", amount: "-20000" }),
    ]);

    const result = await applyVoucherPurchaseExclusion(db, HOUSEHOLD_ID, "husband");
    expect(result.excludedCount).toBe(0);
  });
});
