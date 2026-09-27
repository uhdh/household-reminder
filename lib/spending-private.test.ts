import { describe, expect, test } from "vitest";
import type { Txn } from "./spending-queries";
import { isMaskedFor, maskPrivateRows, rowMatchesCategory, rowMatchesQuery } from "./spending-private";

function makeTxn(overrides: Partial<Txn> = {}): Txn {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    householdId: "00000000-0000-4000-8000-0000000000a1",
    uploadId: "00000000-0000-4000-8000-0000000000d1",
    personId: "husband",
    txnDate: "2026-09-10",
    txnTime: "12:00:00",
    txnType: "지출",
    category: "쇼핑",
    subcategory: "선물",
    description: "아내 생일 선물",
    amount: "-50000",
    paymentMethod: "신한카드",
    stdCategory: "선물",
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    isPrivate: true,
    ...overrides,
  };
}

describe("maskPrivateRows", () => {
  test("파트너 시점: 비공개 거래의 내용 필드를 비우고 집계용 값은 유지한다", () => {
    const [row] = maskPrivateRows([makeTxn()], "wife");
    expect(row.masked).toBe(true);
    expect(row.description).toBeNull();
    expect(row.category).toBeNull();
    expect(row.subcategory).toBeNull();
    expect(row.paymentMethod).toBeNull();
    expect(row.amount).toBe("-50000");
    expect(row.stdCategory).toBe("선물");
    expect(row.included).toBe(true);
    expect(row.txnDate).toBe("2026-09-10");
    expect(row.beneficiary).toBe("husband");
  });

  test("본인 시점: 자기 비공개 거래는 그대로 보인다", () => {
    const [row] = maskPrivateRows([makeTxn()], "husband");
    expect(row.masked).toBe(false);
    expect(row.description).toBe("아내 생일 선물");
  });

  test("공개 거래는 누가 보든 그대로다", () => {
    const [row] = maskPrivateRows([makeTxn({ isPrivate: false })], "wife");
    expect(row.masked).toBe(false);
    expect(row.description).toBe("아내 생일 선물");
  });

  test("viewerPersonId가 null/undefined(연결 없음·데모)면 모든 비공개가 마스킹된다(fail-closed)", () => {
    expect(maskPrivateRows([makeTxn()], null)[0].masked).toBe(true);
    expect(maskPrivateRows([makeTxn()], undefined)[0].masked).toBe(true);
    expect(isMaskedFor({ isPrivate: true, personId: "husband" }, null)).toBe(true);
  });

  test("원본 배열을 바꾸지 않는다", () => {
    const original = makeTxn();
    maskPrivateRows([original], "wife");
    expect(original.description).toBe("아내 생일 선물");
  });
});

describe("목록 필터 헬퍼", () => {
  const masked = maskPrivateRows([makeTxn()], "wife")[0];
  const open = maskPrivateRows([makeTxn({ isPrivate: false })], "wife")[0];

  test("카테고리 필터: 조건이 있으면 마스킹 행은 stdCategory가 같아도 걸리지 않는다", () => {
    expect(rowMatchesCategory(masked, "all")).toBe(true);
    expect(rowMatchesCategory(masked, "선물")).toBe(false);
    expect(rowMatchesCategory(open, "선물")).toBe(true);
    expect(rowMatchesCategory(maskPrivateRows([makeTxn({ isPrivate: false, stdCategory: null })], "wife")[0], "미분류")).toBe(true);
    expect(rowMatchesCategory(masked, "미분류")).toBe(false);
  });

  test("검색: 마스킹 행은 검색어가 있으면 걸리지 않고, 없으면 통과한다", () => {
    expect(rowMatchesQuery(masked, "")).toBe(true);
    expect(rowMatchesQuery(masked, "선물")).toBe(false);
    expect(rowMatchesQuery(open, "생일")).toBe(true);
    expect(rowMatchesQuery(open, "없는말")).toBe(false);
  });
});
