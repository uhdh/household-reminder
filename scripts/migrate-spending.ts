import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

// transactions 테이블에 이미 실 데이터가 있어 drizzle-kit push가 beneficiary NOT NULL
// 추가를 대화형으로 확인받으려 하므로(비대화형 환경에서 불가), 기존 행은 person_id로
// 백필하는 수동 마이그레이션을 한 번 실행한다.
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
