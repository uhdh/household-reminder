import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "./db";
import { transactions, uploads } from "./finance-db";
import { getActiveTransactions } from "./spending-queries";

describe("getActiveTransactions", () => {
  afterEach(() => setDbForTesting(null));

  test("keeps old dates but uses only the newest upload for overlapping dates", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await db.execute(sql`
      CREATE TABLE uploads (
        id uuid PRIMARY KEY, person_id text NOT NULL, source_filename text NOT NULL,
        period_start date, period_end date, is_active boolean NOT NULL, uploaded_at timestamptz NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
        txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);
    await db.insert(uploads).values([
      { id: "00000000-0000-0000-0000-000000000001", personId: "wife", sourceFilename: "과거.xlsx", isActive: false, uploadedAt: new Date("2026-08-01") },
      { id: "00000000-0000-0000-0000-000000000002", personId: "wife", sourceFilename: "최신.xlsx", isActive: true, uploadedAt: new Date("2026-08-31") },
    ]);
    await db.insert(transactions).values([
      {
        id: "00000000-0000-0000-0000-000000000011", uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "wife", txnDate: "2026-07-31", txnType: "지출", amount: "-1000", included: true,
        isInternalTransfer: false, beneficiary: "wife",
      },
      {
        id: "00000000-0000-0000-0000-000000000012", uploadId: "00000000-0000-0000-0000-000000000002",
        personId: "wife", txnDate: "2026-08-01", txnType: "지출", amount: "-2000", included: true,
        isInternalTransfer: false, beneficiary: "wife",
      },
      {
        id: "00000000-0000-0000-0000-000000000013", uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "wife", txnDate: "2026-08-01", txnType: "지출", amount: "-9999", included: true,
        isInternalTransfer: false, beneficiary: "wife",
      },
    ]);

    const result = await getActiveTransactions();

    expect(result.transactions.map((row) => row.txnDate).sort()).toEqual(["2026-07-31", "2026-08-01"]);
    expect(result.transactions.find((row) => row.txnDate === "2026-08-01")?.amount).toBe("-2000");
  });
});
