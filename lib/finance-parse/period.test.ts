import { expect, test } from "vitest";
import { transactionDateRange } from "./index";

test("uses actual ledger dates instead of the filename period", () => {
  const range = transactionDateRange([
    { txnDate: "2026-08-26" },
    { txnDate: "2026-08-01" },
    { txnDate: "2026-08-31" },
  ]);

  expect(range).toEqual({ start: "2026-08-01", end: "2026-08-31" });
});
