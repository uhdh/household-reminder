import { describe, expect, test } from "vitest";
import { computeChoreStatus, todayISO } from "./chores";

describe("todayISO", () => {
  test("formats a Date as yyyy-MM-dd", () => {
    expect(todayISO(new Date(2026, 6, 27))).toBe("2026-07-27");
  });
});

describe("computeChoreStatus", () => {
  test("day unit: partway through the interval", () => {
    const status = computeChoreStatus("2026-07-01", 3, "day", "2026-07-02");
    expect(status.dueDate).toBe("2026-07-04");
    expect(status.daysRemaining).toBe(2);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(33);
  });

  test("week unit: exactly due today counts as overdue", () => {
    const status = computeChoreStatus("2026-07-01", 1, "week", "2026-07-08");
    expect(status.dueDate).toBe("2026-07-08");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("month unit: calendar-accurate, clamps to shorter month", () => {
    const status = computeChoreStatus("2026-01-31", 1, "month", "2026-02-01");
    expect(status.dueDate).toBe("2026-02-28");
  });

  test("null last-done date is always immediately overdue", () => {
    const status = computeChoreStatus(null, 1, "week", "2026-07-27");
    expect(status.dueDate).toBe("2026-07-27");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("past the due date reports a positive overdue count via negative daysRemaining", () => {
    const status = computeChoreStatus("2026-07-01", 3, "day", "2026-07-07");
    expect(status.daysRemaining).toBe(-3);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });
});
