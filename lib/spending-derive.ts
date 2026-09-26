import type { ParsedTransaction } from "@/lib/finance-parse/types";
import { isVoucherPurchaseRecord } from "@/lib/voucher-exclusion";

export type CategoryMapping = {
  txnType: string;
  rawCategory: string;
  rawSubcategory: string;
  stdCategory: string;
};

export type CategoryRule = {
  txnType: string;
  paymentMethod: string;
  stdCategory: string;
};

export type CategoryKeywordRule = {
  txnType: string;
  keyword: string;
  stdCategory: string;
};

export type DerivedResult = {
  stdCategory: string | null;
  included: boolean;
  isInternalTransfer: boolean;
};

export function suggestKeywordFromDescription(desc: string | null | undefined): string {
  if (!desc) return "";
  let clean = desc.trim();
  clean = clean.replace(/^(\(주\)|주식회사|\(유\))\s*/i, "");
  clean = clean.replace(/(_나이스|_KCP|_KICC|_KG이니시스|_카카오페이|_토스|\(자동납부\)|_배민페이|_알뜰배달).*$/i, "");
  return clean.trim() || desc.trim();
}

// 특정 가구에만 해당하는 규칙(보험 가입사명, 특정 급여 이체처 등)은 하드코딩하지 않고
// category_keyword_rules(가구별 키워드 규칙)로 관리한다. 여기 남기는 것은 모든 가구에 공통되는 것만.
const SALARY_KEYWORDS = ["급여", "월급"];

// 원본 엑셀 P열: 대분류가 아래 중 하나면 자기계좌이체 후보로 본다.
const TRANSFER_CATEGORY_KEYWORDS = new Set(["카드대금", "저축", "투자", "현금", "내계좌이체"]);
// 이체 후보라도 저축/투자/현금으로 분류된 건은, 매칭되는 반대쪽 거래가 없으면 그대로 수입/지출로 집계한다.
const SAVINGS_LIKE_CATEGORIES = new Set(["저축", "투자", "현금"]);
// 원본 엑셀 P열에서 대분류와 무관하게 자기계좌이체 후보로 취급하던 설명 키워드/패턴(모든 가구 공통분만)
const TRANSFER_DESCRIPTION_PATTERNS: RegExp[] = [
  /세금환급/,
  /예적금신규/,
  /통장\s*개설/,
];

function mapKey(txnType: string, rawCategory: string, rawSubcategory: string) {
  return `${txnType}|${rawCategory}|${rawSubcategory}`;
}

function ruleKey(txnType: string, paymentMethod: string) {
  return `${txnType}|${paymentMethod}`;
}

function memoryKey(merchantKey: string, txnType: string) {
  return `${merchantKey}|${txnType}`;
}

export function buildRuleIndex(rules: CategoryRule[]): Map<string, string> {
  return new Map(rules.map((rule) => [ruleKey(rule.txnType, rule.paymentMethod), rule.stdCategory]));
}

export function buildMappingIndex(mappings: CategoryMapping[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const m of mappings) {
    idx.set(mapKey(m.txnType, m.rawCategory, m.rawSubcategory), m.stdCategory);
  }
  return idx;
}

// 가맹점 기억/원본 조합 다수결 폴백 둘 다 "이 표준카테고리가 전체의 80% 이상을 차지하는가"만
// 보면 되므로 집계 로직을 공유한다. 못 미더우면(과반이어도 80% 미만) null - 억지로 추측하지 않는다.
const DOMINANCE_THRESHOLD = 0.8;

function dominantCategory(byCategory: Map<string, number>): string | null {
  let total = 0;
  let bestCategory: string | null = null;
  let bestCount = 0;
  for (const [category, count] of byCategory) {
    total += count;
    if (count > bestCount) {
      bestCount = count;
      bestCategory = category;
    }
  }
  return bestCategory !== null && bestCount / total >= DOMINANCE_THRESHOLD ? bestCategory : null;
}

export type MerchantMemoryIndex = Map<string, string>; // key: `${suggestKeywordFromDescription(description)}|${txnType}`
export type RawCategoryFallbackIndex = Map<string, string>; // key: mapKey(txnType, rawCategory, rawSubcategory)와 동일

export type MerchantMemorySourceRow = {
  description: string | null;
  txnType: string;
  stdCategory: string | null;
  categoryLocked: boolean;
  category: string | null;
  subcategory: string | null;
};

/**
 * "가맹점 기억": 사용자가 직접 고쳐서 잠근(category_locked=true) 거래들에서, (가맹점 키, 거래유형)별로
 * 표준카테고리가 압도적으로(80% 이상) 일치하면 그 값을 기억해 둔다. 서울페이 상품권 구매 장부
 * 행(isVoucherPurchaseRecord)은 항상 '자산수정'으로 고정 잠금된 것일 뿐 사용자가 실제로 분류를
 * "고른" 게 아니므로 학습 대상에서 제외한다.
 */
export function buildMerchantMemory(rows: MerchantMemorySourceRow[]): MerchantMemoryIndex {
  const tally = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.categoryLocked || !row.stdCategory) continue;
    if (isVoucherPurchaseRecord(row)) continue;
    const merchantKey = suggestKeywordFromDescription(row.description);
    if (!merchantKey) continue;
    const key = memoryKey(merchantKey, row.txnType);
    const byCategory = tally.get(key) ?? new Map<string, number>();
    byCategory.set(row.stdCategory, (byCategory.get(row.stdCategory) ?? 0) + 1);
    tally.set(key, byCategory);
  }

  const memory: MerchantMemoryIndex = new Map();
  for (const [key, byCategory] of tally) {
    const winner = dominantCategory(byCategory);
    if (winner) memory.set(key, winner);
  }
  return memory;
}

export type RawCategoryFallbackSourceRow = {
  txnType: string;
  category: string | null;
  subcategory: string | null;
  stdCategory: string | null;
};

/**
 * 매핑 테이블에 없는 (거래유형, 원본 대분류, 원본 소분류) 조합도, 이 가구에서 이미 분류된(잠겼든
 * 자동 매핑됐든 std_category가 있는) 거래들 중 같은 조합이 압도적으로(80% 이상) 같은 표준카테고리로
 * 쓰였다면 그 값을 최후의 폴백으로 쓴다.
 */
export function buildRawCategoryFallback(rows: RawCategoryFallbackSourceRow[]): RawCategoryFallbackIndex {
  const tally = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.stdCategory) continue;
    const key = mapKey(row.txnType, row.category ?? "미분류", row.subcategory ?? "미분류");
    const byCategory = tally.get(key) ?? new Map<string, number>();
    byCategory.set(row.stdCategory, (byCategory.get(row.stdCategory) ?? 0) + 1);
    tally.set(key, byCategory);
  }

  const fallback: RawCategoryFallbackIndex = new Map();
  for (const [key, byCategory] of tally) {
    const winner = dominantCategory(byCategory);
    if (winner) fallback.set(key, winner);
  }
  return fallback;
}

export type MapStdCategoryOptions = {
  merchantMemory?: MerchantMemoryIndex;
  rawFallback?: RawCategoryFallbackIndex;
};

export function mapStdCategory(
  txn: ParsedTransaction,
  mappingIndex: Map<string, string>,
  ruleIndex: Map<string, string> = new Map(),
  keywordRules: CategoryKeywordRule[] = [],
  options: MapStdCategoryOptions = {}
): string | null {
  const description = (txn.description ?? "").trim();

  // 1. 사용자 정의 키워드 규칙 (가맹점/적요 키워드 일치)
  for (const kr of keywordRules) {
    if (kr.txnType !== "전체" && kr.txnType !== txn.txnType) continue;
    if (kr.keyword && description.toLowerCase().includes(kr.keyword.toLowerCase())) {
      return kr.stdCategory;
    }
  }

  // 2. 결제수단 규칙
  const ruleCategory = ruleIndex.get(ruleKey(txn.txnType, txn.paymentMethod ?? ""));
  if (ruleCategory) return ruleCategory;

  // 3. 가맹점 기억(사용자가 과거 이 가맹점을 직접 분류해 잠근 이력)
  if (options.merchantMemory) {
    const merchantKey = suggestKeywordFromDescription(txn.description);
    const remembered = merchantKey ? options.merchantMemory.get(memoryKey(merchantKey, txn.txnType)) : undefined;
    if (remembered) return remembered;
  }

  // 4. 내장 키워드 규칙(모든 가구 공통분만; 가구별 규칙은 keywordRules로 관리)
  if (txn.txnType === "수입" && SALARY_KEYWORDS.some((kw) => description.includes(kw))) return "월급";

  // 5. 원본 엑셀 대분류/소분류 매핑
  const rawCategory = txn.category ?? "미분류";
  const rawSubcategory = txn.subcategory ?? "미분류";
  const mapped = mappingIndex.get(mapKey(txn.txnType, rawCategory, rawSubcategory));
  if (mapped) return mapped;

  // 6. 원본 조합 다수결 폴백(매핑에도 없는 조합을 이 가구의 기존 분류 이력으로 추정)
  if (options.rawFallback) {
    const fallback = options.rawFallback.get(mapKey(txn.txnType, rawCategory, rawSubcategory));
    if (fallback) return fallback;
  }

  return null;
}

export function isTransferCandidate(txn: ParsedTransaction): boolean {
  if (txn.txnType !== "이체") return false;
  const rawCategory = txn.category ?? "";
  if (TRANSFER_CATEGORY_KEYWORDS.has(rawCategory)) return true;
  const description = txn.description ?? "";
  return TRANSFER_DESCRIPTION_PATTERNS.some((re) => re.test(description));
}

function toTimestamp(date: string, time: string | null): number {
  return new Date(`${date}T${time ?? "00:00:00"}Z`).getTime();
}

function isFinanceTransferHint(txn: ParsedTransaction): boolean {
  const category = txn.category ?? "";
  const description = txn.description ?? "";
  return category.includes("금융") || /(입금|출금|이체)/.test(description);
}

/**
 * 원본 엑셀 Q~U열: 설명+절대금액이 같고 부호가 반대이며 발생 순번이 같은 짝을
 * ±3일 이내에서 찾아 자기계좌이체 쌍으로 표시한다. 거래 타입과 무관하게 전체
 * 배열을 대상으로 계산하며, 배열 순서(원본 시트 행 순서)를 그대로 유지해야
 * 엑셀의 COUNTIFS 누적 카운트와 동일한 결과가 나온다.
 */
export function matchSelfTransferPairs(transactions: ParsedTransaction[]): boolean[] {
  const n = transactions.length;
  const keys = transactions.map((t) => `${t.description ?? ""}|${Math.abs(t.amount)}`);
  const signs = transactions.map((t) => (t.amount >= 0 ? 1 : -1));

  const occurrenceIndex = new Array<number>(n);
  const seenCount = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const groupKey = `${keys[i]}|${signs[i]}`;
    const count = (seenCount.get(groupKey) ?? 0) + 1;
    seenCount.set(groupKey, count);
    occurrenceIndex[i] = count;
  }

  const timestamps = transactions.map((t) => toTimestamp(t.txnDate, t.txnTime));
  const isMatched = new Array<boolean>(n).fill(false);

  for (let i = 0; i < n; i++) {
    const wantSign = -signs[i];
    for (let j = 0; j < n; j++) {
      if (keys[j] !== keys[i]) continue;
      if (signs[j] !== wantSign) continue;
      if (occurrenceIndex[j] !== occurrenceIndex[i]) continue;
      const dayDiff = Math.abs(timestamps[i] - timestamps[j]) / 86_400_000;
      isMatched[i] = dayDiff <= 3;
      break;
    }
  }

  // 거래소·증권사 등에서 내 계좌로 옮길 때 수수료 때문에 양쪽 금액과 설명이
  // 조금 달라지는 경우를 보완한다. 같은 날 1시간 이내의 금융 거래 중 부호가
  // 반대이고 금액 차이가 0.5% 및 5만원 이내인 가장 가까운 한 쌍만 매칭한다.
  for (let i = 0; i < n; i++) {
    if (isMatched[i] || !isFinanceTransferHint(transactions[i])) continue;

    let bestIndex = -1;
    let bestTimeDiff = Number.POSITIVE_INFINITY;
    const amount = Math.abs(transactions[i].amount);

    for (let j = i + 1; j < n; j++) {
      if (isMatched[j] || signs[j] === signs[i] || !isFinanceTransferHint(transactions[j])) continue;

      const timeDiff = Math.abs(timestamps[i] - timestamps[j]);
      if (timeDiff > 60 * 60 * 1000) continue;

      const otherAmount = Math.abs(transactions[j].amount);
      const amountDiff = Math.abs(amount - otherAmount);
      const relativeDiff = amountDiff / Math.max(amount, otherAmount);
      if (amountDiff > 50_000 || relativeDiff > 0.005) continue;

      if (timeDiff < bestTimeDiff) {
        bestIndex = j;
        bestTimeDiff = timeDiff;
      }
    }

    if (bestIndex >= 0) {
      isMatched[i] = true;
      isMatched[bestIndex] = true;
    }
  }

  return isMatched;
}

// 원본 엑셀 O열: (이체 후보가 아니거나 저축/투자/현금) AND 매칭된 이체쌍이 아님 AND 금액 절대값이 100원 초과
export function computeIncluded(
  txn: ParsedTransaction,
  isTransferCand: boolean,
  isMatchedPair: boolean
): boolean {
  const rawCategory = txn.category ?? "";
  const overrideEligible = SAVINGS_LIKE_CATEGORIES.has(rawCategory);
  const passesTransferGate = !isTransferCand || overrideEligible;
  return passesTransferGate && !isMatchedPair && Math.abs(txn.amount) > 100;
}

export function deriveTransactionFields(
  transactions: ParsedTransaction[],
  mappingIndex: Map<string, string>,
  ruleIndex: Map<string, string> = new Map(),
  keywordRules: CategoryKeywordRule[] = [],
  options: MapStdCategoryOptions = {}
): DerivedResult[] {
  const matched = matchSelfTransferPairs(transactions);
  return transactions.map((txn, i) => {
    const isTransferCand = isTransferCandidate(txn);
    const isMatchedPair = matched[i];
    const stdCategory = mapStdCategory(txn, mappingIndex, ruleIndex, keywordRules, options);
    return {
      stdCategory,
      included: stdCategory !== "자산수정" && computeIncluded(txn, isTransferCand, isMatchedPair),
      isInternalTransfer: isMatchedPair,
    };
  });
}
