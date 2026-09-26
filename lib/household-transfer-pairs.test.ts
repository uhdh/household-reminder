// 가구 단위 내 계좌 이동 짝짓기 검증: 배우자 간 계좌이체(cross-person)와 같은 사람의
// 이체↔수입 오분류를 짝지어 집계에서 빼는지, 짝 조건(부호 반대·금액 동일·±1일·이체 or
// 타인)을 정확히 지키는지, 잠긴 행은 건드리지 않는지, 그리디 최소시간차 선택과 멱등성,
// dryRun이 아무 것도 쓰지 않는지를 확인한다.
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";
import { applyHouseholdTransferPairs } from "./household-transfer-pairs";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000050";
const UPLOAD_H = "00000000-0000-4000-8000-0000000000b1";
const UPLOAD_W = "00000000-0000-4000-8000-0000000000b2";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
  await db.insert(people).values([
    { id: "husband", householdId: HOUSEHOLD_ID, displayName: "남편" },
    { id: "wife", householdId: HOUSEHOLD_ID, displayName: "아내" },
  ]);
  await db.insert(uploads).values([
    { id: UPLOAD_H, householdId: HOUSEHOLD_ID, personId: "husband", sourceFilename: "테스트", isActive: true },
    { id: UPLOAD_W, householdId: HOUSEHOLD_ID, personId: "wife", sourceFilename: "테스트", isActive: true },
  ]);
}

function row(overrides: Partial<typeof transactions.$inferInsert> = {}) {
  return {
    householdId: HOUSEHOLD_ID,
    uploadId: UPLOAD_H,
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

describe("applyHouseholdTransferPairs", () => {
  afterEach(() => setDbForTesting(null));

  test("서로 다른 사람(cross-person) 간 부호 반대·금액 동일 거래는 짝지어 집계에서 제외된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [a, b] = await db
      .insert(transactions)
      .values([
        row({ personId: "husband", uploadId: UPLOAD_H, beneficiary: "husband", txnType: "지출", amount: "-200000", txnDate: "2026-09-10" }),
        row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "200000", txnDate: "2026-09-11", description: "다른 설명" }),
      ])
      .returning();

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(result).toEqual({ pairs: 1, rows: 2 });

    const [afterA] = await db.select().from(transactions).where(eq(transactions.id, a.id));
    const [afterB] = await db.select().from(transactions).where(eq(transactions.id, b.id));
    expect(afterA.isInternalTransfer).toBe(true);
    expect(afterA.included).toBe(false);
    expect(afterB.isInternalTransfer).toBe(true);
    expect(afterB.included).toBe(false);
  });

  test("같은 사람의 이체↔수입은 설명이 달라도 짝짓는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [a, b] = await db
      .insert(transactions)
      .values([
        row({ txnType: "이체", amount: "-50000", description: "계좌이체", txnDate: "2026-09-10" }),
        row({ txnType: "수입", amount: "50000", description: "입금", txnDate: "2026-09-10" }),
      ])
      .returning();

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(result.pairs).toBe(1);
    const rows = await db.select().from(transactions);
    expect(rows.find((r) => r.id === a.id)!.isInternalTransfer).toBe(true);
    expect(rows.find((r) => r.id === b.id)!.isInternalTransfer).toBe(true);
  });

  test("같은 사람의 지출↔수입(둘 다 이체가 아님)은 짝짓지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(transactions).values([
      row({ txnType: "지출", amount: "-30000", txnDate: "2026-09-10" }),
      row({ txnType: "수입", amount: "30000", txnDate: "2026-09-10" }),
    ]);

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(result).toEqual({ pairs: 0, rows: 0 });
    const rows = await db.select().from(transactions);
    expect(rows.every((r) => !r.isInternalTransfer && r.included)).toBe(true);
  });

  test("category_locked=true인 행은 후보에서 제외되어 짝을 잃은 상대도 그대로 남는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [locked, other] = await db
      .insert(transactions)
      .values([
        row({ personId: "husband", txnType: "지출", amount: "-70000", txnDate: "2026-09-10", categoryLocked: true }),
        row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "70000", txnDate: "2026-09-10" }),
      ])
      .returning();

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(result).toEqual({ pairs: 0, rows: 0 });
    const rows = await db.select().from(transactions);
    expect(rows.find((r) => r.id === locked.id)!.isInternalTransfer).toBe(false);
    expect(rows.find((r) => r.id === other.id)!.isInternalTransfer).toBe(false);
  });

  test("±1일 경계: 정확히 1일 차이는 짝짓고, 2일 차이는 짝짓지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(transactions).values([
      row({ personId: "husband", txnType: "지출", amount: "-40000", txnDate: "2026-09-10" }),
      row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "40000", txnDate: "2026-09-11" }), // 정확히 1일
    ]);
    const within = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(within.pairs).toBe(1);

    await db.execute(sql`DELETE FROM transactions`);
    await db.insert(transactions).values([
      row({ personId: "husband", txnType: "지출", amount: "-40000", txnDate: "2026-09-10" }),
      row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "40000", txnDate: "2026-09-12" }), // 2일
    ]);
    const beyond = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(beyond.pairs).toBe(0);
  });

  test("그리디: 시간 차이가 가장 작은 상대를 고른다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [a, near, far] = await db
      .insert(transactions)
      .values([
        row({ personId: "husband", txnType: "지출", amount: "-20000", txnDate: "2026-09-10", txnTime: "09:00:00" }),
        row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "20000", txnDate: "2026-09-10", txnTime: "09:05:00", description: "가까운쪽" }),
        row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "20000", txnDate: "2026-09-10", txnTime: "09:30:00", description: "먼쪽" }),
      ])
      .returning();

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(result).toEqual({ pairs: 1, rows: 2 });

    const rows = await db.select().from(transactions);
    expect(rows.find((r) => r.id === a.id)!.isInternalTransfer).toBe(true);
    expect(rows.find((r) => r.id === near.id)!.isInternalTransfer).toBe(true);
    expect(rows.find((r) => r.id === far.id)!.isInternalTransfer).toBe(false); // 상대를 못 찾아 그대로 남음
  });

  test("멱등: 두 번째 실행에서는 새로 짝지을 후보가 없어 pairs=0이다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(transactions).values([
      row({ personId: "husband", txnType: "지출", amount: "-90000", txnDate: "2026-09-10" }),
      row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "90000", txnDate: "2026-09-10" }),
    ]);

    const first = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(first.pairs).toBe(1);
    const second = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
    expect(second).toEqual({ pairs: 0, rows: 0 });
  });

  test("dryRun은 짝을 계산해 반환하되 DB에는 아무 것도 쓰지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [a] = await db
      .insert(transactions)
      .values([
        row({ personId: "husband", txnType: "지출", amount: "-60000", txnDate: "2026-09-10" }),
        row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", amount: "60000", txnDate: "2026-09-10" }),
      ])
      .returning();

    const result = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID, { dryRun: true });
    expect(result).toEqual({ pairs: 1, rows: 2 });

    const [after] = await db.select().from(transactions).where(eq(transactions.id, a.id));
    expect(after.isInternalTransfer).toBe(false);
    expect(after.included).toBe(true);
  });
});
