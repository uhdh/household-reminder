import { describe, expect, it } from "vitest";
import {
  buildFlatOptionOrder,
  buildMerchantCategoryIndex,
  buildMerchantCounts,
  buildRawCategoryIndex,
  displayCategoryLabel,
  findMatchingTransactionIds,
  findNextUnclassifiedId,
  merchantCountKey,
  recommendCategoriesForTransaction,
  topFrequentCategories,
} from "./category-suggest";

describe("buildMerchantCategoryIndex", () => {
  it("picks the most frequent stdCategory per normalized merchant key", () => {
    const txns = [
      { description: "(주)스타벅스", category: null, subcategory: null, stdCategory: "카페" },
      { description: "스타벅스", category: null, subcategory: null, stdCategory: "카페" },
      { description: "스타벅스", category: null, subcategory: null, stdCategory: "식비" },
      { description: null, category: null, subcategory: null, stdCategory: "기타" },
    ];
    expect(buildMerchantCategoryIndex(txns)).toEqual({ 스타벅스: "카페" });
  });
});

describe("buildRawCategoryIndex", () => {
  it("picks the most frequent stdCategory per raw category/subcategory pair", () => {
    const txns = [
      { description: null, category: "식비", subcategory: "외식", stdCategory: "식비" },
      { description: null, category: "식비", subcategory: "외식", stdCategory: "식비" },
      { description: null, category: "식비", subcategory: "외식", stdCategory: "카페" },
    ];
    expect(buildRawCategoryIndex(txns)).toEqual({ "식비|외식": "식비" });
  });
});

describe("buildMerchantCounts", () => {
  it("counts transactions per normalized merchant key + txnType", () => {
    const txns = [
      { description: "스타벅스", txnType: "지출" },
      { description: "(주)스타벅스", txnType: "지출" },
      { description: "스타벅스", txnType: "수입" }, // 다른 txnType은 별도로 카운트
      { description: "이디야", txnType: "지출" },
    ];
    expect(buildMerchantCounts(txns)).toEqual({
      [merchantCountKey("스타벅스", "지출")]: 2,
      [merchantCountKey("스타벅스", "수입")]: 1,
      [merchantCountKey("이디야", "지출")]: 1,
    });
  });
});

describe("topFrequentCategories", () => {
  it("ranks by frequency, excluding 자산수정, capped at limit", () => {
    const txns = [
      { stdCategory: "식비" },
      { stdCategory: "식비" },
      { stdCategory: "카페" },
      { stdCategory: "자산수정" },
      { stdCategory: null },
    ];
    expect(topFrequentCategories(txns, 1)).toEqual(["식비"]);
    expect(topFrequentCategories(txns)).toEqual(["식비", "카페"]);
  });
});

describe("recommendCategoriesForTransaction", () => {
  it("prefers merchant match then raw category match, deduped", () => {
    const merchantIndex = { 스타벅스: "카페" };
    const rawIndex = { "식비|외식": "카페" };
    const recs = recommendCategoriesForTransaction(
      { description: "스타벅스", category: "식비", subcategory: "외식" },
      merchantIndex,
      rawIndex
    );
    expect(recs).toEqual(["카페"]);
  });

  it("returns both when they differ", () => {
    const merchantIndex = { 스타벅스: "카페" };
    const rawIndex = { "식비|외식": "식비" };
    const recs = recommendCategoriesForTransaction(
      { description: "스타벅스", category: "식비", subcategory: "외식" },
      merchantIndex,
      rawIndex
    );
    expect(recs).toEqual(["카페", "식비"]);
  });
});

describe("buildFlatOptionOrder", () => {
  const options = [{ name: "식비" }, { name: "식재료" }, { name: "렌트카" }];

  it("filters by substring when a query is given", () => {
    expect(buildFlatOptionOrder("식", options, [], [])).toEqual(["식비", "식재료"]);
  });

  it("orders recommendations, then frequent, then the rest when no query", () => {
    expect(buildFlatOptionOrder("", options, ["렌트카"], ["식재료"])).toEqual(["렌트카", "식재료", "식비"]);
  });
});

describe("findMatchingTransactionIds", () => {
  it("only matches the exact normalized merchant key and txnType, excluding a given id", () => {
    const txns = [
      { id: "a", description: "스타벅스", txnType: "지출" },
      { id: "b", description: "(주)스타벅스", txnType: "지출" }, // 정규화하면 같은 키
      { id: "c", description: "스타벅스", txnType: "수입" }, // 다른 txnType
      { id: "d", description: "GS칼텍스", txnType: "지출" }, // ILIKE라면 "GS"에 걸릴 무관한 거래
      { id: "e", description: "스타벅스", txnType: "지출" },
    ];
    expect(findMatchingTransactionIds(txns, "스타벅스", "지출")).toEqual(["a", "b", "e"]);
    expect(findMatchingTransactionIds(txns, "스타벅스", "지출", "a")).toEqual(["b", "e"]);
  });

  it("caps results at the given limit", () => {
    const txns = Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, description: "스타벅스", txnType: "지출" }));
    expect(findMatchingTransactionIds(txns, "스타벅스", "지출", undefined, 2)).toEqual(["t0", "t1"]);
  });
});

describe("findNextUnclassifiedId", () => {
  it("returns the first unclassified transaction excluding a given id", () => {
    const items = [
      { id: "a", stdCategory: "식비" },
      { id: "b", stdCategory: null },
      { id: "c", stdCategory: null },
    ];
    expect(findNextUnclassifiedId(items)).toBe("b");
    expect(findNextUnclassifiedId(items, "b")).toBe("c");
  });

  it("returns null when everything is classified", () => {
    expect(findNextUnclassifiedId([{ id: "a", stdCategory: "식비" }])).toBeNull();
  });
});

describe("displayCategoryLabel", () => {
  it("shows 자산수정 as 집계 제외, keeps others, and 미분류 for null", () => {
    expect(displayCategoryLabel("자산수정")).toBe("집계 제외");
    expect(displayCategoryLabel("식비")).toBe("식비");
    expect(displayCategoryLabel(null)).toBe("미분류");
  });
});
