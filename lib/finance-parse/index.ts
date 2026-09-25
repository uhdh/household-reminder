import ExcelJS from "exceljs";
import { parseAssetItems, parseCustomerName, parseInvestmentInputDetails } from "./bank-status";
import { classifyInvestmentSector } from "./investment-sector";
import { parseTransactions } from "./ledger";
import { normalizeInvestmentProductName } from "./investment-utils";
import { decryptWorkbookBuffer } from "./crypto";
import { isSeoulPayWorkbook } from "./seoulpay";
import type { ParsedUpload } from "./types";

export * from "./types";
export * from "./crypto";
export * from "./seoulpay";

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

/**
 * 업로드된 파일이 서울페이 이용내역인지 뱅크샐러드 내보내기인지 판별한다. (선택) 비밀번호로
 * 먼저 복호화한 뒤(암호화 안 된 파일은 그대로 통과) 워크북을 열어 확인하며, 비밀번호 오류는
 * 그대로 던진다. 워크북 자체를 못 열 만큼 손상/형식이 다른 파일이면 판별을 포기하고 기존
 * 뱅크샐러드 경로(parseUploadFile)로 넘겨 그쪽의 에러 메시지를 그대로 쓰게 한다 - 여기서 실패를
 * 삼키는 이유는 비밀번호 오류만은 꼭 이 단계에서 사용자에게 보여야 하기 때문이다.
 */
export async function detectUploadFileKind(
  buffer: ArrayBuffer,
  password?: string
): Promise<{ kind: "seoulpay" | "banksalad"; buffer: ArrayBuffer }> {
  const decrypted = await decryptWorkbookBuffer(buffer, password);
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(decrypted);
    if (isSeoulPayWorkbook(workbook)) return { kind: "seoulpay", buffer: decrypted };
  } catch {
    // 판별 단계에서의 로드 실패는 무시하고 뱅크샐러드 경로로 넘긴다(위 설명 참고).
  }
  return { kind: "banksalad", buffer: decrypted };
}
