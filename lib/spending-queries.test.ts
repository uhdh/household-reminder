import { describe, expect, test } from "vitest";
import {
  classifySpendingEmptyState,
  compareMonthlySummaries,
  countsInTotals,
  flowLabel,
  summarizeMonthlyTransactions,
  unmappedTransferExclusion,
  type Txn,
} from "./spending-queries";

function makeTxn(overrides: Partial<Txn>): Txn {
  return {
    id: "txn-1",
    householdId: "household-1",
    uploadId: "upload-1",
    personId: "husband",
    txnDate: "2026-07-01",
    txnTime: null,
    txnType: "지출",
    category: null,
    subcategory: null,
    description: null,
    amount: "0",
    paymentMethod: null,
    stdCategory: null,
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    ...overrides,
  };
}

function kindOf(stdCategory: string | null): string {
  if (stdCategory === "월급") return "고정수입";
  if (stdCategory === "식비") return "변동비";
  if (stdCategory === "월세") return "고정비";
  return "변동비";
}

describe("summarizeMonthlyTransactions", () => {
  test("uses the Excel amount sign when it conflicts with the transaction type", () => {
    expect(flowLabel(makeTxn({ txnType: "지출", amount: "10000" }))).toBe("입금");
    expect(flowLabel(makeTxn({ txnType: "수입", amount: "-10000" }))).toBe("지출");
  });

  test("splits income and expense totals by person", () => {
    const tx = [
      makeTxn({ personId: "husband", txnType: "수입", stdCategory: "월급", amount: "3000000" }),
      makeTxn({ personId: "wife", txnType: "수입", stdCategory: "월급", amount: "2000000" }),
      makeTxn({ personId: "husband", txnType: "지출", stdCategory: "월세", amount: "-1000000" }),
      makeTxn({ personId: "wife", txnType: "지출", stdCategory: "식비", amount: "-500000" }),
    ];

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["husband", "wife"]);

    expect(summary.totalIncome).toBe(5000000);
    expect(summary.totalIncomeByPerson).toEqual({ husband: 3000000, wife: 2000000 });
    expect(summary.fixedIncomeByPerson).toEqual({ husband: 3000000, wife: 2000000 });

    expect(summary.totalExpense).toBe(1500000);
    expect(summary.totalExpenseByPerson).toEqual({ husband: 1000000, wife: 500000 });
    expect(summary.fixedExpenseByPerson).toEqual({ husband: 1000000, wife: 0 });
    expect(summary.variableExpenseByPerson).toEqual({ husband: 0, wife: 500000 });

    expect(summary.balance).toBe(3500000);
    expect(summary.balanceByPerson).toEqual({ husband: 2000000, wife: 1500000 });
  });

  test("computes savings rate per person, guarding against zero income", () => {
    const tx = [
      makeTxn({ personId: "husband", txnType: "수입", stdCategory: "월급", amount: "1000000" }),
      makeTxn({ personId: "husband", txnType: "지출", stdCategory: "식비", amount: "-250000" }),
      makeTxn({ personId: "wife", txnType: "지출", stdCategory: "식비", amount: "-100000" }),
    ];

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["husband", "wife"]);

    expect(summary.savingsRateByPerson.husband).toBeCloseTo(75, 5);
    expect(summary.savingsRateByPerson.wife).toBe(0);
    expect(summary.savingsRate).toBeCloseTo(65, 5);
  });

  test("groups category totals by person and beneficiary", () => {
    const tx = [
      makeTxn({ personId: "husband", beneficiary: "joint", txnType: "지출", stdCategory: "식비", amount: "-30000" }),
      makeTxn({ personId: "wife", beneficiary: "wife", txnType: "지출", stdCategory: "식비", amount: "-20000" }),
    ];

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["husband", "wife"]);

    expect(summary.categoryTotals.get("식비")).toBe(50000);
    expect(summary.categoryByPerson.get("식비")).toEqual({ husband: 30000, wife: 20000 });
    expect(summary.categoryByBeneficiary.get("식비")).toEqual({ husband: 0, wife: 20000, joint: 30000 });
  });

  test("falls back to 미분류 for transactions without a std category", () => {
    const tx = [makeTxn({ txnType: "지출", stdCategory: null, amount: "-10000" })];

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["husband", "wife"]);

    expect(summary.categoryTotals.get("미분류")).toBe(10000);
  });
});

describe("countsInTotals", () => {
  test("excludes included 이체 transactions with no std category (대부분 내 계좌 간 이동)", () => {
    expect(countsInTotals(makeTxn({ txnType: "이체", stdCategory: null, included: true }))).toBe(false);
  });

  test("includes an 이체 once it has been mapped to a std category", () => {
    expect(countsInTotals(makeTxn({ txnType: "이체", stdCategory: "현금", included: true }))).toBe(true);
  });

  test("respects included=false regardless of txnType", () => {
    expect(countsInTotals(makeTxn({ txnType: "지출", stdCategory: "식비", included: false }))).toBe(false);
  });

  test("includes normal 수입/지출 transactions", () => {
    expect(countsInTotals(makeTxn({ txnType: "지출", stdCategory: "식비", included: true }))).toBe(true);
  });
});

describe("unmappedTransferExclusion", () => {
  test("sums count/amount of excluded unmapped transfers only", () => {
    const rows = [
      makeTxn({ txnType: "이체", stdCategory: null, included: true, amount: "-500000" }),
      makeTxn({ txnType: "이체", stdCategory: null, included: true, amount: "300000" }),
      makeTxn({ txnType: "지출", stdCategory: "식비", included: true, amount: "-10000" }),
    ];
    expect(unmappedTransferExclusion(rows)).toEqual({ count: 2, total: 800000 });
  });
});

describe("compareMonthlySummaries", () => {
  test("returns null when there is no previous month data", () => {
    const current = summarizeMonthlyTransactions([makeTxn({ txnType: "지출", stdCategory: "식비", amount: "-10000" })], kindOf, ["husband", "wife"]);
    expect(compareMonthlySummaries(current, null)).toBeNull();
  });

  test("computes deltas and the category with the biggest increase", () => {
    const previous = summarizeMonthlyTransactions(
      [
        makeTxn({ txnType: "수입", stdCategory: "월급", amount: "3000000" }),
        makeTxn({ txnType: "지출", stdCategory: "식비", amount: "-100000" }),
      ],
      kindOf,
      ["husband", "wife"]
    );
    const current = summarizeMonthlyTransactions(
      [
        makeTxn({ txnType: "수입", stdCategory: "월급", amount: "3000000" }),
        makeTxn({ txnType: "지출", stdCategory: "식비", amount: "-180000" }),
        makeTxn({ txnType: "지출", stdCategory: "월세", amount: "-1000000" }),
      ],
      kindOf,
      ["husband", "wife"]
    );

    const comparison = compareMonthlySummaries(current, previous);

    expect(comparison).not.toBeNull();
    expect(comparison!.totalIncomeDelta).toBe(0);
    expect(comparison!.totalExpenseDelta).toBe(1080000);
    expect(comparison!.topIncreaseCategory).toEqual({ name: "월세", delta: 1000000 });
  });
});

describe("classifySpendingEmptyState", () => {
  const householdTx = [makeTxn({ txnDate: "2026-06-15" })];

  test("returns onboarding when the household has no transactions at all", () => {
    expect(classifySpendingEmptyState([], [])).toBe("onboarding");
  });

  test("returns period when the household has data but not for the viewed period", () => {
    expect(classifySpendingEmptyState(householdTx, [])).toBe("period");
  });

  test("returns null when the viewed period has data", () => {
    expect(classifySpendingEmptyState(householdTx, householdTx)).toBeNull();
  });
});
