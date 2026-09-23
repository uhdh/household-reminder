import { describe, expect, it, vi, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { setDbForTesting } from "@/lib/db";
import { transactions, uploads } from "@/lib/finance-db";
import { GET } from "./route";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000099";

vi.mock("@/lib/finance-viewer-server", () => ({
  isFinanceDemoMode: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/require-household", () => ({
  requireHousehold: vi.fn().mockResolvedValue({ userId: "test-user", householdId: "00000000-0000-4000-8000-000000000099", role: "owner", email: "test@example.com" }),
  NoHouseholdError: class NoHouseholdError extends Error {},
}));

describe("Spending Export API Route", () => {
  afterEach(() => {
    setDbForTesting(null);
  });

  it("returns excel spreadsheet for the requested month and filters", async () => {
    const db = drizzle();
    setDbForTesting(db);

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
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);

    const uploadId = "00000000-0000-0000-0000-000000000001";
    await db.insert(uploads).values({
      id: uploadId,
      householdId: HOUSEHOLD_ID,
      personId: "husband",
      sourceFilename: "test.xlsx",
      isActive: true,
    });

    await db.insert(transactions).values([
      {
        id: "00000000-0000-0000-0000-000000000011",
        householdId: HOUSEHOLD_ID,
        uploadId,
        personId: "husband",
        txnDate: "2026-08-20",
        txnTime: "12:00:00",
        txnType: "지출",
        category: "식비",
        subcategory: "배달",
        description: "쿠팡이츠",
        amount: "-25000.00",
        paymentMethod: "체크카드",
        stdCategory: "식비",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
      {
        id: "00000000-0000-0000-0000-000000000012",
        householdId: HOUSEHOLD_ID,
        uploadId,
        personId: "husband",
        txnDate: "2026-07-15",
        txnTime: "10:00:00",
        txnType: "지출",
        category: "교통",
        subcategory: "대중교통",
        description: "지하철",
        amount: "-1500.00",
        paymentMethod: "교통카드",
        stdCategory: "교통",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/finance/spending/export?month=2026-08&person=husband");
    const response = await GET(req);

    expect(response.status).toBe(200);
    expect(decodeURIComponent(response.headers.get("Content-Disposition")!)).toContain("가계부_세부내역_2026-08");

    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const ws = workbook.getWorksheet("세부내역");
    expect(ws).toBeDefined();
    // Header + 1 filtered row for 2026-08
    expect(ws?.rowCount).toBe(2);

    const row = ws?.getRow(2);
    expect(row?.getCell(1).value).toBe("2026-08-20");
    expect(row?.getCell(3).value).toBe("지출");
    expect(row?.getCell(4).value).toBe("식비");
    expect(row?.getCell(5).value).toBe(-25000);
    expect(row?.getCell(6).value).toBe("쿠팡이츠");
  });
});
