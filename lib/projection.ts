export type ProjectionInput = {
  /** 지금 순자산(원) */
  start: number;
  /** 첫해 연 저축액(원) */
  annualSaving: number;
  /** 저축액이 해마다 늘어나는 비율(%, 연봉 인상 등) */
  savingGrowthPct: number;
  /** 자산 연 수익률(%) */
  returnPct: number;
  /** 물가상승률(%) - 현재 가치로 환산할 때 쓴다 */
  inflationPct: number;
  years: number;
};

export type ProjectionPoint = {
  year: number;
  /** 명목 자산(그해 말) */
  nominal: number;
  /** 지금 돈 가치로 환산한 자산 */
  real: number;
  /** 원금(지금 자산 + 그동안 넣은 저축) */
  principal: number;
};

/**
 * 연말 기준 단순 복리: 그해 자산 = 작년 자산 × (1+수익률) + 그해 저축. 저축은 연말에 한 번 넣는다고 본다.
 * ponytail: 세금·수수료·연중 적립 효과는 빼고 단순화, 정밀해야 하면 월 단위 적립으로 바꾼다.
 */
export function projectNetWorth(input: ProjectionInput): ProjectionPoint[] {
  const r = input.returnPct / 100;
  const g = input.savingGrowthPct / 100;
  const inf = input.inflationPct / 100;
  const points: ProjectionPoint[] = [{ year: 0, nominal: input.start, real: input.start, principal: input.start }];
  let value = input.start;
  let principal = input.start;
  for (let t = 1; t <= input.years; t++) {
    const saving = input.annualSaving * (1 + g) ** (t - 1);
    value = value * (1 + r) + saving;
    principal += saving;
    points.push({ year: t, nominal: value, real: value / (1 + inf) ** t, principal });
  }
  return points;
}

/** 목표 금액(지금 돈 가치 기준)에 처음 닿는 해. 기간 안에 못 닿으면 null. */
export function yearsToReach(points: ProjectionPoint[], targetReal: number): number | null {
  return points.find((p) => p.real >= targetReal)?.year ?? null;
}
