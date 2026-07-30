import ExcelJS from "exceljs";
import { parseAssetItems, parseCustomerName } from "./bank-status";
import { parseTransactions } from "./ledger";
import type { ParsedUpload } from "./types";

export * from "./types";

const FILENAME_PERIOD_RE = /(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/;

export async function parseUploadFile(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParsedUpload> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const statusSheet = workbook.getWorksheet("뱅샐현황");
  const ledgerSheet = workbook.getWorksheet("가계부 내역");
  if (!statusSheet || !ledgerSheet) {
    throw new Error(
      "엑셀 파일에서 '뱅샐현황' 또는 '가계부 내역' 시트를 찾을 수 없습니다. 뱅크샐러드에서 내보낸 파일이 맞는지 확인해 주세요."
    );
  }

  const customerName = parseCustomerName(statusSheet);
  const assetItems = parseAssetItems(statusSheet);
  const transactions = parseTransactions(ledgerSheet);

  const nameMatch = filename.match(FILENAME_PERIOD_RE);
  let periodStart = nameMatch ? nameMatch[1] : null;
  let periodEnd = nameMatch ? nameMatch[2] : null;

  if (!periodStart || !periodEnd) {
    const dates = transactions.map((t) => t.txnDate).sort();
    periodStart = periodStart ?? dates[0] ?? null;
    periodEnd = periodEnd ?? dates[dates.length - 1] ?? null;
  }

  return {
    customerName,
    periodStart,
    periodEnd,
    assetItems,
    transactions,
  };
}
