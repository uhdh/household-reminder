// 나만 보기 조회 계층 검증(PGlite): 파트너 시점 마스킹, 소유자 시점, 연결 없음(fail-closed),
// 범위 조회, 가맹점 이력 제외, 마스킹 후에도 합계가 유지되는지.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { createPrivateSchema, H, ID_PRIV_H, ID_PRIV_W, ID_PUB, seedPrivateHousehold } from "@/lib/spending-private-fixtures";
import {
  countsInTotals,
  getActiveTransactions,
  getActiveTransactionsInRange,
  getAllActiveTransactionsUnmasked,
  getMerchantHistory,
  summarizeMonthlyTransactions,
} from "@/lib/spending-queries";

describe("나만 보기 조회 마스킹", () => {
  afterEach(() => setDbForTesting(null));

  async function setup() {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    await seedPrivateHousehold(db);
    return db;
  }

  test("파트너(아내) 시점: 남편의 비공개 거래는 내용이 비고 합계용 값만 남는다", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, "wife");
    const priv = rows.find((r) => r.id === ID_PRIV_H)!;
    expect(priv.masked).toBe(true);
    expect(priv.description).toBeNull();
    expect(priv.category).toBeNull();
    expect(priv.paymentMethod).toBeNull();
    expect(priv.stdCategory).toBe("선물");
    expect(Number(priv.amount)).toBe(-50000);
    expect(rows.find((r) => r.id === ID_PRIV_W)!.masked).toBe(false); // 내 비공개는 보인다
    expect(rows.find((r) => r.id === ID_PRIV_W)!.description).toBe("몰래 치킨");
    expect(rows.find((r) => r.id === ID_PUB)!.masked).toBe(false);
  });

  test("소유자(남편) 시점: 자기 비공개 거래는 그대로, 아내 것은 마스킹", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, "husband");
    expect(rows.find((r) => r.id === ID_PRIV_H)!.description).toBe("아내 생일 선물");
    expect(rows.find((r) => r.id === ID_PRIV_W)!.masked).toBe(true);
  });

  test("연결 없음(null): 비공개 거래는 전부 마스킹된다(fail-closed)", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, null);
    expect(rows.filter((r) => r.masked).map((r) => r.id).sort()).toEqual([ID_PRIV_H, ID_PRIV_W].sort());
    expect(rows.find((r) => r.id === ID_PUB)!.masked).toBe(false);
  });

  test("범위 조회도 같은 마스킹을 한다", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactionsInRange(H, "2026-08-01", "2026-09-01", "wife");
    expect(rows.find((r) => r.id === ID_PRIV_H)!.masked).toBe(true);
    expect(rows).toHaveLength(3);
  });

  test("가맹점 이력에는 파트너의 비공개 거래가 없고 내 비공개는 있다", async () => {
    await setup();
    const history = await getMerchantHistory(H, "wife");
    expect(history.map((r) => r.id).sort()).toEqual([ID_PRIV_W, ID_PUB].sort());
    expect(history.some((r) => r.description === "아내 생일 선물")).toBe(false);
  });

  test("마스킹해도 월 합계와 카테고리 합계는 비공개를 포함한 값과 같다", async () => {
    await setup();
    const kindOf = () => "변동비";
    const totalsFor = async (viewer: string | null) => {
      const { transactions: rows } = await getActiveTransactionsInRange(H, "2026-08-01", "2026-09-01", viewer);
      return summarizeMonthlyTransactions(rows.filter(countsInTotals), kindOf, ["husband", "wife"]);
    };
    for (const viewer of ["wife", "husband", null]) {
      const s = await totalsFor(viewer);
      expect(s.totalExpense).toBe(90000);
      expect(s.categoryTotals.get("선물")).toBe(50000);
      expect(s.categoryTotals.get("식비")).toBe(40000);
    }
  });

  test("시스템용 조회는 마스킹 없이 전체를 돌려준다", async () => {
    await setup();
    const { transactions: rows } = await getAllActiveTransactionsUnmasked(H);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === ID_PRIV_H)!.description).toBe("아내 생일 선물");
  });
});
