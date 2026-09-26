// rederiveTransactions -> applyHouseholdTransferPairs 순서로 실행했을 때, 두 번째 전체 실행이
// 아무것도 바꾸지 않는지(안정성) 확인한다. rederiveTransactions는 std_category/included만
// 다시 계산하고 is_internal_transfer는 그대로 읽기만 하므로, 첫 실행에서 짝지어진 계좌이동을
// 두 번째 rederive가 다시 풀어버리는 일이 없어야 한다.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { categoryMappings, people, transactions, uploads } from "@/lib/finance-db";
import { rederiveTransactions } from "./rederive-transactions";
import { applyHouseholdTransferPairs } from "./household-transfer-pairs";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000060";
const UPLOAD_H = "00000000-0000-4000-8000-0000000000c1";
const UPLOAD_W = "00000000-0000-4000-8000-0000000000c2";

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

async function runFullPass(db: ReturnType<typeof drizzle>) {
  const rederiveResult = await rederiveTransactions(db, HOUSEHOLD_ID);
  const pairResult = await applyHouseholdTransferPairs(db, HOUSEHOLD_ID);
  return { rederiveResult, pairResult };
}

describe("rederive + household 계좌이동 짝짓기 안정성", () => {
  afterEach(() => setDbForTesting(null));

  test("가구 전체를 rederive → pairing 순서로 두 번 돌리면 두 번째는 아무것도 바뀌지 않는다", async () => {
    const db = drizzle();
    // applyHouseholdTransferPairs가 내부에서 쓰는 getActiveTransactions는 getDb()로 커넥션을
    // 얻으므로(인자로 받은 db를 쓰지 않음) 테스트 override를 걸어 같은 인스턴스를 보게 한다.
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "식비" });

    await db.insert(transactions).values([
      // 매핑으로 분류될 미분류 거래(rederive 대상)
      row({ description: "순대국밥집", stdCategory: null }),
      // 배우자 간 계좌이동 후보(household pairing 대상)
      row({ personId: "husband", uploadId: UPLOAD_H, beneficiary: "husband", txnType: "지출", category: "이체", subcategory: "계좌", amount: "-150000", txnDate: "2026-09-12", description: "생활비 송금" }),
      row({ personId: "wife", uploadId: UPLOAD_W, beneficiary: "wife", txnType: "수입", category: "이체", subcategory: "계좌", amount: "150000", txnDate: "2026-09-12", description: "생활비 수령" }),
    ]);

    const first = await runFullPass(db);
    expect(first.rederiveResult.changed).toBeGreaterThan(0);
    expect(first.pairResult.pairs).toBe(1);

    const second = await runFullPass(db);
    expect(second.rederiveResult.changed).toBe(0);
    expect(second.pairResult.pairs).toBe(0);
    expect(second.pairResult.rows).toBe(0);
  });
});
