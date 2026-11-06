import { describe, expect, test } from "vitest";
import { projectNetWorth, yearsToReach } from "./projection";

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
