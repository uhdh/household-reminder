import { describe, expect, test } from "vitest";
import {
  classifySpendingEmptyState,
  compareMonthlySummaries,
  countsInTotals,
  excludedReasonLabel,
  flowLabel,
  isExcludedFromTotals,
  summarizeBeneficiarySpending,
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
    categoryLocked: false, isPrivate: false,
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

describe("isExcludedFromTotals / excludedReasonLabel (세부 내역 '집계 제외' 필터)", () => {
  test("included=false인 행만 집계 제외 목록에 잡힌다", () => {
    expect(isExcludedFromTotals(makeTxn({ included: false }))).toBe(true);
    expect(isExcludedFromTotals(makeTxn({ included: true }))).toBe(false);
  });

  test("is_internal_transfer이면 '내 계좌 이동', std_category가 '자산수정'이면 '집계 제외', 그 외엔 '소액·기타 제외'", () => {
    expect(excludedReasonLabel(makeTxn({ isInternalTransfer: true, stdCategory: null }))).toBe("내 계좌 이동");
    expect(excludedReasonLabel(makeTxn({ isInternalTransfer: false, stdCategory: "자산수정" }))).toBe("집계 제외");
    expect(excludedReasonLabel(makeTxn({ isInternalTransfer: false, stdCategory: "식비" }))).toBe("소액·기타 제외");
    // is_internal_transfer가 우선순위 최상단(둘 다 해당해도 '내 계좌 이동'을 보여준다)
    expect(excludedReasonLabel(makeTxn({ isInternalTransfer: true, stdCategory: "자산수정" }))).toBe("내 계좌 이동");
  });
});

describe("summarizeBeneficiarySpending", () => {
  const people = [
    { id: "husband", displayName: "남편" },
    { id: "wife", displayName: "아내" },
  ];
  const noAllowance = new Map<string, number | null>();

  test("사용 대상별 지출을 합산하고 공동은 따로 낸다", () => {
    const result = summarizeBeneficiarySpending(
      [
        makeTxn({ beneficiary: "husband", amount: "-30000" }),
        makeTxn({ beneficiary: "husband", amount: "-20000" }),
        makeTxn({ beneficiary: "wife", amount: "-10000" }),
        makeTxn({ beneficiary: "joint", amount: "-70000" }),
      ],
      people,
      noAllowance
    );
    expect(result.rows.map((r) => [r.id, r.spent])).toEqual([["husband", 50000], ["wife", 10000]]);
    expect(result.joint).toBe(70000);
  });

  test("환불(입금)·집계 제외·미분류 이체·알 수 없는 사용 대상은 뺀다", () => {
    const result = summarizeBeneficiarySpending(
      [
        makeTxn({ beneficiary: "husband", amount: "-30000" }),
        makeTxn({ beneficiary: "husband", amount: "5000", txnType: "지출" }), // 환불 = 입금
        makeTxn({ beneficiary: "husband", amount: "-9999", included: false }),
        makeTxn({ beneficiary: "husband", amount: "-8888", txnType: "이체", stdCategory: null }),
        makeTxn({ beneficiary: "deleted-person", amount: "-7777" }),
      ],
      people,
      noAllowance
    );
    expect(result.rows[0].spent).toBe(30000);
    expect(result.joint).toBe(0);
  });

  test("한도가 있으면 초과 금액을 계산하고, 한도가 없거나 이하이면 0이다", () => {
    const result = summarizeBeneficiarySpending(
      [makeTxn({ beneficiary: "husband", amount: "-60000" }), makeTxn({ beneficiary: "wife", amount: "-10000" })],
      people,
      new Map([["husband", 50000], ["wife", null]])
    );
    expect(result.rows[0]).toMatchObject({ spent: 60000, allowance: 50000, over: 10000 });
    expect(result.rows[1]).toMatchObject({ spent: 10000, allowance: null, over: 0 });
  });

  test("한도 0원이면 지출이 있는 순간 전부 초과이고, 1인·3인 가구도 사람 목록대로 나온다", () => {
    const solo = summarizeBeneficiarySpending([makeTxn({ beneficiary: "me", amount: "-1000" })], [{ id: "me", displayName: "나" }], new Map([["me", 0]]));
    expect(solo.rows).toHaveLength(1);
    expect(solo.rows[0].over).toBe(1000);
    const three = summarizeBeneficiarySpending([], [...people, { id: "kid", displayName: "아이" }], noAllowance);
    expect(three.rows).toHaveLength(3);
  });
});
