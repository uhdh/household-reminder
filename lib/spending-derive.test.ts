import { describe, expect, test } from "vitest";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import {
  buildMerchantMemory,
  buildRawCategoryFallback,
  buildRuleIndex,
  deriveTransactionFields,
  mapStdCategory,
  matchSelfTransferPairs,
  type MerchantMemorySourceRow,
  type RawCategoryFallbackSourceRow,
} from "@/lib/spending-derive";

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

  test("우선순위: 가맹점 기억은 매핑·급여 규칙이 비었을 때만 채우고, 원본 조합 폴백보다는 위", () => {
    const mappings = new Map([["지출|카페|미분류", "카페"]]);
    const memory = new Map([["스타벅스|지출", "식비"]]);

    // 매핑이 있으면 매핑이 이긴다(잠긴 예외에서 배운 값이 멀쩡한 자동 분류를 덮어쓰지 않도록)
    const spendRow = transaction({ txnType: "지출", category: "카페", subcategory: "미분류", description: "스타벅스", paymentMethod: "체크카드" });
    expect(mapStdCategory(spendRow, mappings, new Map(), [], { merchantMemory: memory })).toBe("카페");

    // 내장 급여 규칙도 가맹점 기억보다 우선
    const salaryMemory = new Map([["OO상사급여|수입", "기타수입"]]);
    const salaryRow = transaction({ txnType: "수입", description: "OO상사급여", category: "금융수입", subcategory: "미분류" });
    expect(mapStdCategory(salaryRow, new Map(), new Map(), [], { merchantMemory: salaryMemory })).toBe("월급");

    // 매핑이 없는 조합이면 가맹점 기억이 채우고, 원본 조합 폴백보다 우선한다
    const unmappedRow = transaction({ txnType: "지출", category: "기타소비", subcategory: "미분류", description: "스타벅스" });
    const fallback = new Map([["지출|기타소비|미분류", "기타"]]);
    expect(mapStdCategory(unmappedRow, new Map(), new Map(), [], { merchantMemory: memory, rawFallback: fallback })).toBe("식비");

    // 결제수단·키워드 규칙은 여전히 최우선
    const rules = buildRuleIndex([{ txnType: "지출", paymentMethod: "체크카드", stdCategory: "결제수단우선" }]);
    expect(mapStdCategory(spendRow, mappings, rules, [], { merchantMemory: memory })).toBe("결제수단우선");
    const keywordRules = [{ txnType: "지출", keyword: "스타벅스", stdCategory: "키워드우선" }];
    expect(mapStdCategory(spendRow, mappings, new Map(), keywordRules, { merchantMemory: memory })).toBe("키워드우선");
  });

  test("우선순위: 원본 조합 다수결 폴백은 매핑에도 없을 때만, null보다는 위에서 적용된다", () => {
    const row = transaction({ txnType: "지출", category: "기타소비", subcategory: "미분류", description: "알수없는가맹점" });
    expect(mapStdCategory(row, new Map())).toBeNull(); // 폴백 없으면 그대로 null

    const fallback = new Map([["지출|기타소비|미분류", "생활용품"]]);
    expect(mapStdCategory(row, new Map(), new Map(), [], { rawFallback: fallback })).toBe("생활용품");

    // 매핑이 있으면 폴백보다 매핑이 이긴다
    const mappings = new Map([["지출|기타소비|미분류", "매핑값"]]);
    expect(mapStdCategory(row, mappings, new Map(), [], { rawFallback: fallback })).toBe("매핑값");
  });
});

describe("buildMerchantMemory", () => {
  function memoryRow(overrides: Partial<MerchantMemorySourceRow>): MerchantMemorySourceRow {
    return {
      description: "스타벅스",
      txnType: "지출",
      stdCategory: "식비",
      categoryLocked: true,
      category: "카페",
      subcategory: "미분류",
      ...overrides,
    };
  }

  test("잠긴 행에서 80% 이상 일치하는 (가맹점, 거래유형)만 기억한다", () => {
    const rows = [
      memoryRow({}),
      memoryRow({}),
      memoryRow({}),
      memoryRow({ stdCategory: "카페" }), // 3/4=75% < 80% -> 기억 안 함
    ];
    expect(buildMerchantMemory(rows).get("스타벅스|지출")).toBeUndefined();

    const dominant = [...rows.slice(0, 3), memoryRow({})]; // 4/4 = 100%
    expect(buildMerchantMemory(dominant).get("스타벅스|지출")).toBe("식비");
  });

  test("잠기지 않은(category_locked=false) 행이나 std_category가 없는 행은 학습 대상에서 제외한다", () => {
    const rows = [
      memoryRow({ categoryLocked: false }),
      memoryRow({ stdCategory: null }),
    ];
    expect(buildMerchantMemory(rows).size).toBe(0);
  });

  test("서울페이 상품권 구매 장부 행(category='서울페이', subcategory='구매')은 잠겨 있어도 학습에서 제외한다", () => {
    const rows = [
      memoryRow({ category: "서울페이", subcategory: "구매", stdCategory: "자산수정", description: "온누리상품권 구매" }),
      memoryRow({ category: "서울페이", subcategory: "구매", stdCategory: "자산수정", description: "온누리상품권 구매" }),
    ];
    expect(buildMerchantMemory(rows).size).toBe(0);
  });
});

describe("buildRawCategoryFallback", () => {
  function fallbackRow(overrides: Partial<RawCategoryFallbackSourceRow>): RawCategoryFallbackSourceRow {
    return { txnType: "지출", category: "기타소비", subcategory: "미분류", stdCategory: "생활용품", ...overrides };
  }

  test("이 가구의 기존 분류(잠겼든 자동 매핑됐든) 중 80% 이상 일치하는 조합만 폴백으로 쓴다", () => {
    const rows = [fallbackRow({}), fallbackRow({}), fallbackRow({}), fallbackRow({ stdCategory: "잡화" })]; // 3/4=75%
    expect(buildRawCategoryFallback(rows).get("지출|기타소비|미분류")).toBeUndefined();

    const rows2 = [...rows.slice(0, 3), fallbackRow({})]; // 4/4=100%
    expect(buildRawCategoryFallback(rows2).get("지출|기타소비|미분류")).toBe("생활용품");
  });

  test("std_category가 없는 행은 집계에서 제외한다", () => {
    expect(buildRawCategoryFallback([fallbackRow({ stdCategory: null })]).size).toBe(0);
  });
});
