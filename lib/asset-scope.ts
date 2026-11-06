// 순자산 계산에서 빼는 항목. 자산관리 화면과 미래 계획 화면이 같은 기준을 쓰도록 한곳에 둔다.
// 부동산/차량, 전자금융/보험 자산은 순자산 계산 및 분류에서 제외하기로 함
const EXCLUDED_ASSET_CATEGORIES = new Set(["부동산", "동산", "전자금융 자산", "보험 자산"]);
// 기존 우리집 한정 예외 규칙(특정 대출 상품). 새 가구에는 해당 personId/상품명 조합이 없어 그냥 무시된다.
const EXCLUDED_DEBT_ITEMS = [{ personId: "husband", productName: "분양주택입주잔금대출" }];

export function isExcludedItem(item: { side: string; personId: string; category: string; productName: string | null }) {
  if (item.side === "asset") return EXCLUDED_ASSET_CATEGORIES.has(item.category);
  return EXCLUDED_DEBT_ITEMS.some((e) => e.personId === item.personId && e.productName === item.productName);
}
