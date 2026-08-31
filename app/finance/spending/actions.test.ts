import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { deleteTransactionsAction } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("deleteTransactionsAction", () => {
  afterEach(() => setDbForTesting(null));

  test("deletes only the selected transactions", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
        txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);
    const rows = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"].map((id) => ({
      id,
      uploadId: "00000000-0000-0000-0000-000000000001",
      personId: "wife",
      txnDate: "2026-08-01",
      txnType: "지출",
      amount: "-1000",
      included: true,
      isInternalTransfer: false,
      beneficiary: "wife",
    }));
    await db.insert(transactions).values(rows);
    const formData = new FormData();
    formData.append("txnId", rows[0].id);
    formData.set("returnTo", "/finance/spending?month=2026-08");

    await deleteTransactionsAction(formData);

    expect((await db.select({ id: transactions.id }).from(transactions)).map((row) => row.id)).toEqual([rows[1].id]);
  });
});
