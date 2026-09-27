import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportTransactionsToExcel } from "./spending-export";
import type { Txn } from "./spending-queries";

describe("exportTransactionsToExcel", () => {
  it("generates a valid excel file with correct columns and data", async () => {
    const mockTx: Txn[] = [
      {
        id: "tx-1",
        householdId: "household-1",
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
        categoryLocked: false, isPrivate: false,
      },
      {
        id: "tx-2",
        householdId: "household-1",
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
        categoryLocked: false, isPrivate: false,
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

  it("마스킹 행은 실제 값이 있어도 설명 '비공개 거래' 외 시간·금액·분류·결제수단·원본 분류를 내보내지 않는다", async () => {
    const real: Txn = {
      id: "tx-secret",
      householdId: "household-1",
      uploadId: "u-1",
      personId: "husband",
      txnDate: "2026-08-25",
      txnTime: "12:30:00",
      txnType: "지출",
      category: "쇼핑",
      subcategory: "선물",
      description: "아내 생일 선물",
      amount: "-50000.00",
      paymentMethod: "신한카드",
      stdCategory: "선물",
      included: true,
      isInternalTransfer: false,
      beneficiary: "husband",
      categoryLocked: false,
      isPrivate: true,
    };
    const names = new Map([["husband", "남편"]]);
    const readRow = async (rows: (Txn & { masked?: boolean })[]) => {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load((await exportTransactionsToExcel(rows, names)).buffer as ArrayBuffer);
      return workbook.getWorksheet("세부내역")!.getRow(2);
    };

    const masked = await readRow([{ ...real, masked: true }]);
    expect(masked.getCell(1).value).toBe("2026-08-25"); // 날짜는 유지
    expect(masked.getCell(2).value ?? "").toBe(""); // 시간
    expect(masked.getCell(4).value ?? "").toBe(""); // 카테고리
    expect(masked.getCell(5).value ?? null).toBeNull(); // 금액
    expect(masked.getCell(6).value).toBe("비공개 거래"); // 내용
    expect(masked.getCell(7).value ?? "").toBe(""); // 결제수단
    expect(masked.getCell(10).value ?? "").toBe(""); // 원본 대분류
    expect(masked.getCell(11).value ?? "").toBe(""); // 원본 소분류

    // 같은 값이라도 마스킹이 아니면 그대로 나온다(위 결과가 단순 빈 값 처리가 아니라 마스킹임을 증명).
    const plain = await readRow([{ ...real, masked: false }]);
    expect(plain.getCell(2).value).toBe("12:30:00");
    expect(plain.getCell(4).value).toBe("선물");
    expect(plain.getCell(5).value).toBe(-50000);
    expect(plain.getCell(6).value).toBe("아내 생일 선물");
    expect(plain.getCell(7).value).toBe("신한카드");
    expect(plain.getCell(10).value).toBe("쇼핑");
    expect(plain.getCell(11).value).toBe("선물");
  });
});
