import type { ParsedTransaction } from "@/lib/finance-parse/types";

export type CategoryMapping = {
  txnType: string;
  rawCategory: string;
  rawSubcategory: string;
  stdCategory: string;
};

export type DerivedResult = {
  stdCategory: string | null;
  included: boolean;
  isInternalTransfer: boolean;
};

// 원본 엑셀 M열 수식에서, 매핑표와 무관하게 특정 키워드가 포함된 거래는 항상 "보험"으로 분류한다.
const INSURANCE_KEYWORDS = ["11삼생", "DB생", "삼성생보험금"];

// 원본 엑셀 P열: 대분류가 아래 중 하나면 자기계좌이체 후보로 본다.
const TRANSFER_CATEGORY_KEYWORDS = new Set(["카드대금", "저축", "투자", "현금", "내계좌이체"]);
// 이체 후보라도 저축/투자/현금으로 분류된 건은, 매칭되는 반대쪽 거래가 없으면 그대로 수입/지출로 집계한다.
const SAVINGS_LIKE_CATEGORIES = new Set(["저축", "투자", "현금"]);
// 원본 엑셀 P열에서 대분류와 무관하게 자기계좌이체 후보로 취급하던 설명 키워드/패턴
const TRANSFER_DESCRIPTION_PATTERNS: RegExp[] = [
  /문.*롬/,
  /세금환급/,
  /예적금신규/,
  /통장\s*개설/,
  /서울우유급여/,
];

function mapKey(txnType: string, rawCategory: string, rawSubcategory: string) {
  return `${txnType}|${rawCategory}|${rawSubcategory}`;
}

export function buildMappingIndex(mappings: CategoryMapping[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const m of mappings) {
    idx.set(mapKey(m.txnType, m.rawCategory, m.rawSubcategory), m.stdCategory);
  }
  return idx;
}

export function mapStdCategory(
  txn: ParsedTransaction,
  mappingIndex: Map<string, string>
): string | null {
  const description = txn.description ?? "";
  if (INSURANCE_KEYWORDS.some((kw) => description.includes(kw))) return "보험";
  const rawCategory = txn.category ?? "미분류";
  const rawSubcategory = txn.subcategory ?? "미분류";
  return mappingIndex.get(mapKey(txn.txnType, rawCategory, rawSubcategory)) ?? null;
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
  mappingIndex: Map<string, string>
): DerivedResult[] {
  const matched = matchSelfTransferPairs(transactions);
  return transactions.map((txn, i) => {
    const isTransferCand = isTransferCandidate(txn);
    const isMatchedPair = matched[i];
    return {
      stdCategory: mapStdCategory(txn, mappingIndex),
      included: computeIncluded(txn, isTransferCand, isMatchedPair),
      isInternalTransfer: isMatchedPair,
    };
  });
}
