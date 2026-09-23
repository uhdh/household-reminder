import { suggestKeywordFromDescription } from "@/lib/spending-derive";

// 카테고리 자동추천/자주 쓰는 카테고리/다음 미분류 찾기 등 순수 함수 모음.
// page.tsx에서 이미 불러온 거래 목록으로 서버에서 한 번만 계산해 클라이언트에 prop으로 내려준다.

export type MinimalTxn = {
  description: string | null;
  category: string | null;
  subcategory: string | null;
  stdCategory: string | null;
};

const EXCLUDED_FROM_FREQUENT = "자산수정";

// 가맹점 키(설명 정규화)별로 과거에 가장 많이 지정된 표준카테고리.
export function buildMerchantCategoryIndex(transactions: MinimalTxn[]): Record<string, string> {
  const tally: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (!t.stdCategory) continue;
    const key = suggestKeywordFromDescription(t.description);
    if (!key) continue;
    const byCategory = (tally[key] ??= {});
    byCategory[t.stdCategory] = (byCategory[t.stdCategory] ?? 0) + 1;
  }
  const top: Record<string, string> = {};
  for (const [key, byCategory] of Object.entries(tally)) {
    let bestCategory = "";
    let bestCount = 0;
    for (const [category, count] of Object.entries(byCategory)) {
      if (count > bestCount) {
        bestCount = count;
        bestCategory = category;
      }
    }
    if (bestCategory) top[key] = bestCategory;
  }
  return top;
}

// 원본 (대분류, 소분류) 조합별로 가장 많이 쓰인 표준카테고리.
export function buildRawCategoryIndex(transactions: MinimalTxn[]): Record<string, string> {
  const tally: Record<string, Record<string, number>> = {};
  for (const t of transactions) {
    if (!t.stdCategory) continue;
    const key = `${t.category ?? ""}|${t.subcategory ?? ""}`;
    const byCategory = (tally[key] ??= {});
    byCategory[t.stdCategory] = (byCategory[t.stdCategory] ?? 0) + 1;
  }
  const top: Record<string, string> = {};
  for (const [key, byCategory] of Object.entries(tally)) {
    let bestCategory = "";
    let bestCount = 0;
    for (const [category, count] of Object.entries(byCategory)) {
      if (count > bestCount) {
        bestCount = count;
        bestCategory = category;
      }
    }
    if (bestCategory) top[key] = bestCategory;
  }
  return top;
}

// 가맹점 키별 전체 거래 건수(본인 포함). 같은 가맹점 일괄 적용 제안에 사용.
export function buildMerchantCounts(transactions: { description: string | null }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of transactions) {
    const key = suggestKeywordFromDescription(t.description);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

// 현재 목록에서 빈도 상위 N개 표준카테고리.
export function topFrequentCategories(transactions: { stdCategory: string | null }[], limit = 6): string[] {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    if (!t.stdCategory || t.stdCategory === EXCLUDED_FROM_FREQUENT) continue;
    counts.set(t.stdCategory, (counts.get(t.stdCategory) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => name);
}

// 거래 1건에 대한 추천 카테고리(가맹점 기준 → 원본 분류 기준 순), 최대 limit개.
export function recommendCategoriesForTransaction(
  txn: { description: string | null; category: string | null; subcategory: string | null },
  merchantIndex: Record<string, string>,
  rawIndex: Record<string, string>,
  limit = 3
): string[] {
  const recommendations: string[] = [];
  const merchantKey = suggestKeywordFromDescription(txn.description);
  const merchantPick = merchantKey ? merchantIndex[merchantKey] : undefined;
  if (merchantPick) recommendations.push(merchantPick);

  const rawKey = `${txn.category ?? ""}|${txn.subcategory ?? ""}`;
  const rawPick = rawIndex[rawKey];
  if (rawPick && !recommendations.includes(rawPick)) recommendations.push(rawPick);

  return recommendations.slice(0, limit);
}

// 검색어가 있으면 이름 부분일치 필터, 없으면 추천→자주 쓰는→전체 순서로 중복 없이 나열.
// ponytail: ↑↓/←→를 하나의 1차원 목록으로만 다뤄 2D 그리드 탐색은 생략(그리드가 작아 큰 불편 없음).
export function buildFlatOptionOrder(
  query: string,
  options: { name: string }[],
  recommendations: string[],
  frequentCategories: string[]
): string[] {
  const validNames = new Set(options.map((o) => o.name));
  const trimmed = query.trim();
  if (trimmed) {
    return options.filter((o) => o.name.includes(trimmed)).map((o) => o.name);
  }
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const name of [...recommendations, ...frequentCategories, ...options.map((o) => o.name)]) {
    if (validNames.has(name) && !seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

// 정규화한 가맹점 키 + txnType이 정확히 같은 다른 거래들의 id만 골라낸다(ILIKE 부분일치가
// 아닌 정확 일치). "모두 적용"/"앞으로도 자동"이 실제로 건드릴 대상과 토스트에 표시하는
// 건수를 항상 일치시키기 위해 사용.
export function findMatchingTransactionIds(
  transactions: { id: string; description: string | null; txnType: string }[],
  merchantKey: string,
  txnType: string,
  excludeId?: string,
  limit = 500
): string[] {
  const ids: string[] = [];
  for (const t of transactions) {
    if (t.id === excludeId) continue;
    if (t.txnType !== txnType) continue;
    if (suggestKeywordFromDescription(t.description) !== merchantKey) continue;
    ids.push(t.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

// 목록에서 아직 분류되지 않은(stdCategory가 없는) 다음 거래를 찾는다. 분류 모드에서
// 한 건 저장 후 다음 미분류 행의 피커를 자동으로 여는 데 사용.
export function findNextUnclassifiedId<T extends { id: string; stdCategory: string | null }>(
  items: T[],
  excludeId?: string
): string | null {
  const next = items.find((t) => !t.stdCategory && t.id !== excludeId);
  return next?.id ?? null;
}

// 칩/토스트에 보여줄 표시용 라벨. '자산수정'의 DB 값은 그대로 두고 라벨만 "집계 제외"로 보여준다.
export function displayCategoryLabel(value: string | null): string {
  if (value === "자산수정") return "집계 제외";
  return value ?? "미분류";
}
