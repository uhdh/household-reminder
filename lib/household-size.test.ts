// P3(남편/아내 일반화) 검증: 1인/2인/3인 가구 각각에서 월별 요약(summarizeMonthlyTransactions)과
// getActiveTransactions/getHouseholdPeople 기반 사람 필터가 올바르게 동작하는지, 그리고 기존
// 우리집(husband/wife, 2인) 형태가 그대로 회귀 없이 동작하는지 확인한다.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";
import { getActiveTransactions, getHouseholdPeople, summarizeMonthlyTransactions } from "@/lib/spending-queries";

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY, household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY, household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL
    )
  `);
}

function kindOf(): string {
  return "변동비";
}

function txnRow(overrides: Partial<typeof transactions.$inferInsert> & { householdId: string; uploadId: string; personId: string }) {
  return {
    id: crypto.randomUUID(),
    txnDate: "2026-09-10",
    txnType: "지출",
    category: "식비",
    stdCategory: "식비",
    amount: "-10000",
    included: true,
    isInternalTransfer: false,
    beneficiary: overrides.personId,
    ...overrides,
  };
}

describe("household size generalization", () => {
  afterEach(() => setDbForTesting(null));

  test("1인 가구: 필터/요약이 그 한 명 기준으로 정확히 동작한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const householdId = "00000000-0000-4000-8000-0000000000c1";
    const uploadId = "00000000-0000-0000-0000-0000000000c1";
    await db.insert(people).values({ id: "solo", householdId, displayName: "나" });
    await db.insert(uploads).values({ id: uploadId, householdId, personId: "solo", sourceFilename: "a.xlsx", isActive: true });
    await db.insert(transactions).values([
      txnRow({ householdId, uploadId, personId: "solo", amount: "-30000" }),
      txnRow({ householdId, uploadId, personId: "solo", txnType: "수입", stdCategory: "월급", amount: "1000000" }),
    ]);

    const people1 = await getHouseholdPeople(householdId);
    expect(people1).toEqual([{ id: "solo", displayName: "나" }]);

    const { transactions: tx, displayNameByPerson } = await getActiveTransactions(householdId);
    expect(tx).toHaveLength(2);
    expect(displayNameByPerson.get("solo")).toBe("나");

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["solo"]);
    expect(summary.totalExpenseByPerson).toEqual({ solo: 30000 });
    expect(summary.totalIncomeByPerson).toEqual({ solo: 1000000 });
  });

  test("2인 가구(기존 우리집 형태, husband/wife): 기존과 동일하게 동작한다(회귀 없음)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const householdId = "00000000-0000-4000-8000-0000000000c2";
    const uploadId = "00000000-0000-0000-0000-0000000000c2";
    await db.insert(people).values([
      { id: "husband", householdId, displayName: "남편" },
      { id: "wife", householdId, displayName: "아내" },
    ]);
    await db.insert(uploads).values([
      { id: uploadId, householdId, personId: "husband", sourceFilename: "h.xlsx", isActive: true },
      { id: "00000000-0000-0000-0000-0000000000c3", householdId, personId: "wife", sourceFilename: "w.xlsx", isActive: true },
    ]);
    await db.insert(transactions).values([
      txnRow({ householdId, uploadId, personId: "husband", txnType: "수입", stdCategory: "월급", amount: "3000000" }),
      txnRow({ householdId, uploadId: "00000000-0000-0000-0000-0000000000c3", personId: "wife", txnType: "수입", stdCategory: "월급", amount: "2000000" }),
      txnRow({ householdId, uploadId, personId: "husband", amount: "-1000000" }),
      txnRow({ householdId, uploadId: "00000000-0000-0000-0000-0000000000c3", personId: "wife", amount: "-500000" }),
    ]);

    const { transactions: tx, displayNameByPerson } = await getActiveTransactions(householdId);
    // 기존 PERSON_LABELS와 동일한 라벨이 나와야 한다(이제는 people.display_name에서 온다).
    expect(displayNameByPerson.get("husband")).toBe("남편");
    expect(displayNameByPerson.get("wife")).toBe("아내");

    const summary = summarizeMonthlyTransactions(tx, kindOf, ["husband", "wife"]);
    expect(summary.totalIncomeByPerson).toEqual({ husband: 3000000, wife: 2000000 });
    expect(summary.totalExpenseByPerson).toEqual({ husband: 1000000, wife: 500000 });
    expect(summary.balanceByPerson).toEqual({ husband: 2000000, wife: 1500000 });

    // 사람 필터: husband만 걸렀을 때 wife 거래가 안 섞인다.
    const husbandOnly = tx.filter((t) => t.personId === "husband");
    expect(husbandOnly).toHaveLength(2);
  });

  test("3인 가구: 세 명 모두 요약·필터에 정상 반영된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const householdId = "00000000-0000-4000-8000-0000000000c4";
    const uploadId = "00000000-0000-0000-0000-0000000000c4";
    await db.insert(people).values([
      { id: "p1", householdId, displayName: "엄마" },
      { id: "p2", householdId, displayName: "아빠" },
      { id: "p3", householdId, displayName: "첫째" },
    ]);
    await db.insert(uploads).values({ id: uploadId, householdId, personId: "p1", sourceFilename: "a.xlsx", isActive: true });
    await db.insert(transactions).values([
      txnRow({ householdId, uploadId, personId: "p1", amount: "-10000" }),
      txnRow({ householdId, uploadId, personId: "p2", amount: "-20000" }),
      txnRow({ householdId, uploadId, personId: "p3", amount: "-30000" }),
    ]);

    const peopleRows = await getHouseholdPeople(householdId);
    expect(peopleRows.map((p) => p.id).sort()).toEqual(["p1", "p2", "p3"]);

    const { transactions: tx } = await getActiveTransactions(householdId);
    const summary = summarizeMonthlyTransactions(tx, kindOf, ["p1", "p2", "p3"]);
    expect(summary.totalExpenseByPerson).toEqual({ p1: 10000, p2: 20000, p3: 30000 });
    expect(summary.totalExpense).toBe(60000);

    // p3만 필터링.
    const p3Only = tx.filter((t) => t.personId === "p3");
    expect(p3Only).toHaveLength(1);
    expect(p3Only[0].amount).toBe("-30000");
  });
});
