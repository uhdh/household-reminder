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

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, type AppDb } from "../lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules, households, transactions } from "../lib/finance-db";
import type { ParsedTransaction } from "../lib/finance-parse/types";
import { buildMappingIndex, buildRuleIndex, mapStdCategory } from "../lib/spending-derive";

const OUR_HOUSEHOLD_NAME = "우리집";

// lib/spending-derive.ts에서 빼낸, "우리집" 전용이었던 하드코딩 규칙. 코드에서는 지우고
// category_keyword_rules로 이관한다(다른 가구 데이터에는 절대 영향을 주지 않는다).
const INSURANCE_KEYWORDS = ["11삼생", "DB생", "삼성생보험금"];
// 원래 TRANSFER_DESCRIPTION_PATTERNS였던 정규식(Postgres ~ 연산자 문법으로 그대로 사용 가능).
const TRANSFER_REGEXES = ["문.*롬", "서울우유급여"];

type HouseholdAggregate = { count: number; includedSum: number };

async function aggregateByHousehold(db: AppDb): Promise<Map<string, HouseholdAggregate>> {
  const rows = await db
    .select({ householdId: transactions.householdId, amount: transactions.amount, included: transactions.included })
    .from(transactions);
  const map = new Map<string, HouseholdAggregate>();
  for (const row of rows) {
    const entry = map.get(row.householdId) ?? { count: 0, includedSum: 0 };
    entry.count += 1;
    if (row.included) entry.includedSum += Math.abs(Number(row.amount));
    map.set(row.householdId, entry);
  }
  return map;
}

async function upsertOurHouseholdKeywordRules(db: AppDb, householdId: string) {
  for (const keyword of INSURANCE_KEYWORDS) {
    await db
      .insert(categoryKeywordRules)
      .values({ householdId, txnType: "전체", keyword, stdCategory: "보험" })
      .onConflictDoUpdate({
        target: [categoryKeywordRules.householdId, categoryKeywordRules.keyword],
        set: { stdCategory: "보험", txnType: "전체" },
      });
  }
  console.log(`"${OUR_HOUSEHOLD_NAME}" 보험 키워드 규칙 ${INSURANCE_KEYWORDS.length}건 준비 완료`);

  // distinct description마다 {이체, 그 description, "자산수정"} 키워드 규칙을 만든다.
  // 설명 원문은 개인 거래 내역이라 콘솔에 출력하지 않고 건수만 남긴다.
  const matched = await db.execute(
    sql`SELECT DISTINCT description FROM transactions
        WHERE household_id = ${householdId} AND txn_type = '이체' AND description IS NOT NULL
          AND (description ~ ${TRANSFER_REGEXES[0]} OR description ~ ${TRANSFER_REGEXES[1]})`
  );
  const descriptions = ((matched as unknown as { rows: { description: string }[] }).rows ?? []).map((r) => r.description);
  for (const description of descriptions) {
    await db
      .insert(categoryKeywordRules)
      .values({ householdId, txnType: "이체", keyword: description, stdCategory: "자산수정" })
      .onConflictDoUpdate({
        target: [categoryKeywordRules.householdId, categoryKeywordRules.keyword],
        set: { stdCategory: "자산수정", txnType: "이체" },
      });
  }
  console.log(`"${OUR_HOUSEHOLD_NAME}" 이체 제외 키워드 규칙 ${descriptions.length}건 준비 완료`);
}

/** 모든 가구를 돌며, 현재 규칙으로 다시 계산한 stdCategory가 저장된 값과 달라진(=과거에 수동으로
 * 고쳤던) 거래를 category_locked=true로 표시한다. 저장값이 null인 행(원래 미분류)은 건드리지 않는다
 * - 그런 행은 그대로 자동 분류 대상으로 남아야 하기 때문이다. */
async function lockManualOverrides(db: AppDb): Promise<number> {
  const householdRows = await db.select({ id: households.id }).from(households);

  let locked = 0;
  for (const { id: householdId } of householdRows) {
    const [mappingRows, ruleRows, keywordRuleRows] = await Promise.all([
      db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId)),
      db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
      db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId)),
    ]);
    const mappingIndex = buildMappingIndex(mappingRows);
    const ruleIndex = buildRuleIndex(ruleRows);

    const txnRows = await db
      .select({
        id: transactions.id,
        txnType: transactions.txnType,
        category: transactions.category,
        subcategory: transactions.subcategory,
        description: transactions.description,
        amount: transactions.amount,
        paymentMethod: transactions.paymentMethod,
        stdCategory: transactions.stdCategory,
      })
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), isNotNull(transactions.stdCategory)));

    for (const row of txnRows) {
      const pseudo: ParsedTransaction = {
        txnDate: "1970-01-01",
        txnTime: null,
        txnType: row.txnType as ParsedTransaction["txnType"],
        category: row.category,
        subcategory: row.subcategory,
        description: row.description,
        amount: Number(row.amount),
        paymentMethod: row.paymentMethod,
      };
      const computed = mapStdCategory(pseudo, mappingIndex, ruleIndex, keywordRuleRows);
      if (computed !== row.stdCategory) {
        await db.update(transactions).set({ categoryLocked: true }).where(eq(transactions.id, row.id));
        locked++;
      }
    }
  }
  return locked;
}

function reportVerification(before: Map<string, HouseholdAggregate>, after: Map<string, HouseholdAggregate>) {
  const householdIds = new Set([...before.keys(), ...after.keys()]);
  for (const householdId of householdIds) {
    const b = before.get(householdId) ?? { count: 0, includedSum: 0 };
    const a = after.get(householdId) ?? { count: 0, includedSum: 0 };
    const unchanged = b.count === a.count && b.includedSum === a.includedSum;
    console.log(`가구 ${householdId}: transactions ${a.count}건, included 합계 ${unchanged ? "변동 없음" : "변동 있음"}`);
  }
}

export async function migrateCategoryLock(db: AppDb) {
  // a) 컬럼 추가(멱등)
  await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_locked boolean NOT NULL DEFAULT false`);
  console.log("category_locked 컬럼 준비 완료");

  const before = await aggregateByHousehold(db);

  // b) "우리집" 전용 키워드 규칙 이관
  const [ourHousehold] = await db.select({ id: households.id }).from(households).where(eq(households.name, OUR_HOUSEHOLD_NAME)).limit(1);
  if (ourHousehold) {
    await upsertOurHouseholdKeywordRules(db, ourHousehold.id);
  } else {
    console.log(`가구 "${OUR_HOUSEHOLD_NAME}"를 찾지 못해 b) 단계를 건너뜁니다.`);
  }

  // c) 과거 수동 수정 보존(모든 가구)
  const lockedCount = await lockManualOverrides(db);
  console.log(`과거 수동 수정 보존(잠금) ${lockedCount}건`);

  // d) 검증: 이 스크립트는 std_category/included를 직접 바꾸지 않으므로(컬럼 추가·규칙 upsert·
  // category_locked 표시만 함) 전후 집계가 항상 같아야 한다.
  const after = await aggregateByHousehold(db);
  reportVerification(before, after);
}

async function main() {
  const db = getDb();
  await migrateCategoryLock(db);
}

// vitest에서 migrateCategoryLock()만 import할 때는 실행하지 않고, `tsx scripts/migrate-category-lock.ts`로
// 직접 실행할 때만 돈다(migrate-households.ts와 동일한 패턴).
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/migrate-category-lock.ts")) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
