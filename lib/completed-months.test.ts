import { describe, expect, test } from "vitest";
import { currentMonthStartKst, trimToCompletedMonths } from "./completed-months";

describe("currentMonthStartKst", () => {
  test("UTC로는 10월 31일 밤이어도 한국은 11월이다", () => {
    expect(currentMonthStartKst(new Date("2026-10-31T16:00:00Z"))).toBe("2026-11-01");
    expect(currentMonthStartKst(new Date("2026-10-31T14:00:00Z"))).toBe("2026-10-01");
  });
});

describe("trimToCompletedMonths", () => {
  const tx = (txnDate: string) => ({ txnDate });

  test("이번 달 거래를 빼고 기간 끝을 지난달 말로 줄인다", () => {
    const r = trimToCompletedMonths(
      { transactions: [tx("2026-10-31"), tx("2026-11-01"), tx("2026-11-03")], periodStart: "2026-10-01", periodEnd: "2026-11-03" },
      "2026-11-01"
    );
    expect(r.transactions).toEqual([tx("2026-10-31")]);
    expect(r.periodEnd).toBe("2026-10-31");
    expect(r.droppedCount).toBe(2);
  });

  test("파일 전체가 이번 달이면 기간을 비운다", () => {
    const r = trimToCompletedMonths({ transactions: [tx("2026-11-02")], periodStart: "2026-11-01", periodEnd: "2026-11-03" }, "2026-11-01");
    expect(r).toEqual({ transactions: [], periodStart: null, periodEnd: null, droppedCount: 1 });
  });

  test("1월이면 지난해 12월 31일까지", () => {
    expect(trimToCompletedMonths({ transactions: [], periodStart: "2025-12-01", periodEnd: "2026-01-02" }, "2026-01-01").periodEnd).toBe("2025-12-31");
  });
});
