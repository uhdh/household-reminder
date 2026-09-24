import { and, eq, inArray, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules, transactions } from "@/lib/finance-db";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import { buildMappingIndex, buildRuleIndex, computeIncluded, isTransferCandidate, mapStdCategory } from "@/lib/spending-derive";

/** ILIKE 패턴에 쓸 문자열에서 %, _, \(와일드카드/이스케이프 특수문자)를 리터럴로 이스케이프한다. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** rederiveTransactions의 결과 요약. */
export interface RederiveSummary {
  /** 실제로 UPDATE된 행 수(std_category 또는 included 중 하나라도 바뀐 행) */
  changed: number;
  /** std_category 값 자체가 바뀐 행 수(분류가 바뀐 건수) */
  categoryChanged: number;
  /** 미분류(null)였다가 분류된 행 수 */
  reclassified: number;
  /** 집계 포함 여부(included)가 바뀐 행 수 */
  includedChanged: number;
}

const UPDATE_CHUNK_SIZE = 500;

/**
 * 가구의 매핑/결제수단 규칙/키워드 규칙을 다시 읽어, candidateFilter에 걸리는 거래 중
 * 사용자가 직접 고치지 않은(category_locked=false) 것만 mapStdCategory 우선순위대로 재계산한다.
 * 매핑·규칙의 추가/수정/삭제 후 영향받는 거래를 일괄 갱신하는 공용 함수 - 값이 실제로 바뀐
 * 행만 UPDATE하며, household_id로 항상 스코프를 건다.
 * 대량(수만 건) 재계산을 위해, 바뀐 행을 (새 std_category, 새 included) 조합별로 묶어
 * UPDATE ... WHERE id IN (...) 배치(청크 500)로 실행한다 - 행마다 UPDATE하는 것보다 훨씬 빠르다.
 */
export async function rederiveTransactions(db: AppDb, householdId: string, candidateFilter?: SQL): Promise<RederiveSummary> {
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

  // (새 std_category, 새 included) 조합별로 바뀐 행의 id를 묶는다. std_category는 null일 수
  // 있어 Map 키에 그대로 못 쓰므로, 널을 구분 가능한 리터럴로 치환해 키를 만든다.
  const buckets = new Map<string, { stdCategory: string | null; included: boolean; ids: string[] }>();
  let categoryChanged = 0;
  let reclassified = 0;
  let includedChanged = 0;

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
      if (stdCategory !== row.stdCategory) {
        categoryChanged++;
        if (row.stdCategory === null && stdCategory !== null) reclassified++;
      }
      if (included !== row.included) includedChanged++;

      const key = `${stdCategory ?? "\u0000"}|${included}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { stdCategory, included, ids: [] };
        buckets.set(key, bucket);
      }
      bucket.ids.push(row.id);
    }
  }

  let changed = 0;
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.ids.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = bucket.ids.slice(i, i + UPDATE_CHUNK_SIZE);
      await db
        .update(transactions)
        .set({ stdCategory: bucket.stdCategory, included: bucket.included })
        .where(and(eq(transactions.householdId, householdId), inArray(transactions.id, chunk)));
      changed += chunk.length;
    }
  }

  return { changed, categoryChanged, reclassified, includedChanged };
}
