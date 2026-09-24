// seedDemoHousehold 검증(PGlite): 멱등성(같은 행 수), household_id 일관성, 요청한 기간(2026-01~08)
// 데이터가 실제 조회 함수(getActiveTransactions)로도 보이는지, 투자 자산에 cost_basis가 있는지,
// 자기계좌이체(부부간 정산/저축이체)가 실제 판정 경로(rederiveTransactions가 쓰는 것과 같은
// matchSelfTransferPairs)로 included=false 처리되는지 확인한다.
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import {
  allocationTargets,
  assetItems,
  budgetCategories,
  categoryKeywordRules,
  categoryMappings,
  households,
  people,
  transactions,
  uploads,
} from "@/lib/finance-db";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-household";
import { seedDemoHousehold } from "@/lib/demo-seed";
import { getActiveTransactions } from "@/lib/spending-queries";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE household_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE, role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE household_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
      created_by uuid NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, used_by uuid
    )
  `);
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE asset_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL,
      side text NOT NULL, category text NOT NULL, product_name text, amount numeric(18,2) NOT NULL DEFAULT 0,
      cost_basis numeric(18,2), sector text
    )
  `);
  await db.execute(sql`
    CREATE TABLE allocation_targets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, category text NOT NULL,
      target_pct numeric(5,2) NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (household_id, category)
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL,
      txn_date date NOT NULL, txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
      amount numeric(18,2) NOT NULL, payment_method text, std_category text, included boolean NOT NULL DEFAULT true,
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
  await db.execute(sql`
    CREATE TABLE budget_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, name text NOT NULL, kind text NOT NULL,
      sort_order numeric(6,0) NOT NULL DEFAULT 0, monthly_budget numeric(18,2),
      UNIQUE (household_id, name)
    )
  `);
}

async function rowCounts(db: ReturnType<typeof drizzle>) {
  return {
    households: (await db.select().from(households)).length,
    people: (await db.select().from(people)).length,
    uploads: (await db.select().from(uploads)).length,
    transactions: (await db.select().from(transactions)).length,
    assetItems: (await db.select().from(assetItems)).length,
    allocationTargets: (await db.select().from(allocationTargets)).length,
    categoryMappings: (await db.select().from(categoryMappings)).length,
    categoryKeywordRules: (await db.select().from(categoryKeywordRules)).length,
    budgetCategories: (await db.select().from(budgetCategories)).length,
  };
}

describe("seedDemoHousehold", () => {
  afterEach(() => setDbForTesting(null));

  test("멱등: 두 번 실행해도 테이블별 행 수와 요약이 같다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const summary1 = await seedDemoHousehold(db);
    const counts1 = await rowCounts(db);

    const summary2 = await seedDemoHousehold(db);
    const counts2 = await rowCounts(db);

    expect(summary2).toEqual(summary1);
    expect(counts2).toEqual(counts1);
    expect(counts1.households).toBe(1);
    expect(counts1.people).toBe(2);
    expect(counts1.uploads).toBe(2);
    expect(counts1.transactions).toBeGreaterThan(0);
  }, 30000);

  test("모든 삽입 행의 household_id가 DEMO_HOUSEHOLD_ID다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await seedDemoHousehold(db);

    const tables = [
      { name: "people", rows: await db.select().from(people) },
      { name: "uploads", rows: await db.select().from(uploads) },
      { name: "transactions", rows: await db.select().from(transactions) },
      { name: "asset_items", rows: await db.select().from(assetItems) },
      { name: "allocation_targets", rows: await db.select().from(allocationTargets) },
      { name: "category_mappings", rows: await db.select().from(categoryMappings) },
      { name: "category_keyword_rules", rows: await db.select().from(categoryKeywordRules) },
      { name: "budget_categories", rows: await db.select().from(budgetCategories) },
    ];
    for (const { name, rows } of tables) {
      expect(rows.length, `${name} should have rows`).toBeGreaterThan(0);
      expect(rows.every((r) => (r as { householdId: string }).householdId === DEMO_HOUSEHOLD_ID), `${name} rows should all belong to DEMO_HOUSEHOLD_ID`).toBe(true);
    }
    const [household] = await db.select().from(households).where(eq(households.id, DEMO_HOUSEHOLD_ID));
    expect(household).toBeDefined();
  });

  test("getActiveTransactions(DEMO_HOUSEHOLD_ID)가 2026-01~08 각 달의 데이터를 반환한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await seedDemoHousehold(db);

    const { transactions: rows } = await getActiveTransactions(DEMO_HOUSEHOLD_ID);
    const months = new Set(rows.map((r) => r.txnDate.slice(0, 7)));
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]) {
      expect(months.has(m), `month ${m} should have transactions`).toBe(true);
    }
  });

  test("투자성 자산에 cost_basis가 있고, 수익·손실이 섞여 있다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await seedDemoHousehold(db);

    const investmentRows = await db.select().from(assetItems).where(eq(assetItems.category, "투자성 자산"));
    expect(investmentRows.length).toBeGreaterThan(0);
    expect(investmentRows.every((r) => r.costBasis !== null)).toBe(true);

    const gains = investmentRows.filter((r) => Number(r.amount) > Number(r.costBasis));
    const losses = investmentRows.filter((r) => Number(r.amount) < Number(r.costBasis));
    expect(gains.length).toBeGreaterThan(0);
    expect(losses.length).toBeGreaterThan(0);
  });

  test("부부간 정산·저축/투자 이체가 자기계좌이체로 매칭되어 included=false로 제외된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await seedDemoHousehold(db);

    const transferRows = await db.select().from(transactions).where(eq(transactions.txnType, "이체"));
    expect(transferRows.length).toBeGreaterThan(0);
    expect(transferRows.every((r) => r.isInternalTransfer === true)).toBe(true);
    expect(transferRows.every((r) => r.included === false)).toBe(true);
  });
});
