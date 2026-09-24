// 쿼리 범위 축소(월별=해당 월+전월, 연간=해당 연도, 세부 내역=해당 월) 회귀 테스트.
// "전체 로드 후 JS 필터"(getActiveTransactions) 결과와 "범위 쿼리"(getActiveTransactionsInRange 등)
// 결과가 항상 같은지 PGlite로 검증한다: 월 경계, 전월이 전년 12월인 1월, 비활성 업로드 제외,
// 다른 가구 제외.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "./db";
import { transactions, uploads } from "./finance-db";
import {
  countsInTotals,
  getActiveTransactions,
  getActiveTransactionsInRange,
  getLatestActivePeriod,
  getLatestVisibleMonth,
  getMerchantHistory,
  hasAnyTransaction,
  latestMonth,
  latestYear,
  monthKeyOf,
  shiftMonth,
  yearOf,
} from "./spending-queries";

const HOUSEHOLD_A = "00000000-0000-4000-8000-00000000000a";
const HOUSEHOLD_B = "00000000-0000-4000-8000-00000000000b";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY, household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true,
      uploaded_at timestamp with time zone NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY, household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
      amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
      is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
}

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

const UPLOAD_A = "00000000-0000-4000-9000-0000000000a1";
const UPLOAD_B = "00000000-0000-4000-9000-0000000000b1";

function txnRow(overrides: Partial<typeof transactions.$inferInsert>) {
  return {
    id: uuid(),
    householdId: HOUSEHOLD_A,
    uploadId: UPLOAD_A,
    personId: "husband",
    txnDate: "2026-08-10",
    txnType: "지출",
    category: "식비",
    subcategory: "한식",
    description: "코스트코",
    amount: "-10000",
    stdCategory: "식비",
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    ...overrides,
  };
}

async function seedBaseline(db: ReturnType<typeof drizzle>) {
  await createSchema(db);
  await db.insert(uploads).values([
    { id: UPLOAD_A, householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "a.xlsx", isActive: true, uploadedAt: new Date("2026-08-01") },
    { id: UPLOAD_B, householdId: HOUSEHOLD_B, personId: "husband", sourceFilename: "b.xlsx", isActive: true, uploadedAt: new Date("2026-08-01") },
  ]);
  await db.insert(transactions).values([
    // household A: 2025년 12월, 2026년 1월, 2026년 8월에 걸친 거래 + 미분류 이체(집계 제외 대상)
    txnRow({ id: uuid(), txnDate: "2025-12-20", description: "12월 거래", amount: "-5000" }),
    txnRow({ id: uuid(), txnDate: "2026-01-05", description: "1월 거래", amount: "-7000" }),
    txnRow({ id: uuid(), txnDate: "2026-01-31", description: "1월 말 거래", amount: "-1000" }),
    txnRow({ id: uuid(), txnDate: "2026-02-01", description: "2월 첫날 거래", amount: "-2000" }),
    txnRow({ id: uuid(), txnDate: "2026-08-15", description: "8월 거래", amount: "-3000" }),
    txnRow({ id: uuid(), txnDate: "2026-08-16", txnType: "이체", stdCategory: null, description: "미분류 이체", amount: "-9000" }),
    // household B: 같은 날짜에도 절대 섞이면 안 됨
    txnRow({ id: uuid(), householdId: HOUSEHOLD_B, uploadId: UPLOAD_B, txnDate: "2026-08-15", description: "B의 거래" }),
  ]);
}

describe("query scoping matches full-load-then-filter", () => {
  afterEach(() => setDbForTesting(null));

  test("getActiveTransactionsInRange == getActiveTransactions filtered by date range (month boundary, other household excluded)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    const full = await getActiveTransactions(HOUSEHOLD_A);
    const expectedAugust = full.transactions.filter((t) => monthKeyOf(t.txnDate) === "2026-08").map((t) => t.id).sort();

    const scoped = await getActiveTransactionsInRange(HOUSEHOLD_A, "2026-08-01", "2026-09-01");
    expect(scoped.transactions.map((t) => t.id).sort()).toEqual(expectedAugust);
    // 2월 첫날 거래(범위 밖)나 B의 거래가 섞여 들어오지 않는다.
    expect(scoped.transactions.some((t) => t.description === "2월 첫날 거래")).toBe(false);
    expect(scoped.transactions.some((t) => t.description === "B의 거래")).toBe(false);
  });

  test("전월이 전년 12월인 1월: prevMonth+month range fetch includes both", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    const month = "2026-01";
    const prevMonth = shiftMonth(month, -1);
    expect(prevMonth).toBe("2025-12");

    const scoped = await getActiveTransactionsInRange(HOUSEHOLD_A, `${prevMonth}-01`, `${shiftMonth(month, 1)}-01`);
    const descriptions = scoped.transactions.map((t) => t.description).sort();
    expect(descriptions).toEqual(["12월 거래", "1월 거래", "1월 말 거래"].sort());
  });

  test("getLatestActivePeriod matches latestMonth/latestYear(includedTx) from a full load", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    const full = await getActiveTransactions(HOUSEHOLD_A);
    const includedTx = full.transactions.filter(countsInTotals);
    const expected = { month: latestMonth(includedTx), year: latestYear(includedTx) };

    const scoped = await getLatestActivePeriod(HOUSEHOLD_A);
    expect(scoped).toEqual(expected);
  });

  test("getLatestActivePeriod falls back to current month/year when household has no rows", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const scoped = await getLatestActivePeriod(HOUSEHOLD_A);
    const now = new Date();
    expect(scoped.year).toBe(now.getFullYear());
    expect(scoped.month).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  });

  test("getLatestVisibleMonth matches latestMonth(visibleTx) from a full load (includes 자산수정)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(uploads).values({ id: UPLOAD_A, householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "a.xlsx", isActive: true, uploadedAt: new Date("2026-08-01") });
    await db.insert(transactions).values([
      txnRow({ id: uuid(), txnDate: "2026-08-01", included: true, stdCategory: "식비" }),
      // included=false지만 자산수정이라 visibleTx엔 들어가는, 가장 최근 날짜의 거래
      txnRow({ id: uuid(), txnDate: "2026-09-20", included: false, stdCategory: "자산수정" }),
    ]);

    const full = await getActiveTransactions(HOUSEHOLD_A);
    const visibleTx = full.transactions.filter((t) => t.included || t.stdCategory === "자산수정");
    expect(await getLatestVisibleMonth(HOUSEHOLD_A)).toBe(latestMonth(visibleTx));
    expect(await getLatestVisibleMonth(HOUSEHOLD_A)).toBe("2026-09");
  });

  test("hasAnyTransaction respects household isolation", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    expect(await hasAnyTransaction(HOUSEHOLD_A)).toBe(true);
    expect(await hasAnyTransaction(HOUSEHOLD_B)).toBe(true);
    expect(await hasAnyTransaction("00000000-0000-4000-8000-0000000000ff")).toBe(false);
  });

  test("getMerchantHistory matches getActiveTransactions mapped to the same columns, isolated per household", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    const full = await getActiveTransactions(HOUSEHOLD_A);
    const expected = full.transactions
      .map(({ id, description, category, subcategory, stdCategory, txnType }) => ({ id, description, category, subcategory, stdCategory, txnType }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const history = await getMerchantHistory(HOUSEHOLD_A);
    expect(history.slice().sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
    expect(history.some((row) => row.description === "B의 거래")).toBe(false);
  });

  test("연간 범위 쿼리 == getActiveTransactions를 연도로 필터한 것과 같다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await seedBaseline(db);

    const full = await getActiveTransactions(HOUSEHOLD_A);
    const expected2026 = full.transactions.filter((t) => yearOf(t.txnDate) === 2026).map((t) => t.id).sort();

    const scoped = await getActiveTransactionsInRange(HOUSEHOLD_A, "2026-01-01", "2027-01-01");
    expect(scoped.transactions.map((t) => t.id).sort()).toEqual(expected2026);
  });

  test("비활성 업로드로 대체된(같은 personId+날짜) 행은 범위 쿼리에서도 제외된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const oldUploadId = uuid();
    const newUploadId = uuid();
    await db.insert(uploads).values([
      { id: oldUploadId, householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "old.xlsx", isActive: false, uploadedAt: new Date("2026-08-01") },
      { id: newUploadId, householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "new.xlsx", isActive: true, uploadedAt: new Date("2026-08-31") },
    ]);
    await db.insert(transactions).values([
      txnRow({ id: uuid(), uploadId: oldUploadId, txnDate: "2026-08-01", amount: "-9999", description: "옛 버전" }),
      txnRow({ id: uuid(), uploadId: newUploadId, txnDate: "2026-08-01", amount: "-1000", description: "최신 버전" }),
    ]);

    const scoped = await getActiveTransactionsInRange(HOUSEHOLD_A, "2026-08-01", "2026-09-01");
    expect(scoped.transactions).toHaveLength(1);
    expect(scoped.transactions[0].description).toBe("최신 버전");
  });
});
