import { describe, expect, test } from "vitest";
import { monthlyNetWorth } from "./net-worth-history";
import { DEFAULT_PLAN_SETTINGS, sanitizePlanSettings } from "./plan-settings";

describe("monthlyNetWorth", () => {
  test("사람마다 그 달까지 최신 업로드 값을 더하고, 안 올린 달은 직전 값을 유지한다", () => {
    const r = monthlyNetWorth(
      [
        { personId: "h", date: "2026-07-30", net: 100 },
        { personId: "h", date: "2026-07-31", net: 110 },
        { personId: "w", date: "2026-08-01", net: 50 },
        { personId: "h", date: "2026-10-02", net: 130 },
      ],
      "2026-10"
    );
    expect(r).toEqual([
      { month: "2026-07", net: 110 },
      { month: "2026-08", net: 160 },
      { month: "2026-09", net: 160 },
      { month: "2026-10", net: 180 },
    ]);
  });
});

describe("sanitizePlanSettings", () => {
  test("모르는 값은 기본값, 범위 밖은 잘라낸다", () => {
    expect(sanitizePlanSettings(null)).toEqual(DEFAULT_PLAN_SETTINGS);
    const s = sanitizePlanSettings({ returnPct: 999, events: [{ year: 2030, label: "이사", amountMan: "-20000" }], retirement: { enabled: true, retireAge: "abc" } });
    expect(s.returnPct).toBe(30);
    expect(s.events[0]).toMatchObject({ year: 2030, label: "이사", amountMan: -20000 });
    expect(s.retirement).toMatchObject({ enabled: true, retireAge: 60 });
  });
});
