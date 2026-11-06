export type ProjectionDebt = { key: string; balance: number; ratePct: number; monthlyPayment: number; reinvest: boolean };

export type ProjectionInput = {
  /** 지금 자산 총액(원, 부채 빼기 전). debts가 없으면 순자산을 그대로 넣어도 된다. */
  start: number;
  /** 첫해 연 저축액(원). 대출 월 상환액은 이미 지출에 잡혀 있다고 본다. */
  annualSaving: number;
  savingGrowthPct: number;
  returnPct: number;
  inflationPct: number;
  years: number;
  debts?: ProjectionDebt[];
  /** 몇 년 뒤에 들고 나는 큰 돈(지금 돈 가치, 그해 물가로 키워서 반영). +는 들어옴, -는 나감 */
  events?: { yearOffset: number; amount: number }[];
  /** 이 해 다음부터 저축을 멈추고 annualSpend(지금 돈 가치)를 해마다 꺼내 쓴다 */
  retireAfterYear?: number | null;
  annualSpend?: number;
};

export type ProjectionPoint = {
  year: number;
  /** 순자산(명목, 그해 말) */
  nominal: number;
  /** 지금 돈 가치로 환산한 순자산 */
  real: number;
  /** 넣은 돈: 지금 순자산 + 저축 + 대출 상환 + 이벤트 - 은퇴 후 꺼내 쓴 돈 */
  principal: number;
  debt: number;
  /** 이 해에 다 갚은 대출 key */
  paidOff: string[];
};

/**
 * 연말 기준 단순 복리: 자산 = 작년 자산 × (1+수익률) + 그해 저축 + 이벤트 - 생활비 - 대출 상환.
 * 대출은 잔액 × (1+금리) - 연 상환액으로 줄고, 다 갚은 다음 해부터(reinvest면) 그 상환액만큼 저축이 늘어난다.
 * ponytail: 세금·수수료·연중 적립 효과는 빼고 단순화, 정밀해야 하면 월 단위로 바꾼다.
 */
export function projectNetWorth(input: ProjectionInput): ProjectionPoint[] {
  const r = input.returnPct / 100;
  const g = input.savingGrowthPct / 100;
  const inf = input.inflationPct / 100;
  const debts = (input.debts ?? []).map((d) => ({ ...d, paid: d.balance <= 0 }));
  const debtTotal = () => debts.reduce((s, d) => s + d.balance, 0);
  // 상환액은 저축(annualSaving)과 별개로 지출에 이미 잡혀 있으므로 자산에서 빼지 않고 부채만 줄인다.
  let assets = input.start;
  let principal = input.start - debtTotal();
  const points: ProjectionPoint[] = [{ year: 0, nominal: principal, real: principal, principal, debt: debtTotal(), paidOff: [] }];
  let freed = 0;
  for (let t = 1; t <= input.years; t++) {
    const retired = input.retireAfterYear != null && t > input.retireAfterYear;
    const saving = retired ? 0 : input.annualSaving * (1 + g) ** (t - 1) + freed;
    const event = (input.events ?? []).filter((e) => e.yearOffset === t).reduce((s, e) => s + e.amount, 0) * (1 + inf) ** t;
    const spend = retired ? (input.annualSpend ?? 0) * (1 + inf) ** t : 0;
    assets = assets * (1 + r) + saving + event - spend;
    principal += saving + event - spend;
    const paidOff: string[] = [];
    for (const d of debts) {
      // 상환액을 안 정한 대출은 이자만 내며 잔액이 그대로라고 본다.
      if (d.paid || d.monthlyPayment <= 0) continue;
      const owed = d.balance * (1 + d.ratePct / 100);
      const pay = Math.min(owed, d.monthlyPayment * 12);
      d.balance = owed - pay;
      principal += pay;
      if (d.balance <= 0.5) {
        d.balance = 0;
        d.paid = true;
        paidOff.push(d.key);
        if (d.reinvest) freed += d.monthlyPayment * 12;
      }
    }
    const nominal = assets - debtTotal();
    points.push({ year: t, nominal, real: nominal / (1 + inf) ** t, principal, debt: debtTotal(), paidOff });
  }
  return points;
}

/** 목표 금액(지금 돈 가치 기준)에 처음 닿는 해. 기간 안에 못 닿으면 null. */
export function yearsToReach(points: ProjectionPoint[], targetReal: number): number | null {
  return points.find((p) => p.real >= targetReal)?.year ?? null;
}

/** 자산 비중으로 가중 평균한 수익률(%). 새 저축도 지금 비중대로 나눠 넣는다고 보면 전체 수익률과 같다. */
export function blendedReturnPct(weights: Record<string, number>, returns: Record<string, number>): number {
  const total = Object.values(weights).reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return returns.deposit ?? 0;
  return Object.entries(weights).reduce((s, [k, w]) => s + (Math.max(0, w) / total) * (returns[k] ?? 0), 0);
}
