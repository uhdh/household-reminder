import { describe, expect, test } from "vitest";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import { buildRuleIndex, deriveTransactionFields, mapStdCategory, matchSelfTransferPairs } from "@/lib/spending-derive";

function transaction(overrides: Partial<ParsedTransaction>): ParsedTransaction {
  return {
    txnDate: "2026-01-29",
    txnTime: "09:48:43",
    txnType: "수입",
    category: "금융수입",
    subcategory: "미분류",
    description: "거래소 출금",
    amount: 31_665_591,
    paymentMethod: "생활통장",
    ...overrides,
  };
}

describe("matchSelfTransferPairs", () => {
  test("수수료로 금액이 조금 다른 같은 날 금융 이동을 내부이체로 묶는다", () => {
    const rows = [
      transaction({}),
      transaction({
        txnTime: "09:54:25",
        txnType: "지출",
        category: "금융",
        subcategory: "은행",
        description: "본인 계좌",
        amount: -31_703_356,
      }),
    ];

    expect(matchSelfTransferPairs(rows)).toEqual([true, true]);
    expect(deriveTransactionFields(rows, new Map())).toMatchObject([
      { included: false, isInternalTransfer: true },
      { included: false, isInternalTransfer: true },
    ]);
  });

  test("시간이 멀거나 금액 차이가 큰 금융 거래는 임의로 묶지 않는다", () => {
    const rows = [
      transaction({}),
      transaction({ txnTime: "12:00:00", txnType: "지출", category: "금융", amount: -31_703_356 }),
      transaction({ txnTime: "09:50:00", txnType: "지출", category: "금융", amount: -30_000_000 }),
    ];

    expect(matchSelfTransferPairs(rows)).toEqual([false, false, false]);
  });
});

describe("mapStdCategory", () => {
  test("결제수단 사용자 규칙을 원본 카테고리 매핑보다 우선한다", () => {
    const row = transaction({
      txnType: "지출",
      category: "여행/숙박",
      subcategory: "미분류",
      paymentMethod: "MG생활비통장",
    });
    const mappings = new Map([["지출|여행/숙박|미분류", "여행"]]);
    const rules = buildRuleIndex([
      { txnType: "지출", paymentMethod: "MG생활비통장", stdCategory: "대출원리금" },
    ]);

    expect(mapStdCategory(row, mappings, rules)).toBe("대출원리금");
  });

  test("수입 설명에 급여가 있으면 원본 금융수입보다 월급을 우선한다", () => {
    const row = transaction({ description: "SK텔레콤급여", amount: 5_772_867 });
    const mappings = new Map([["수입|금융수입|미분류", "금융수입"]]);

    expect(mapStdCategory(row, mappings)).toBe("월급");
  });

  test("자산수정으로 매핑된 거래는 지출 집계에서 제외한다", () => {
    const row = transaction({ txnType: "지출", category: "자산수정", amount: -100_000 });
    const mappings = new Map([["지출|자산수정|미분류", "자산수정"]]);

    expect(deriveTransactionFields([row], mappings)).toMatchObject([
      { stdCategory: "자산수정", included: false, isInternalTransfer: false },
    ]);
  });

  test("키워드 규칙이 결제수단 및 원본 매핑보다 우선 적용된다", () => {
    const row = transaction({
      txnType: "지출",
      category: "온라인쇼핑",
      subcategory: "서비스구독",
      description: "(주)이니시스(빌링_일반)",
      paymentMethod: "체크카드",
    });
    const mappings = new Map([["지출|온라인쇼핑|서비스구독", "구독"]]);
    const keywordRules = [
      { txnType: "지출", keyword: "이니시스(빌링_일반)", stdCategory: "렌트카" },
    ];

    expect(mapStdCategory(row, mappings, new Map(), keywordRules)).toBe("렌트카");
  });

  test("가구별 특수 규칙(옛 보험사명 등)은 코드에 하드코딩돼 있지 않다 - keywordRules로만 분류된다", () => {
    const row = transaction({ txnType: "지출", category: "미분류", subcategory: "미분류", description: "11삼생보험료" });

    expect(mapStdCategory(row, new Map())).toBeNull(); // 규칙이 없으면 더 이상 자동으로 "보험"이 되지 않음

    const keywordRules = [{ txnType: "전체", keyword: "11삼생", stdCategory: "보험" }];
    expect(mapStdCategory(row, new Map(), new Map(), keywordRules)).toBe("보험"); // 가구별 키워드 규칙으로는 여전히 가능
  });

  test("suggestKeywordFromDescription이 불필요한 사업자 접두/접미사를 깔끔하게 제거한다", async () => {
    const { suggestKeywordFromDescription } = await import("@/lib/spending-derive");
    expect(suggestKeywordFromDescription("(주)이니시스(빌링_일반)")).toBe("이니시스(빌링_일반)");
    expect(suggestKeywordFromDescription("쿠팡(쿠페이)_나이스")).toBe("쿠팡(쿠페이)");
    expect(suggestKeywordFromDescription("우아한형제들_배민페이_알뜰배달_")).toBe("우아한형제들");
    expect(suggestKeywordFromDescription("SK텔레콤(자동납부)")).toBe("SK텔레콤");
  });
});
