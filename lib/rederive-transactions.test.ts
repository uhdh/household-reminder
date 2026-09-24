// rederiveTransactions 검증: 매핑/규칙/키워드 규칙 변경 후 영향받는 거래를 우선순위(키워드 > 결제수단
// 규칙 > 원본 매핑)대로 다시 계산하되, 사용자가 직접 고친(category_locked=true) 거래는 절대 건드리지
// 않는지 확인한다. ILIKE 후보 선택의 특수문자 이스케이프도 함께 검증한다.
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, ilike, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { categoryKeywordRules, categoryMappings, transactions } from "@/lib/finance-db";
import { escapeIlikePattern, rederiveTransactions } from "./rederive-transactions";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000001";
const UPLOAD_ID = "00000000-0000-0000-0000-000000000001";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL,
      txn_date date NOT NULL, txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
      amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL DEFAULT true,
      is_internal_transfer boolean NOT NULL DEFAULT false, beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_mappings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, raw_category text NOT NULL,
      raw_subcategory text NOT NULL, std_category text NOT NULL,
      UNIQUE (household_id, txn_type, raw_category, raw_subcategory)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, payment_method text NOT NULL,
      std_category text NOT NULL,
      UNIQUE (household_id, txn_type, payment_method)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_keyword_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, keyword text NOT NULL,
      std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (household_id, keyword)
    )
  `);
}

function txnRow(overrides: Partial<typeof transactions.$inferInsert>) {
  return {
    householdId: HOUSEHOLD_ID,
    uploadId: UPLOAD_ID,
    personId: "husband",
    txnDate: "2026-08-10",
    txnType: "지출",
    category: "식비",
    subcategory: "한식",
    description: "순대국밥",
    amount: "-10000",
    stdCategory: null,
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    ...overrides,
  };
}

describe("rederiveTransactions", () => {
  test("(i) category_locked=true인 거래는 매핑이 바뀌어도 그대로 유지된다", async () => {
    const db = drizzle();
    await createSchema(db);
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "기타" });
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ stdCategory: "식비", categoryLocked: true }))
      .returning();

    const changed = await rederiveTransactions(db, HOUSEHOLD_ID, eq(transactions.id, row.id));

    expect(changed).toBe(0);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBe("식비"); // 새 매핑("기타")이 아니라 기존 값 그대로
  });

  test("(ii) 키워드 규칙이 이미 적용된 거래는 매핑을 추가해도 키워드 결과를 유지한다(우선순위)", async () => {
    const db = drizzle();
    await createSchema(db);
    await db.insert(categoryKeywordRules).values({ householdId: HOUSEHOLD_ID, txnType: "지출", keyword: "코스트코", stdCategory: "식재료" });
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "온라인쇼핑", rawSubcategory: "인터넷쇼핑", stdCategory: "쇼핑" });
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ category: "온라인쇼핑", subcategory: "인터넷쇼핑", description: "코스트코", stdCategory: "식재료" }))
      .returning();

    const changed = await rederiveTransactions(
      db,
      HOUSEHOLD_ID,
      and(eq(transactions.txnType, "지출"), eq(transactions.category, "온라인쇼핑"), eq(transactions.subcategory, "인터넷쇼핑"))
    );

    expect(changed).toBe(0);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBe("식재료"); // 매핑("쇼핑")이 아니라 키워드 규칙이 이긴다
  });

  test("(iii) 매핑 삭제 후 재계산하면 해당 거래가 미분류로 돌아간다", async () => {
    const db = drizzle();
    await createSchema(db);
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "미분류", stdCategory: "여행" });
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ category: "여행/숙박", subcategory: "미분류", description: "호텔", stdCategory: "여행" }))
      .returning();

    // 매핑을 지운 뒤(설정 액션이 하는 것과 동일) 재계산한다.
    await db.delete(categoryMappings).where(eq(categoryMappings.householdId, HOUSEHOLD_ID));
    const changed = await rederiveTransactions(
      db,
      HOUSEHOLD_ID,
      and(eq(transactions.txnType, "지출"), eq(transactions.category, "여행/숙박"), eq(transactions.subcategory, "미분류"))
    );

    expect(changed).toBe(1);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBeNull();
    expect(after.included).toBe(true); // 이체 후보가 아니므로 집계에는 그대로 포함
  });

  test("(iv) ILIKE 후보 선택에서 %,_,\\를 이스케이프해 무관한 거래까지 매칭되지 않는다", async () => {
    const db = drizzle();
    await createSchema(db);
    await db.insert(categoryKeywordRules).values({ householdId: HOUSEHOLD_ID, txnType: "지출", keyword: "50%", stdCategory: "할인" });
    const [literalMatch, unrelated] = await db
      .insert(transactions)
      .values([
        txnRow({ description: "50% 할인쿠폰 사용" }),
        txnRow({ description: "50000원 결제" }), // "50"은 포함하지만 "50%"는 아님 - 이스케이프 없으면 잘못 매칭됨
      ])
      .returning();

    const escapedFilter = ilike(transactions.description, `%${escapeIlikePattern("50%")}%`);
    const changed = await rederiveTransactions(db, HOUSEHOLD_ID, escapedFilter);

    expect(changed).toBe(1);
    const [afterLiteral] = await db.select().from(transactions).where(eq(transactions.id, literalMatch.id));
    const [afterUnrelated] = await db.select().from(transactions).where(eq(transactions.id, unrelated.id));
    expect(afterLiteral.stdCategory).toBe("할인");
    expect(afterUnrelated.stdCategory).toBeNull(); // 잘못 매칭되지 않음
  });

  test("household_id로 항상 스코프가 걸려 다른 가구 거래는 절대 바뀌지 않는다", async () => {
    const db = drizzle();
    await createSchema(db);
    const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-000000000002";
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "식비" });
    const [otherRow] = await db
      .insert(transactions)
      .values(txnRow({ householdId: OTHER_HOUSEHOLD, stdCategory: null }))
      .returning();

    const changed = await rederiveTransactions(db, HOUSEHOLD_ID);

    expect(changed).toBe(0);
    const [after] = await db.select().from(transactions).where(eq(transactions.id, otherRow.id));
    expect(after.stdCategory).toBeNull();
  });
});
