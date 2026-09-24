import ExcelJS from "exceljs";
import { beneficiaryLabel, flowLabel, toNum, type Txn } from "./spending-queries";

export async function exportTransactionsToExcel(
  transactions: Txn[],
  displayNameByPerson: Map<string, string> = new Map()
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "우리집 가계부";
  workbook.lastModifiedBy = "우리집 가계부";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("세부내역", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "날짜", key: "txnDate", width: 13 },
    { header: "시간", key: "txnTime", width: 11 },
    { header: "구분", key: "flow", width: 9 },
    { header: "카테고리", key: "stdCategory", width: 15 },
    { header: "금액", key: "amount", width: 15 },
    { header: "내용", key: "description", width: 30 },
    { header: "결제수단", key: "paymentMethod", width: 22 },
    { header: "결제자", key: "payer", width: 10 },
    { header: "사용대상", key: "beneficiary", width: 10 },
    { header: "원본 대분류", key: "rawCategory", width: 15 },
    { header: "원본 소분류", key: "rawSubcategory", width: 15 },
    { header: "집계포함", key: "included", width: 10 },
  ];

  // Header style
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Malgun Gothic", size: 10, bold: true, color: { argb: "FF191F28" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F4F6" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE5E8EB" } },
      left: { style: "thin", color: { argb: "FFE5E8EB" } },
      bottom: { style: "medium", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFE5E8EB" } },
    };
  });

  for (const t of transactions) {
    const flow = flowLabel(t);
    const amountVal = toNum(t.amount);
    const payer = beneficiaryLabel(t.personId, displayNameByPerson);
    const beneficiaryText = beneficiaryLabel(t.beneficiary, displayNameByPerson);

    const row = worksheet.addRow({
      txnDate: t.txnDate,
      txnTime: t.txnTime ?? "",
      flow,
      stdCategory: t.stdCategory ?? "미분류",
      amount: flow === "입금" ? Math.abs(amountVal) : -Math.abs(amountVal),
      description: t.description ?? "",
      paymentMethod: t.paymentMethod ?? "",
      payer,
      beneficiary: beneficiaryText,
      rawCategory: t.category ?? "",
      rawSubcategory: t.subcategory ?? "",
      included: t.included ? "Y" : "N",
    });

    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: "Malgun Gothic", size: 9.5 };
      cell.border = {
        top: { style: "thin", color: { argb: "FFF2F4F6" } },
        left: { style: "thin", color: { argb: "FFF2F4F6" } },
        bottom: { style: "thin", color: { argb: "FFE5E8EB" } },
        right: { style: "thin", color: { argb: "FFF2F4F6" } },
      };

      // Alignment and number formatting
      if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 4 || colNumber === 8 || colNumber === 9 || colNumber === 10 || colNumber === 11 || colNumber === 12) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else if (colNumber === 5) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0;[Red]-#,##0;0";
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }

      if (colNumber === 3) {
        if (flow === "입금") {
          cell.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF008A12" }, bold: true };
        } else {
          cell.font = { name: "Malgun Gothic", size: 9.5, color: { argb: "FF191F28" } };
        }
      }
    });
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 12 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

