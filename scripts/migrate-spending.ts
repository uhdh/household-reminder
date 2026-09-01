import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS category_mappings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      txn_type text NOT NULL,
      raw_category text NOT NULL,
      raw_subcategory text NOT NULL,
      std_category text NOT NULL,
      CONSTRAINT category_mappings_txn_type_raw_category_raw_subcategory_unique UNIQUE (txn_type, raw_category, raw_subcategory)
    );
  `);
  console.log("category_mappings 테이블 준비 완료");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS category_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      txn_type text NOT NULL,
      payment_method text NOT NULL,
      std_category text NOT NULL,
      CONSTRAINT category_rules_txn_type_payment_method_unique UNIQUE (txn_type, payment_method)
    );
  `);
  await db.execute(sql`
    INSERT INTO category_rules (txn_type, payment_method, std_category)
    VALUES ('지출', 'MG생활비통장', '대출원리금')
    ON CONFLICT (txn_type, payment_method) DO UPDATE SET std_category = EXCLUDED.std_category;
  `);
  const ruleApplied = await db.execute(sql`
    UPDATE transactions
    SET std_category = '대출원리금'
    WHERE txn_type = '지출' AND payment_method = 'MG생활비통장';
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS category_keyword_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      txn_type text NOT NULL,
      keyword text NOT NULL UNIQUE,
      std_category text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  console.log("category_keyword_rules 테이블 준비 완료");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL UNIQUE,
      kind text NOT NULL,
      sort_order numeric(6, 0) NOT NULL DEFAULT 0,
      monthly_budget numeric(18, 2)
    );
  `);
  console.log("budget_categories 테이블 준비 완료");

  await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS std_category text;`);
  await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS included boolean NOT NULL DEFAULT true;`);
  await db.execute(
    sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_internal_transfer boolean NOT NULL DEFAULT false;`
  );
  await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS beneficiary text;`);
  const backfilled = await db.execute(
    sql`UPDATE transactions SET beneficiary = person_id WHERE beneficiary IS NULL;`
  );
  await db.execute(sql`ALTER TABLE transactions ALTER COLUMN beneficiary SET NOT NULL;`);
  console.log("transactions 파생 컬럼 추가 및 백필 완료:", backfilled.rowCount ?? backfilled, "행");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
