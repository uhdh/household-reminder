import { describe, expect, test } from "vitest";
import type { ParsedTransaction } from "@/lib/finance-parse/types";
import {
  buildHistoryIndex,
  buildRuleIndex,
  deriveTransactionFields,
  mapStdCategory,
  matchSelfTransferPairs,
  predictFromHistory,
  type HistorySourceRow,
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

  test("우선순위(새로 올리는 거래): 키워드·결제수단 규칙 → 분류 이력 → 급여 → 매핑", () => {
    const history = buildHistoryIndex([
      historyRow({ description: "스타벅스", category: "카페", subcategory: "미분류", stdCategory: "간식" }),
    ]);
    const mappings = new Map([["지출|카페|미분류", "카페"]]);
    const spendRow = transaction({ txnType: "지출", category: "카페", subcategory: "미분류", description: "스타벅스", paymentMethod: "체크카드" });

    // 새 거래: 이력이 매핑보다 먼저
    expect(mapStdCategory(spendRow, mappings, new Map(), [], { history, historyFirst: true })).toBe("간식");
    // 기존 거래 다시 분류: 매핑이 이기고, 이력은 비었을 때만
    expect(mapStdCategory(spendRow, mappings, new Map(), [], { history, historyFirst: false })).toBe("카페");
    expect(mapStdCategory(spendRow, new Map(), new Map(), [], { history, historyFirst: false })).toBe("간식");

    // 사용자 규칙(결제수단·키워드)은 항상 최우선
    const rules = buildRuleIndex([{ txnType: "지출", paymentMethod: "체크카드", stdCategory: "결제수단우선" }]);
    expect(mapStdCategory(spendRow, mappings, rules, [], { history, historyFirst: true })).toBe("결제수단우선");
    const keywordRules = [{ txnType: "지출", keyword: "스타벅스", stdCategory: "키워드우선" }];
    expect(mapStdCategory(spendRow, mappings, new Map(), keywordRules, { history, historyFirst: true })).toBe("키워드우선");
  });

  test("이력은 이체에는 쓰지 않는다(저축 이체 → 월급 같은 오류 방지)", () => {
    const history = buildHistoryIndex([historyRow({ txnType: "수입", category: "저축", subcategory: "미분류", stdCategory: "월급" })]);
    const transfer = transaction({ txnType: "이체", category: "저축", subcategory: "미분류", description: "적금" });
    expect(mapStdCategory(transfer, new Map(), new Map(), [], { history, historyFirst: true })).toBeNull();
  });
});

function historyRow(overrides: Partial<HistorySourceRow>): HistorySourceRow {
  return { description: "가게", txnType: "지출", category: "식비", subcategory: "식비", stdCategory: "식비", ...overrides };
}

describe("predictFromHistory (가맹점+분류 → 분류 → 대분류 → 가맹점)", () => {
  const history = buildHistoryIndex([
    // "서비스구독"은 보통 구독이지만, 쏘카만 렌트카
    historyRow({ description: "넷플릭스", category: "온라인쇼핑", subcategory: "서비스구독", stdCategory: "구독" }),
    historyRow({ description: "유튜브", category: "온라인쇼핑", subcategory: "서비스구독", stdCategory: "구독" }),
    historyRow({ description: "쏘카", category: "온라인쇼핑", subcategory: "서비스구독", stdCategory: "렌트카" }),
    historyRow({ description: "김밥집", category: "식비", subcategory: "식비", stdCategory: "식비" }),
    historyRow({ description: "빵집", category: "식비", subcategory: "베이커리", stdCategory: "간식" }),
  ]);

  test("같은 가맹점이 같은 뱅크샐러드 분류로 왔던 적이 있으면 그 카테고리(예외 가맹점)", () => {
    expect(predictFromHistory(transaction({ txnType: "지출", category: "온라인쇼핑", subcategory: "서비스구독", description: "쏘카" }), history)).toBe("렌트카");
  });

  test("처음 보는 가맹점은 그 뱅크샐러드 분류의 최다 카테고리", () => {
    expect(predictFromHistory(transaction({ txnType: "지출", category: "온라인쇼핑", subcategory: "서비스구독", description: "디즈니플러스" }), history)).toBe("구독");
  });

  test("분류 조합도 처음이면 대분류 기준, 그것도 없으면 가맹점 기준", () => {
    expect(predictFromHistory(transaction({ txnType: "지출", category: "식비", subcategory: "한식", description: "처음가게" }), history)).toBe("식비");
    expect(predictFromHistory(transaction({ txnType: "지출", category: "새분류", subcategory: "미분류", description: "김밥집" }), history)).toBe("식비");
  });

  test("자산수정·미분류·서울페이 구매 장부는 학습하지 않는다", () => {
    const h = buildHistoryIndex([
      historyRow({ stdCategory: "자산수정" }),
      historyRow({ stdCategory: "미분류" }),
      historyRow({ category: "서울페이", subcategory: "구매", stdCategory: "기타" }),
    ]);
    expect(predictFromHistory(transaction({ txnType: "지출", category: "식비", subcategory: "식비", description: "가게" }), h)).toBeNull();
  });
});
