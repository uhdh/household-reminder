import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportTransactionsToExcel } from "./spending-export";
import type { Txn } from "./spending-queries";

describe("exportTransactionsToExcel", () => {
  it("generates a valid excel file with correct columns and data", async () => {
    const mockTx: Txn[] = [
      {
        id: "tx-1",
        uploadId: "u-1",
        personId: "husband",
        txnDate: "2026-08-25",
        txnTime: "12:30:00",
        txnType: "지출",
        category: "온라인쇼핑",
        subcategory: "서비스구독",
        description: "(주)이니시스(빌링_일반)",
        amount: "-2660.00",
        paymentMethod: "SK패밀리카드",
        stdCategory: "렌트카",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
      {
        id: "tx-2",
        uploadId: "u-1",
        personId: "wife",
        txnDate: "2026-08-01",
        txnTime: "10:00:00",
        txnType: "수입",
        category: "금융수입",
        subcategory: "미분류",
        description: "이자",
        amount: "500.00",
        paymentMethod: "생활통장",
        stdCategory: "금융수입",
        included: true,
        isInternalTransfer: false,
        beneficiary: "wife",
      },
    ];

    const displayNameByPerson = new Map([
      ["husband", "남편"],
      ["wife", "아내"],
    ]);

    const buffer = await exportTransactionsToExcel(mockTx, displayNameByPerson);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);

    const ws = workbook.getWorksheet("세부내역");
    expect(ws).toBeDefined();
    expect(ws?.rowCount).toBe(3); // header + 2 data rows

    // Check header row
    const headerRow = ws?.getRow(1);
    expect(headerRow?.getCell(1).value).toBe("날짜");
    expect(headerRow?.getCell(3).value).toBe("구분");
    expect(headerRow?.getCell(4).value).toBe("카테고리");
    expect(headerRow?.getCell(5).value).toBe("금액");
    expect(headerRow?.getCell(6).value).toBe("내용");

    // Check first transaction row
    const row1 = ws?.getRow(2);
    expect(row1?.getCell(1).value).toBe("2026-08-25");
    expect(row1?.getCell(3).value).toBe("지출");
    expect(row1?.getCell(4).value).toBe("렌트카");
    expect(row1?.getCell(5).value).toBe(-2660);
    expect(row1?.getCell(6).value).toBe("(주)이니시스(빌링_일반)");
    expect(row1?.getCell(8).value).toBe("남편");
    expect(row1?.getCell(9).value).toBe("남편");
    expect(row1?.getCell(12).value).toBe("Y");

    // Check second transaction row
    const row2 = ws?.getRow(3);
    expect(row2?.getCell(1).value).toBe("2026-08-01");
    expect(row2?.getCell(3).value).toBe("입금");
    expect(row2?.getCell(4).value).toBe("금융수입");
    expect(row2?.getCell(5).value).toBe(500);
    expect(row2?.getCell(8).value).toBe("아내");
    expect(row2?.getCell(9).value).toBe("아내");
  });
});
