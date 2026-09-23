// scripts/migrate-households.ts 검증: PGlite에 마이그레이션 이전 형태(household_id 없음) 데이터를
// 넣고 마이그레이션을 2번 실행해도 결과가 같은지(멱등), 모든 행에 household_id가 채워지는지,
// unique 제약이 가구 단위로 바뀌는지 확인한다. 운영 DB(DATABASE_URL)는 전혀 건드리지 않는다.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { migrateHouseholds } from "./migrate-households";

async function createPreMigrationSchema(db: ReturnType<typeof drizzle>) {
  // 마이그레이션 전 실제 운영 스키마(household_id 없음, 전역 unique)를 그대로 재현.
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE asset_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid NOT NULL, person_id text NOT NULL, side text NOT NULL,
      category text NOT NULL, product_name text, amount numeric NOT NULL DEFAULT 0, cost_basis numeric, sector text
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE allocation_targets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL UNIQUE, target_pct numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_mappings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), txn_type text NOT NULL, raw_category text NOT NULL, raw_subcategory text NOT NULL,
      std_category text NOT NULL,
      CONSTRAINT category_mappings_txn_type_raw_category_raw_subcategory_unique UNIQUE (txn_type, raw_category, raw_subcategory)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), txn_type text NOT NULL, payment_method text NOT NULL, std_category text NOT NULL,
      CONSTRAINT category_rules_txn_type_payment_method_unique UNIQUE (txn_type, payment_method)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_keyword_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), txn_type text NOT NULL, keyword text NOT NULL UNIQUE, std_category text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE budget_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, kind text NOT NULL,
      sort_order numeric NOT NULL DEFAULT 0, monthly_budget numeric
    )
  `);

  await db.execute(sql`INSERT INTO people (id, display_name) VALUES ('husband', '남편'), ('wife', '아내')`);
  await db.execute(sql`INSERT INTO uploads (id, person_id, source_filename) VALUES ('00000000-0000-0000-0000-000000000001', 'husband', 'a.xlsx')`);
  await db.execute(sql`
    INSERT INTO asset_items (upload_id, person_id, side, category, amount)
    VALUES ('00000000-0000-0000-0000-000000000001', 'husband', 'asset', '현금', 1000000)
  `);
  await db.execute(sql`
    INSERT INTO transactions (id, upload_id, person_id, txn_date, txn_type, amount, included, is_internal_transfer, beneficiary)
    VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'husband', '2026-08-01', '지출', -1000, true, false, 'husband')
  `);
  await db.execute(sql`INSERT INTO allocation_targets (category, target_pct) VALUES ('현금', 30)`);
  await db.execute(sql`INSERT INTO category_mappings (txn_type, raw_category, raw_subcategory, std_category) VALUES ('지출', '식비', '한식', '식비')`);
  await db.execute(sql`INSERT INTO category_rules (txn_type, payment_method, std_category) VALUES ('지출', 'MG생활비통장', '대출원리금')`);
  await db.execute(sql`INSERT INTO category_keyword_rules (txn_type, keyword, std_category) VALUES ('지출', '코스트코', '식재료')`);
  await db.execute(sql`INSERT INTO budget_categories (name, kind, sort_order) VALUES ('식비', '변동비', 1)`);
}

describe("migrateHouseholds", () => {
  test("멱등: 두 번 실행해도 결과가 같고, 모든 행에 household_id가 채워진다", async () => {
    const db = drizzle();
    await createPreMigrationSchema(db);

    const first = await migrateHouseholds(db, { seedOwnerEmails: "A@example.com, b@example.com" });
    const second = await migrateHouseholds(db, { seedOwnerEmails: "A@example.com, b@example.com" });

    expect(second.householdId).toBe(first.householdId);

    const households = await db.execute(sql`SELECT id, name FROM households`);
    expect((households as unknown as { rows: unknown[] }).rows).toHaveLength(1);

    const users = await db.execute(sql`SELECT email FROM users ORDER BY email`);
    expect((users as unknown as { rows: { email: string }[] }).rows.map((r) => r.email)).toEqual(["a@example.com", "b@example.com"]);

    const members = await db.execute(sql`SELECT role FROM household_members`);
    expect((members as unknown as { rows: { role: string }[] }).rows).toHaveLength(2);
    expect((members as unknown as { rows: { role: string }[] }).rows.every((r) => r.role === "owner")).toBe(true);

    for (const table of [
      "people",
      "uploads",
      "asset_items",
      "transactions",
      "allocation_targets",
      "category_mappings",
      "category_rules",
      "category_keyword_rules",
      "budget_categories",
    ]) {
      const rows = await db.execute(sql.raw(`SELECT household_id FROM ${table}`));
      const values = (rows as unknown as { rows: { household_id: string | null }[] }).rows;
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((r) => r.household_id === first.householdId)).toBe(true);
    }
  });

  test("unique 제약이 가구 단위로 바뀐다: 다른 가구는 같은 이름을 쓸 수 있고, 같은 가구는 못 쓴다", async () => {
    const db = drizzle();
    await createPreMigrationSchema(db);
    const { householdId } = await migrateHouseholds(db, {});

    // 같은 가구 내에서 같은 카테고리명은 여전히 막힌다.
    await expect(
      db.execute(sql`INSERT INTO budget_categories (household_id, name, kind, sort_order) VALUES (${householdId}, '식비', '변동비', 2)`)
    ).rejects.toThrow();

    // 다른 가구가 생기면 같은 이름을 쓸 수 있어야 한다(household_id 포함 unique로 바뀌었다는 증거).
    const otherHousehold = await db.execute(sql`INSERT INTO households (name) VALUES ('다른집') RETURNING id`);
    const otherHouseholdId = (otherHousehold as unknown as { rows: { id: string }[] }).rows[0].id;
    await expect(
      db.execute(sql`INSERT INTO budget_categories (household_id, name, kind, sort_order) VALUES (${otherHouseholdId}, '식비', '변동비', 1)`)
    ).resolves.toBeDefined();
  });
});
