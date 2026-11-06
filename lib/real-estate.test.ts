import { describe, expect, test } from "vitest";
import { defaultLinkedLoanKeys, summarizeRealEstate } from "./real-estate";

const debts = [
  { personId: "h", productName: "분양주택입주잔금대출", amount: 400 },
  { personId: "w", productName: "(주택자금)일반대출-임직원주택(전세)자금", amount: 30 },
  { personId: "w", productName: "마이너스 통장", amount: 0 },
];

describe("부동산", () => {
  test("등록 전에는 분양·잔금 대출만 부동산 대출로 본다(전세자금은 제외)", () => {
    expect(defaultLinkedLoanKeys(debts)).toEqual(["h|분양주택입주잔금대출"]);
    expect(summarizeRealEstate([], debts)).toMatchObject({ value: 0, loan: 400, equity: -400, ltvPct: null });
  });

  test("등록하면 고른 대출만 묶고 내 몫·LTV를 계산한다", () => {
    const r = summarizeRealEstate([{ id: "1", name: "집", value: 1000, loanKeys: ["h|분양주택입주잔금대출"] }], debts, 200);
    expect(r).toMatchObject({ value: 1200, loan: 400, equity: 800 });
    expect(r.ltvPct).toBeCloseTo(33.33, 1);
  });
});
