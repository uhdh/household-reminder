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

import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { households } from "../lib/finance-db";
import { BUDGET_CATEGORIES, CATEGORY_KEYWORD_RULES, CATEGORY_MAPPINGS, seedDefaultCategories } from "../lib/default-categories";

async function main() {
  const db = getDb();

  // 여러 가구 지원 후에는 scripts/migrate-households.ts를 먼저 돌려 "우리집" 가구가 있어야 한다.
  const [household] = await db.select({ id: households.id }).from(households).where(eq(households.name, "우리집")).limit(1);
  if (!household) throw new Error('가구 "우리집"이 없습니다. scripts/migrate-households.ts를 먼저 실행하세요.');

  await seedDefaultCategories(db, household.id);
  console.log(`카테고리 매핑 ${CATEGORY_MAPPINGS.length}건, 키워드 규칙 ${CATEGORY_KEYWORD_RULES.length}건, 예산 카테고리 ${BUDGET_CATEGORIES.length}건 시딩 완료`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
