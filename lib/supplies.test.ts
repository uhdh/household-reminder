import { describe, expect, test } from "vitest";
import { computeSupplyStatus } from "./supplies";

describe("computeSupplyStatus", () => {
  test("partway through the cycle", () => {
    const status = computeSupplyStatus("2026-07-01", 10, "2026-07-04");
    expect(status.dueDate).toBe("2026-07-11");
    expect(status.daysRemaining).toBe(7);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(30);
  });

  test("exactly due today counts as overdue", () => {
    const status = computeSupplyStatus("2026-07-01", 7, "2026-07-08");
    expect(status.dueDate).toBe("2026-07-08");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("past the due date reports negative daysRemaining and clamps percent at 100", () => {
    const status = computeSupplyStatus("2026-07-01", 5, "2026-07-10");
    expect(status.daysRemaining).toBe(-4);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("freshly seeded (last done today) is never overdue and starts at 0%", () => {
    const status = computeSupplyStatus("2026-07-27", 90, "2026-07-27");
    expect(status.daysRemaining).toBe(90);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(0);
  });

  test("invalid/empty lastDoneISO falls back to an immediately-overdue status instead of throwing", () => {
    const status = computeSupplyStatus("", 90, "2026-07-27");
    expect(status.dueDate).toBe("2026-07-27");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("cycleDays <= 0 falls back to an immediately-overdue status instead of dividing by zero", () => {
    const status = computeSupplyStatus("2026-07-01", 0, "2026-07-27");
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
    expect(Number.isNaN(status.percent)).toBe(false);
  });
});
