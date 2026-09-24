// 가구 이전 전후 비교용 읽기 전용 스냅샷: 테이블별 행 수와 금액 합계만 출력한다(개별 거래 내용은 출력하지 않음).
// 사용: node scripts/snapshot-finance.mjs  (.env.local의 DATABASE_URL 사용)
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);

const tables = ["people", "uploads", "asset_items", "transactions", "allocation_targets", "category_mappings", "category_rules", "category_keyword_rules", "budget_categories"];
const out = {};
for (const t of tables) out[t] = Number((await sql.query(`select count(*)::int as n from ${t}`))[0].n);
const [tx] = await sql`select coalesce(sum(amount),0)::text as all_sum, coalesce(sum(amount) filter (where included),0)::text as included_sum, count(*) filter (where std_category is null)::int as unmapped from transactions`;
const [as] = await sql`select coalesce(sum(a.amount),0)::text as active_asset_sum from asset_items a join uploads u on u.id = a.upload_id where u.is_active`;
out.transactions_sum = tx.all_sum;
out.transactions_included_sum = tx.included_sum;
out.transactions_unmapped = tx.unmapped;
out.active_asset_sum = as.active_asset_sum;
console.log(JSON.stringify(out, null, 1));
