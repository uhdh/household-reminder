import { and, eq, inArray, isNotNull, not, type SQL } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules, transactions } from "@/lib/finance-db";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import {
  buildMappingIndex,
  buildMerchantMemory,
  buildRawCategoryFallback,
  buildRuleIndex,
  computeIncluded,
  isTransferCandidate,
  mapStdCategory,
  type CategoryKeywordRule,
  type MerchantMemoryIndex,
  type RawCategoryFallbackIndex,
} from "@/lib/spending-derive";

/** ILIKE 패턴에 쓸 문자열에서 %, _, \(와일드카드/이스케이프 특수문자)를 리터럴로 이스케이프한다. */
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** A→B 분류 변화 하나와 그 건수. null은 "미분류"로 표시한다(rederive-card 미리보기용). */
export interface CategoryTransition {
  from: string | null;
  to: string | null;
  count: number;
}

/** rederiveTransactions의 결과 요약. */
export interface RederiveSummary {
  /** 실제로 UPDATE된(또는 dryRun이면 UPDATE됐을) 행 수(std_category 또는 included 중 하나라도 바뀐 행) */
  changed: number;
  /** std_category 값 자체가 바뀐 행 수(분류가 바뀐 건수) */
  categoryChanged: number;
  /** 미분류(null)였다가 분류된 행 수 */
  reclassified: number;
  /** 집계 포함 여부(included)가 바뀐 행 수 */
  includedChanged: number;
  /** 건수 많은 순 상위 분류 변화(최대 8개). 미리보기 화면에서 "A → B (n건)"으로 보여준다. */
  transitions: CategoryTransition[];
}

const UPDATE_CHUNK_SIZE = 500;
const TOP_TRANSITIONS = 8;

export interface CategoryDerivationContext {
  mappingIndex: Map<string, string>;
  ruleIndex: Map<string, string>;
  keywordRules: CategoryKeywordRule[];
  merchantMemory: MerchantMemoryIndex;
  rawFallback: RawCategoryFallbackIndex;
}

/**
 * 매핑/결제수단 규칙/키워드 규칙과, mapStdCategory의 새 우선순위 단계인 가맹점 기억·원본 조합
 * 다수결 폴백까지 이 가구 데이터로 한 번에 읽어 mapStdCategory에 그대로 넘길 수 있게 묶는다.
 * 업로드(뱅크샐러드/서울페이 저장 로직)와 rederiveTransactions가 공통으로 쓴다.
 *
 * excludeFromFallback: rederiveTransactions가 지금 막 재계산하려는 후보 행(category_locked=false AND
 * candidateFilter)들을 그대로 넘겨준다. 이 후보들은 아직 재계산 전이라 std_category가 "곧 바뀔 예정인
 * 옛 값"을 들고 있는데, 원본 조합 폴백 집계에 자기 자신의 옛 값이 섞이면 매핑을 지워도 스스로를
 * 근거로 옛 분류를 재확인해버려(자기참조) 절대 미분류로 못 돌아가는 문제가 생긴다. 그래서 이
 * 조건에 해당하는 행은 폴백 집계에서 제외한다 - locked 행(가맹점 기억과 동일한 안정된 근거)이나
 * 이번에 안 건드리는 다른 행은 계속 신뢰할 수 있는 근거로 남는다. 업로드 경로는 아직 DB에 없는
 * 새 행을 분류하는 것이라 자기참조가 애초에 불가능하므로 생략(undefined)해도 된다.
 */
export async function loadCategoryDerivationContext(
  db: AppDb,
  householdId: string,
  options: { excludeFromFallback?: SQL } = {}
): Promise<CategoryDerivationContext> {
  const fallbackWhere = options.excludeFromFallback
    ? and(eq(transactions.householdId, householdId), isNotNull(transactions.stdCategory), not(options.excludeFromFallback))
    : and(eq(transactions.householdId, householdId), isNotNull(transactions.stdCategory));

  const [mappingRows, ruleRows, keywordRuleRows, memorySourceRows, fallbackSourceRows] = await Promise.all([
    db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
    db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId)),
    db
      .select({
        description: transactions.description,
        txnType: transactions.txnType,
        stdCategory: transactions.stdCategory,
        categoryLocked: transactions.categoryLocked,
        category: transactions.category,
        subcategory: transactions.subcategory,
      })
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.categoryLocked, true))),
    db
      .select({
        txnType: transactions.txnType,
        category: transactions.category,
        subcategory: transactions.subcategory,
        stdCategory: transactions.stdCategory,
      })
      .from(transactions)
      .where(fallbackWhere),
  ]);

  return {
    mappingIndex: buildMappingIndex(mappingRows),
    ruleIndex: buildRuleIndex(ruleRows),
    keywordRules: keywordRuleRows,
    merchantMemory: buildMerchantMemory(memorySourceRows),
    rawFallback: buildRawCategoryFallback(fallbackSourceRows),
  };
}

/**
 * 가구의 매핑/결제수단 규칙/키워드 규칙(+가맹점 기억/원본 조합 폴백)을 다시 읽어, candidateFilter에
 * 걸리는 거래 중 사용자가 직접 고치지 않은(category_locked=false) 것만 mapStdCategory 우선순위대로
 * 재계산한다. 매핑·규칙의 추가/수정/삭제 후 영향받는 거래를 일괄 갱신하는 공용 함수 - 값이 실제로
 * 바뀐 행만 UPDATE하며, household_id로 항상 스코프를 건다. options.dryRun이면 변경 내역만 계산하고
 * 실제 UPDATE는 건너뛴다(rederive-card의 "변경 미리보기").
 * 대량(수만 건) 재계산을 위해, 바뀐 행을 (새 std_category, 새 included) 조합별로 묶어
 * UPDATE ... WHERE id IN (...) 배치(청크 500)로 실행한다 - 행마다 UPDATE하는 것보다 훨씬 빠르다.
 *
 * 순서 계약: 이 함수는 std_category/included만 다시 계산하고 is_internal_transfer는 그대로
 * 읽기만 한다(절대 바꾸지 않는다) - applyHouseholdTransferPairs(가구 단위 계좌이동 짝짓기)가
 * 표시해 둔 상태를 절대 되돌리지 않기 위해서다. 따라서 항상 이 함수를 먼저 실행하고
 * applyHouseholdTransferPairs를 그 다음에 실행해야 한다(반대로 하면 안 됨).
 */
export async function rederiveTransactions(
  db: AppDb,
  householdId: string,
  candidateFilter?: SQL,
  options: { dryRun?: boolean } = {}
): Promise<RederiveSummary> {
  // "이 행이 이번에 재계산될 후보인가"를 한 번만 정의해 후보 조회와 폴백 집계 제외(자기참조
  // 방지) 양쪽에 그대로 재사용한다.
  const isCandidateCondition = and(eq(transactions.categoryLocked, false), candidateFilter);
  const { mappingIndex, ruleIndex, keywordRules, merchantMemory, rawFallback } = await loadCategoryDerivationContext(db, householdId, {
    excludeFromFallback: isCandidateCondition,
  });

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
    .where(and(eq(transactions.householdId, householdId), isCandidateCondition));

  // (새 std_category, 새 included) 조합별로 바뀐 행의 id를 묶는다. std_category는 null일 수
  // 있어 Map 키에 그대로 못 쓰므로, 널을 구분 가능한 리터럴로 치환해 키를 만든다.
  const buckets = new Map<string, { stdCategory: string | null; included: boolean; ids: string[] }>();
  const transitionTally = new Map<string, { from: string | null; to: string | null; count: number }>();
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
    const stdCategory = mapStdCategory(pseudo, mappingIndex, ruleIndex, keywordRules, { merchantMemory, rawFallback });
    const included = stdCategory !== "자산수정" && computeIncluded(pseudo, isTransferCandidate(pseudo), row.isInternalTransfer);

    if (stdCategory !== row.stdCategory || included !== row.included) {
      if (stdCategory !== row.stdCategory) {
        categoryChanged++;
        if (row.stdCategory === null && stdCategory !== null) reclassified++;

        const transitionKey = `${row.stdCategory ?? "\u0000"}>${stdCategory ?? "\u0000"}`;
        const transition = transitionTally.get(transitionKey) ?? { from: row.stdCategory, to: stdCategory, count: 0 };
        transition.count++;
        transitionTally.set(transitionKey, transition);
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
  if (!options.dryRun) {
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
  } else {
    changed = [...buckets.values()].reduce((sum, bucket) => sum + bucket.ids.length, 0);
  }

  const transitions = [...transitionTally.values()].sort((a, b) => b.count - a.count).slice(0, TOP_TRANSITIONS);

  return { changed, categoryChanged, reclassified, includedChanged, transitions };
}
