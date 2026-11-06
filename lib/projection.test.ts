import { describe, expect, test } from "vitest";
import { blendedReturnPct, projectNetWorth, yearsToReach } from "./projection";

describe("projectNetWorth", () => {
  test("수익률·증가율·물가 0이면 원금만 쌓인다", () => {
    const p = projectNetWorth({ start: 100, annualSaving: 10, savingGrowthPct: 0, returnPct: 0, inflationPct: 0, years: 3 });
    expect(p.map((x) => x.nominal)).toEqual([100, 110, 120, 130]);
    expect(p[3].principal).toBe(130);
  });

  test("연말 복리와 저축 증가, 현재 가치 환산", () => {
    const p = projectNetWorth({ start: 1000, annualSaving: 100, savingGrowthPct: 10, returnPct: 10, inflationPct: 10, years: 2 });
    // 1년: 1000×1.1+100 = 1200, 2년: 1200×1.1+110 = 1430
    expect(p[1].nominal).toBeCloseTo(1200);
    expect(p[2].nominal).toBeCloseTo(1430);
    expect(p[2].real).toBeCloseTo(1430 / 1.21);
  });

  test("목표 도달 해", () => {
    const p = projectNetWorth({ start: 0, annualSaving: 10, savingGrowthPct: 0, returnPct: 0, inflationPct: 0, years: 5 });
    expect(yearsToReach(p, 30)).toBe(3);
    expect(yearsToReach(p, 100)).toBeNull();
  });
});

describe("대출·이벤트·은퇴", () => {
  const base = { savingGrowthPct: 0, returnPct: 0, inflationPct: 0 };

  test("대출을 갚는 동안 순자산이 상환액만큼 늘고, 다 갚으면 그 돈이 저축으로 넘어간다", () => {
    const p = projectNetWorth({
      ...base, start: 1000, annualSaving: 100, years: 3,
      debts: [{ key: "L", balance: 240, ratePct: 0, monthlyPayment: 10, reinvest: true }],
    });
    // 0년 순자산 760, 1년: 자산 1100 / 부채 120 → 980, 2년: 1200 / 0 → 1200(상환 완료), 3년: 1200+100+120 → 1420
    expect(p.map((x) => x.nominal)).toEqual([760, 980, 1200, 1420]);
    expect(p[2].paidOff).toEqual(["L"]);
  });

  test("상환액이 없으면 잔액 그대로", () => {
    const p = projectNetWorth({ ...base, start: 100, annualSaving: 0, years: 2, debts: [{ key: "L", balance: 50, ratePct: 5, monthlyPayment: 0, reinvest: true }] });
    expect(p[2].debt).toBe(50);
  });

  test("이벤트는 그해 물가로 키워 반영하고, 은퇴 뒤에는 저축 대신 생활비를 꺼낸다", () => {
    const p = projectNetWorth({ ...base, inflationPct: 10, start: 0, annualSaving: 100, years: 3, events: [{ yearOffset: 1, amount: -50 }], retireAfterYear: 2, annualSpend: 10 });
    expect(p[1].nominal).toBeCloseTo(100 - 55);
    expect(p[2].nominal).toBeCloseTo(145);
    expect(p[3].nominal).toBeCloseTo(145 - 10 * 1.331);
  });

  test("자산 비중 가중 수익률", () => {
    expect(blendedReturnPct({ cash: 100, invest: 300 }, { cash: 1, invest: 9 })).toBeCloseTo(7);
  });
});
