// scripts/migrate-category-lock.ts 검증(PGlite만; 운영 DB는 건드리지 않는다):
// - 멱등: 두 번 실행해도 결과가 같다.
// - "우리집" 전용 하드코딩(보험 키워드, 이체 제외 설명 패턴)이 키워드 규칙으로 이관된다.
// - 새 규칙으로 다시 계산했을 때 저장된 std_category와 달라지는(=과거 수동 수정) 행만 잠긴다.
// - 다른 가구 데이터는 전혀 영향받지 않는다.
// - included 합계·거래 수가 스크립트 실행 전후로 바뀌지 않는다.
//
// 마이그레이션 전 실제 운영 스키마(category_locked 컬럼 없음)를 재현해야 하므로, 사전 데이터는
// drizzle의 transactions 스키마 객체(category_locked을 항상 포함해 INSERT문을 만든다) 대신 원시
// SQL로 넣는다(scripts/migrate-households.test.ts와 같은 방식).
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { categoryKeywordRules, transactions } from "@/lib/finance-db";
import { migrateCategoryLock } from "./migrate-category-lock";

const OUR_HOUSEHOLD_ID = "00000000-0000-4000-8000-0000000000a1";
const OTHER_HOUSEHOLD_ID = "00000000-0000-4000-8000-0000000000b1";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL,
      txn_date date NOT NULL, txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
      amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL DEFAULT true,
      is_internal_transfer boolean NOT NULL DEFAULT false, beneficiary text NOT NULL
      -- category_locked은 일부러 안 만든다: 마이그레이션 a)단계가 ADD COLUMN IF NOT EXISTS로 추가해야 한다.
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

  await db.execute(sql`INSERT INTO households (id, name) VALUES (${OUR_HOUSEHOLD_ID}, '우리집'), (${OTHER_HOUSEHOLD_ID}, '다른집')`);
}

type TxnOverrides = {
  householdId?: string;
  txnType?: string;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  amount?: string;
  stdCategory?: string | null;
  included?: boolean;
};

/** 마이그레이션 전 상태(category_locked 없음)를 흉내 내는 원시 SQL insert. id를 반환한다. */
async function insertTxn(db: ReturnType<typeof drizzle>, overrides: TxnOverrides = {}): Promise<string> {
  const row = {
    householdId: OUR_HOUSEHOLD_ID,
    uploadId: "00000000-0000-0000-0000-000000000001",
    personId: "husband",
    txnDate: "2026-08-10",
    txnType: "지출",
    category: "일반",
    subcategory: "일반",
    description: "일반 거래",
    amount: "-10000",
    stdCategory: null as string | null,
    included: true,
    beneficiary: "husband",
    ...overrides,
  };
  const result = await db.execute(sql`
    INSERT INTO transactions (household_id, upload_id, person_id, txn_date, txn_type, category, subcategory, description, amount, std_category, included, beneficiary)
    VALUES (${row.householdId}, ${row.uploadId}, ${row.personId}, ${row.txnDate}, ${row.txnType}, ${row.category}, ${row.subcategory}, ${row.description}, ${row.amount}, ${row.stdCategory}, ${row.included}, ${row.beneficiary})
    RETURNING id
  `);
  return (result as unknown as { rows: { id: string }[] }).rows[0].id;
}

describe("migrateCategoryLock", () => {
  test("보험 키워드가 거래를 자동으로 '보험'으로 분류하던 것을, 제거 후에는 마이그레이션이 키워드 규칙으로 복원한다", async () => {
    const db = drizzle();
    await createSchema(db);
    // 예전 하드코딩("11삼생" 키워드 포함 시 무조건 보험)으로 이미 std_category가 "보험"이던 과거 거래.
    const insuranceTxnId = await insertTxn(db, { category: "보험", subcategory: "생명보험", description: "11삼생보험료", stdCategory: "보험" });

    await migrateCategoryLock(db);

    const rules = await db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, OUR_HOUSEHOLD_ID));
    expect(rules.some((r) => r.keyword === "11삼생" && r.stdCategory === "보험")).toBe(true);
    expect(rules.some((r) => r.keyword === "DB생" && r.stdCategory === "보험")).toBe(true);
    expect(rules.some((r) => r.keyword === "삼성생보험금" && r.stdCategory === "보험")).toBe(true);

    // 새 키워드 규칙으로도 같은 결과가 나오므로(std_category 불변) 이 행은 잠글 필요가 없다.
    const [after] = await db.select().from(transactions).where(eq(transactions.id, insuranceTxnId));
    expect(after.categoryLocked).toBe(false);
    expect(after.stdCategory).toBe("보험");
  });

  test("이체 제외 설명 패턴(문...롬 등)에 매칭되는 거래를 위한 키워드 규칙을 만든다(설명 원문은 건수로만 확인)", async () => {
    const db = drizzle();
    await createSchema(db);
    await insertTxn(db, { txnType: "이체", category: "내계좌이체", description: "장문금융에서 아름롬으로", stdCategory: null });

    await migrateCategoryLock(db);

    const rules = await db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, OUR_HOUSEHOLD_ID));
    const transferRule = rules.find((r) => r.txnType === "이체" && r.stdCategory === "자산수정");
    expect(transferRule).toBeDefined();
    expect(transferRule?.keyword).toBe("장문금융에서 아름롬으로");
  });

  test("과거 수동 수정(현재 규칙으로 다시 계산한 값과 저장값이 다른 행)만 잠근다", async () => {
    const db = drizzle();
    await createSchema(db);
    // 매핑이 없어 자동으로는 null이 되어야 하는데, 사용자가 과거에 "기타"로 직접 고쳐 저장해 둔 거래.
    const manuallyEditedId = await insertTxn(db, { category: "미분류항목", subcategory: "미분류", description: "특이 거래", stdCategory: "기타" });
    // 매핑도 규칙도 없어 원래도 null이었을 거래(수동 수정 아님).
    const neverClassifiedId = await insertTxn(db, { category: "미분류항목", subcategory: "미분류", description: "다른 특이 거래", stdCategory: null });

    await migrateCategoryLock(db);

    const [afterEdited] = await db.select().from(transactions).where(eq(transactions.id, manuallyEditedId));
    const [afterNever] = await db.select().from(transactions).where(eq(transactions.id, neverClassifiedId));
    expect(afterEdited.categoryLocked).toBe(true);
    expect(afterEdited.stdCategory).toBe("기타"); // 값 자체는 건드리지 않음, 잠그기만 함
    expect(afterNever.categoryLocked).toBe(false);
  });

  test("다른 가구 데이터는 전혀 영향받지 않는다", async () => {
    const db = drizzle();
    await createSchema(db);
    const otherTxnId = await insertTxn(db, { householdId: OTHER_HOUSEHOLD_ID, category: "보험", subcategory: "생명보험", description: "11삼생보험료", stdCategory: null });

    await migrateCategoryLock(db);

    const otherRules = await db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, OTHER_HOUSEHOLD_ID));
    expect(otherRules).toHaveLength(0); // 보험 키워드 규칙은 "우리집"에만 생긴다
    const [after] = await db.select().from(transactions).where(eq(transactions.id, otherTxnId));
    expect(after.stdCategory).toBeNull(); // 값도 바뀌지 않음
    expect(after.categoryLocked).toBe(false);
  });

  test("멱등: 두 번 실행해도 결과가 같고, 실행 전후 거래 수·included 합계가 바뀌지 않는다", async () => {
    const db = drizzle();
    await createSchema(db);
    await insertTxn(db, { category: "보험", subcategory: "생명보험", description: "11삼생보험료", stdCategory: "보험", included: true });
    await insertTxn(db, { description: "평범한 지출", stdCategory: "식비", included: true, amount: "-5000" });

    const countAndSum = async () => {
      const rows = await db.select({ included: transactions.included, amount: transactions.amount }).from(transactions);
      return { count: rows.length, sum: rows.filter((r) => r.included).reduce((s, r) => s + Math.abs(Number(r.amount)), 0) };
    };

    const before = await countAndSum();
    await migrateCategoryLock(db);
    const afterFirst = await countAndSum();
    const rulesAfterFirst = await db.select().from(categoryKeywordRules);

    await migrateCategoryLock(db); // 두 번째 실행
    const afterSecond = await countAndSum();
    const rulesAfterSecond = await db.select().from(categoryKeywordRules);

    expect(afterFirst).toEqual(before);
    expect(afterSecond).toEqual(before);
    expect(rulesAfterSecond).toHaveLength(rulesAfterFirst.length); // 중복 삽입되지 않음(ON CONFLICT)
  });
});
