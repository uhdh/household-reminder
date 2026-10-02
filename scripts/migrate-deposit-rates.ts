// 현금·예적금 계좌별 금리(deposit_rates) 테이블 추가.
// 기본은 미리보기(존재 여부만 확인). 실제 반영: npx tsx scripts/migrate-deposit-rates.ts --apply
// CREATE TABLE IF NOT EXISTS라 여러 번 실행해도 결과가 같다.
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[trimmed.slice(0, eqIdx).trim()] = val;
    }
  }
}

import { sql } from "drizzle-orm";
import { getDb } from "../lib/db";

async function main() {
  const db = getDb();
  const apply = process.argv.includes("--apply");
  const existing = await db.execute(sql`SELECT to_regclass('public.deposit_rates') AS t`);
  const exists = Boolean((existing.rows[0] as { t: string | null }).t);
  console.log(`deposit_rates 테이블: ${exists ? "있음" : "없음"}`);
  if (!apply) {
    console.log("미리보기만 했습니다. 반영하려면 --apply");
    return;
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS deposit_rates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households(id),
      person_id text NOT NULL,
      product_name text NOT NULL,
      rate_pct numeric(6, 3) NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (household_id, person_id, product_name)
    )`);
  console.log("deposit_rates 테이블 준비 완료");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
