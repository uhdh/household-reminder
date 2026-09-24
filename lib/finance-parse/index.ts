import ExcelJS from "exceljs";
import { parseAssetItems, parseCustomerName, parseInvestmentInputDetails } from "./bank-status";
import { classifyInvestmentSector } from "./investment-sector";
import { parseTransactions } from "./ledger";
import { normalizeInvestmentProductName } from "./investment-utils";
import type { ParsedUpload } from "./types";

export * from "./types";

const FILENAME_PERIOD_RE = /(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/;

export function transactionDateRange(transactions: { txnDate: string }[]): { start: string; end: string } | null {
  if (transactions.length === 0) return null;
  let start = transactions[0].txnDate;
  let end = start;
  for (const transaction of transactions) {
    if (transaction.txnDate < start) start = transaction.txnDate;
    if (transaction.txnDate > end) end = transaction.txnDate;
  }
  return { start, end };
}

export async function parseUploadFile(
  buffer: ArrayBuffer,
  filename: string,
  // 뱅크샐러드 엑셀 시트명 규칙("_본인_원본"/"_배우자_원본")은 파일 형식 자체가 2인(본인/배우자)
  // 기준이라 personId가 기존 우리집의 'husband'/'wife'일 때만 힌트로 쓴다. 그 외(3인 이상 가구,
  // 새 가구의 uuid id 등)는 힌트 없이 일반 폴백("_원본"으로 끝나는 시트)으로 찾는다.
  personId?: string,
): Promise<ParsedUpload> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const ownerSheetHint = personId === "husband" ? "_본인_원본" : personId === "wife" ? "_배우자_원본" : null;
  const statusSheet =
    workbook.getWorksheet("뱅샐현황") ??
    (ownerSheetHint
      ? workbook.worksheets.find((sheet) => sheet.name.includes(ownerSheetHint))
      : undefined) ??
    workbook.worksheets.find((sheet) => sheet.name.endsWith("_원본"));
  const ledgerSheet = workbook.getWorksheet("가계부 내역");
  const investmentInputSheet = workbook.getWorksheet("투자 입력 DB");
  if (!statusSheet || (!ledgerSheet && !investmentInputSheet)) {
    throw new Error(
      "엑셀 파일에서 '뱅샐현황' 또는 '가계부 내역' 시트를 찾을 수 없습니다. 뱅크샐러드에서 내보낸 파일이 맞는지 확인해 주세요."
    );
  }

  const customerName = parseCustomerName(statusSheet);
  const assetItems = parseAssetItems(statusSheet);
  const transactions = ledgerSheet ? parseTransactions(ledgerSheet) : [];

  if (investmentInputSheet && personId) {
    const owner = personId === "husband" ? "본인" : "배우자";
    const details = parseInvestmentInputDetails(investmentInputSheet, owner);
    const costBasisApplied = new Set<string>();
    for (const item of assetItems) {
      if (item.side !== "asset" || !item.productName) continue;
      const productKey = normalizeInvestmentProductName(item.productName);
      const detail = details.get(productKey);
      if (detail) {
        // 재무현황에는 같은 종목이 계좌별로 여러 행에 있을 수 있다.
        // 투자 입력 DB에서 이미 계좌별 투자원금을 합산했으므로 한 번만 붙여야 한다.
        item.costBasis = costBasisApplied.has(productKey) ? 0 : detail.costBasis;
        costBasisApplied.add(productKey);
        item.sector = detail.sector ?? classifyInvestmentSector(item.productName);
      }
    }
  }

  const nameMatch = filename.match(FILENAME_PERIOD_RE);
  const actualRange = transactionDateRange(transactions);
  const periodStart = actualRange?.start ?? (nameMatch ? nameMatch[1] : null);
  const periodEnd = actualRange?.end ?? (nameMatch ? nameMatch[2] : null);

  return {
    customerName,
    periodStart,
    periodEnd,
    assetItems,
    transactions,
  };
}
