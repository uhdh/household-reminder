// 부동산은 금융자산과 따로 본다: 자산 그래프·금융 순자산에서는 빼고, "부동산 포함 순자산"과 부동산 카드에서 보여준다.

export type DebtLike = { personId: string; productName: string | null; amount: number };
export type RealAssetRow = { id: string; name: string; value: number; loanKeys: string[] };

export const debtKey = (d: { personId: string; productName: string | null }) => `${d.personId}|${d.productName ?? ""}`;

/**
 * 부동산을 아직 하나도 등록하지 않은 가구에서 부동산 대출로 볼 부채. 분양·잔금·주택담보 대출은 집에 묶인 돈이라
 * 금융 순자산에서 빼던 기존 동작을 유지한다(전세자금대출은 보증금이 금융자산 쪽이라 제외).
 */
export function defaultLinkedLoanKeys(debts: DebtLike[]): string[] {
  return debts
    .filter((d) => /(분양|잔금|주택담보|담보대출|모기지)/.test(d.productName ?? "") && !/전세/.test(d.productName ?? ""))
    .map(debtKey);
}

export function linkedLoanKeys(realAssets: RealAssetRow[], debts: DebtLike[]): Set<string> {
  return new Set(realAssets.length > 0 ? realAssets.flatMap((r) => r.loanKeys) : defaultLinkedLoanKeys(debts));
}

/** 부동산 합계: 시세, 묶인 대출, 내 몫(시세-대출), 대출 비율(LTV, %). 은행 자료의 부동산 항목(bankValue)도 시세에 더한다. */
export function summarizeRealEstate(realAssets: RealAssetRow[], debts: DebtLike[], bankValue = 0) {
  const linked = linkedLoanKeys(realAssets, debts);
  const value = realAssets.reduce((s, r) => s + r.value, 0) + bankValue;
  const loan = debts.filter((d) => linked.has(debtKey(d))).reduce((s, d) => s + d.amount, 0);
  return { value, loan, equity: value - loan, ltvPct: value > 0 ? (loan / value) * 100 : null, linked };
}
