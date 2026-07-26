import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, computeStatus } from "../reminder.js";

test("addDays adds days across a month boundary", () => {
  assert.equal(addDays("2026-01-30", 5), "2026-02-04");
});

test("addDays handles a year boundary", () => {
  assert.equal(addDays("2025-12-28", 10), "2026-01-07");
});

test("daysBetween computes a positive difference", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-10"), 9);
});

test("daysBetween computes a negative difference for past dates", () => {
  assert.equal(daysBetween("2026-01-10", "2026-01-01"), -9);
});

test("computeStatus is not overdue when the due date is in the future", () => {
  const status = computeStatus("2026-07-01", 90, "2026-07-27");
  assert.equal(status.dueDate, "2026-09-29");
  assert.equal(status.overdue, false);
  assert.ok(status.daysRemaining > 0);
  assert.equal(status.percent, 29);
});

test("computeStatus is overdue once the due date has passed", () => {
  const status = computeStatus("2026-01-01", 14, "2026-07-27");
  assert.equal(status.overdue, true);
  assert.ok(status.daysRemaining <= 0);
  assert.equal(status.percent, 100);
});

test("computeStatus treats the exact due day as overdue", () => {
  const status = computeStatus("2026-07-01", 30, "2026-07-31");
  assert.equal(status.dueDate, "2026-07-31");
  assert.equal(status.daysRemaining, 0);
  assert.equal(status.overdue, true);
  assert.equal(status.percent, 100);
});

test("computeStatus reports 50% progress when half the cycle has elapsed", () => {
  // 2-month (60-day) cycle with 1 month (30 days) remaining => halfway through.
  const status = computeStatus("2026-06-27", 60, "2026-07-27");
  assert.equal(status.daysRemaining, 30);
  assert.equal(status.percent, 50);
});

test("computeStatus returns nulls for condition-based items (cycleDays null)", () => {
  const status = computeStatus("2026-01-01", null, "2026-07-27");
  assert.deepEqual(status, { dueDate: null, daysRemaining: null, overdue: false, percent: null });
});
