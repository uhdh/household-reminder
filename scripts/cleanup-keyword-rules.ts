// 실데이터 분석(scripts/analyze-category-strategies.ts)에서 사용자가 고친 결과와 충돌한 키워드 규칙을 지운다.
// 지우기 전에, 그 규칙에 걸려 지금 분류돼 있는 잠기지 않은 거래를 현재 값 그대로 잠가서 기존 분류가 바뀌지 않게 한다.
// 기본은 미리보기(읽기만). 실제 반영: npx tsx scripts/cleanup-keyword-rules.ts --apply
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

import { and, eq, ilike, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { categoryKeywordRules, transactions } from "../lib/finance-db";
import { escapeIlikePattern } from "../lib/rederive-transactions";

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? "a1f94fe6-44b6-4a58-ab1a-6433606e3d86";
const APPLY = process.argv.includes("--apply");
const RULES_TO_DELETE = ["이니시스(빌링_일반)", "코스트코", "흥화", "삼성생보험금"];

async function main() {
  const db = getDb();
  const rules = await db
    .select()
    .from(categoryKeywordRules)
    .where(and(eq(categoryKeywordRules.householdId, HOUSEHOLD_ID), inArray(categoryKeywordRules.keyword, RULES_TO_DELETE)));
  console.log(`${APPLY ? "[적용]" : "[미리보기]"} 삭제 대상 규칙 ${rules.length}개`);

  for (const rule of rules) {
    const typeFilter = rule.txnType !== "전체" ? eq(transactions.txnType, rule.txnType) : undefined;
    const matched = await db
      .select({ id: transactions.id, stdCategory: transactions.stdCategory, categoryLocked: transactions.categoryLocked })
      .from(transactions)
      .where(and(eq(transactions.householdId, HOUSEHOLD_ID), typeFilter, ilike(transactions.description, `%${escapeIlikePattern(rule.keyword)}%`)));
    const toLock = matched.filter((t) => !t.categoryLocked && t.stdCategory !== null).map((t) => t.id);
    console.log(`  '${rule.keyword}'(${rule.txnType}) → ${rule.stdCategory}: 걸리는 거래 ${matched.length}건, 현재 분류 그대로 잠글 거래 ${toLock.length}건`);

    if (!APPLY) continue;
    for (let i = 0; i < toLock.length; i += 500) {
      await db
        .update(transactions)
        .set({ categoryLocked: true })
        .where(and(eq(transactions.householdId, HOUSEHOLD_ID), inArray(transactions.id, toLock.slice(i, i + 500))));
    }
    await db.delete(categoryKeywordRules).where(and(eq(categoryKeywordRules.householdId, HOUSEHOLD_ID), eq(categoryKeywordRules.id, rule.id)));
  }
  console.log(APPLY ? "완료: 거래를 잠근 뒤 규칙을 삭제했습니다." : "미리보기만 했습니다(변경 없음).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
