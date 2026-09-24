import { and, eq, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules, transactions } from "@/lib/finance-db";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import { buildMappingIndex, buildRuleIndex, computeIncluded, isTransferCandidate, mapStdCategory } from "@/lib/spending-derive";

/** ILIKE 패턴에 쓸 문자열에서 %, _, \(와일드카드/이스케이프 특수문자)를 리터럴로 이스케이프한다. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 가구의 매핑/결제수단 규칙/키워드 규칙을 다시 읽어, candidateFilter에 걸리는 거래 중
 * 사용자가 직접 고치지 않은(category_locked=false) 것만 mapStdCategory 우선순위대로 재계산한다.
 * 매핑·규칙의 추가/수정/삭제 후 영향받는 거래를 일괄 갱신하는 공용 함수 - 값이 실제로 바뀐
 * 행만 UPDATE하며, household_id로 항상 스코프를 건다. 바뀐 행 수를 반환한다.
 */
export async function rederiveTransactions(db: AppDb, householdId: string, candidateFilter?: SQL): Promise<number> {
  const [mappingRows, ruleRows, keywordRuleRows] = await Promise.all([
    db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
    db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId)),
  ]);
  const mappingIndex = buildMappingIndex(mappingRows);
  const ruleIndex = buildRuleIndex(ruleRows);

  const candidates = await db
    .select({
      id: transactions.id,
      txnType: transactions.txnType,
      category: transactions.category,
      subcategory: transactions.subcategory,
      description: transactions.description,
      amount: transactions.amount,
      paymentMethod: transactions.paymentMethod,
      stdCategory: transactions.stdCategory,
      included: transactions.included,
      isInternalTransfer: transactions.isInternalTransfer,
    })
    .from(transactions)
    .where(and(eq(transactions.householdId, householdId), eq(transactions.categoryLocked, false), candidateFilter));

  let changed = 0;
  for (const row of candidates) {
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
    const stdCategory = mapStdCategory(pseudo, mappingIndex, ruleIndex, keywordRuleRows);
    const included = stdCategory !== "자산수정" && computeIncluded(pseudo, isTransferCandidate(pseudo), row.isInternalTransfer);

    if (stdCategory !== row.stdCategory || included !== row.included) {
      await db.update(transactions).set({ stdCategory, included }).where(eq(transactions.id, row.id));
      changed++;
    }
  }
  return changed;
}
