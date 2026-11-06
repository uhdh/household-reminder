// 미래 계획 설정. DB(plan_settings.data)와 화면이 같은 모양을 쓴다. 저장 전/읽은 뒤 sanitizePlanSettings로 범위를 맞춘다.

export type PlanEvent = { id: string; year: number; label: string; amountMan: number };
export type PlanLoan = { ratePct: number; monthlyMan: number; reinvest: boolean };
export type AssetClass = "cash" | "deposit" | "invest" | "other";

export type PlanSettings = {
  /** null이면 실제 기록(최근 12개월 수입-지출)을 쓴다 */
  savingMan: number | null;
  savingGrowthPct: number;
  inflationPct: number;
  goalEok: number;
  returnMode: "single" | "byClass";
  returnPct: number;
  classReturns: Record<AssetClass, number>;
  events: PlanEvent[];
  retirement: { enabled: boolean; currentAge: number; retireAge: number; monthlySpendMan: number; withdrawalPct: number };
  /** 키: `${personId}|${productName}` */
  loans: Record<string, PlanLoan>;
  /** 부동산(시세와 묶인 대출)을 순자산에 넣을지, 넣으면 집값 상승률 */
  includeRealEstate: boolean;
  realEstateGrowthPct: number;
};

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  savingMan: null,
  savingGrowthPct: 3,
  inflationPct: 2.5,
  goalEok: 10,
  returnMode: "single",
  returnPct: 5,
  classReturns: { cash: 0.5, deposit: 3, invest: 7, other: 2 },
  events: [],
  retirement: { enabled: false, currentAge: 35, retireAge: 60, monthlySpendMan: 300, withdrawalPct: 4 },
  loans: {},
  includeRealEstate: false,
  realEstateGrowthPct: 2,
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** 신뢰할 수 없는 입력(폼 JSON, 옛 DB 값)을 안전한 PlanSettings로. 모르는 값은 기본값으로 채운다. */
export function sanitizePlanSettings(input: unknown): PlanSettings {
  const d = DEFAULT_PLAN_SETTINGS;
  const s = obj(input);
  const cr = obj(s.classReturns);
  const rt = obj(s.retirement);
  const events = (Array.isArray(s.events) ? s.events : []).slice(0, 30).map((e, i) => {
    const o = obj(e);
    return {
      id: String(o.id ?? i).slice(0, 40),
      year: Math.round(num(o.year, new Date().getFullYear(), 2000, 2150)),
      label: String(o.label ?? "").slice(0, 40),
      amountMan: Math.round(num(o.amountMan, 0, -1_000_000, 1_000_000)),
    };
  });
  const loans: Record<string, PlanLoan> = {};
  for (const [key, value] of Object.entries(obj(s.loans)).slice(0, 50)) {
    const o = obj(value);
    loans[key.slice(0, 250)] = { ratePct: num(o.ratePct, 4, 0, 30), monthlyMan: num(o.monthlyMan, 0, 0, 100_000), reinvest: o.reinvest !== false };
  }
  return {
    savingMan: s.savingMan === null || s.savingMan === undefined ? null : Math.round(num(s.savingMan, 0, -1_000_000, 1_000_000)),
    savingGrowthPct: num(s.savingGrowthPct, d.savingGrowthPct, -20, 30),
    inflationPct: num(s.inflationPct, d.inflationPct, -5, 20),
    goalEok: num(s.goalEok, d.goalEok, 0, 10_000),
    returnMode: s.returnMode === "byClass" ? "byClass" : "single",
    returnPct: num(s.returnPct, d.returnPct, -20, 30),
    classReturns: {
      cash: num(cr.cash, d.classReturns.cash, -20, 30),
      deposit: num(cr.deposit, d.classReturns.deposit, -20, 30),
      invest: num(cr.invest, d.classReturns.invest, -20, 30),
      other: num(cr.other, d.classReturns.other, -20, 30),
    },
    events,
    retirement: {
      enabled: rt.enabled === true,
      currentAge: Math.round(num(rt.currentAge, d.retirement.currentAge, 15, 100)),
      retireAge: Math.round(num(rt.retireAge, d.retirement.retireAge, 20, 100)),
      monthlySpendMan: num(rt.monthlySpendMan, d.retirement.monthlySpendMan, 0, 100_000),
      withdrawalPct: num(rt.withdrawalPct, d.retirement.withdrawalPct, 1, 10),
    },
    loans,
    includeRealEstate: s.includeRealEstate === true,
    realEstateGrowthPct: num(s.realEstateGrowthPct, d.realEstateGrowthPct, -20, 30),
  };
}
