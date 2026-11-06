// 금융 순자산에서 빼는 자산 항목. 부동산/차량, 전자금융/보험 자산은 순자산 계산 및 분류에서 제외하기로 함.
// 부동산은 부동산 카드("부동산 포함 순자산")에서 따로 보여주고, 집에 묶인 대출은 lib/real-estate.ts가 고른다.
const EXCLUDED_ASSET_CATEGORIES = new Set(["부동산", "동산", "전자금융 자산", "보험 자산"]);

export function isExcludedItem(item: { side: string; category: string }) {
  return item.side === "asset" && EXCLUDED_ASSET_CATEGORIES.has(item.category);
}

/** 현금처럼 바로 쓸 수 있는 자산(입출금 통장, CMA·MMF 등). */
export function isCashLikeAsset(item: { category: string; productName: string | null; sector?: string | null }) {
  if (item.category === "자유입출금 자산" || item.category === "현금 자산" || item.sector === "현금성") return true;
  return /(CMA|MMF|입출금|보통예금|요구불|파킹통장)/i.test(item.productName ?? "");
}

/** 미래 계획의 자산별 수익률에 쓰는 구분. */
export function assetClassOf(item: { category: string; productName: string | null; sector?: string | null }): "cash" | "deposit" | "invest" | "other" {
  if (isCashLikeAsset(item)) return "cash";
  if (item.category === "저축성 자산") return "deposit";
  if (item.category === "투자성 자산" || item.category === "연금 자산") return "invest";
  return "other";
}
