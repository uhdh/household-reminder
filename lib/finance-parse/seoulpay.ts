import ExcelJS from "exceljs";
import type { Workbook, Worksheet } from "exceljs";
import { cellNumber, cellText } from "./excel-utils";
import { decryptWorkbookBuffer } from "./crypto";
import type { ParsedSeoulPay, ParsedSeoulPayPayment, ParsedSeoulPayPurchase } from "./types";

// 상단 메타(성명/생년월일/조회기간)와 공백 행 다음에 헤더가 오므로(실제 파일 기준 6행) 행 번호를
// 하드코딩하지 않고, 필요한 헤더 라벨이 모두 있는 행을 찾아서 그 행을 헤더로 쓴다.
const HEADER_SEARCH_ROWS = 20;
const PERIOD_RE = /(\d{8})~(\d{8})/;
const PAYMENT_HEADER_LABELS = ["가맹점", "결제일"];
const PURCHASE_HEADER_LABELS = ["상품권명", "구매(환불)일", "거래구분", "고객구매금(A)"];

function isoFromYyyymmdd(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function findHeaderRow(ws: Worksheet, requiredLabels: string[]): number | null {
  for (let r = 1; r <= Math.min(ws.rowCount, HEADER_SEARCH_ROWS); r++) {
    const row = ws.getRow(r);
    const values = Array.from({ length: ws.columnCount }, (_, i) => cellText(row.getCell(i + 1)));
    if (requiredLabels.every((label) => values.includes(label))) return r;
  }
  return null;
}

function findColumn(ws: Worksheet, headerRow: number, label: string): number {
  const header = ws.getRow(headerRow);
  for (let c = 1; c <= ws.columnCount; c++) {
    if (cellText(header.getCell(c)) === label) return c;
  }
  return -1;
}

/** "YYYY-MM-DD HH:MM" 또는 "YYYY-MM-DD HH:MM:SS" 문자열을 (날짜, 시각) 쌍으로 분해한다. */
function parseDateTimeString(s: string | null): { date: string; time: string | null } | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss] = m;
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}:${ss ?? "00"}` };
}

/** 상단 1~5행 어딘가(보통 A/B열, "조회기간" 라벨 옆)의 "YYYYMMDD~YYYYMMDD" 값을 찾는다. */
function findPeriod(ws: Worksheet | undefined): { start: string; end: string } | null {
  if (!ws) return null;
  for (let r = 1; r <= Math.min(ws.rowCount, 5); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= ws.columnCount; c++) {
      const text = cellText(row.getCell(c));
      const m = text?.match(PERIOD_RE);
      if (m) return { start: isoFromYyyymmdd(m[1]), end: isoFromYyyymmdd(m[2]) };
    }
  }
  return null;
}

/** "결제내역" 시트가 있고 그 안에 가맹점/결제일 헤더가 있으면 서울페이 이용내역 파일로 본다. */
export function isSeoulPayWorkbook(workbook: Workbook): boolean {
  const sheet = workbook.getWorksheet("결제내역");
  if (!sheet) return false;
  return findHeaderRow(sheet, PAYMENT_HEADER_LABELS) !== null;
}

function parsePurchaseSheet(ws: Worksheet | undefined): ParsedSeoulPayPurchase[] {
  if (!ws) return [];
  const headerRow = findHeaderRow(ws, PURCHASE_HEADER_LABELS);
  if (headerRow === null) return [];

  const nameCol = findColumn(ws, headerRow, "상품권명");
  const dateCol = findColumn(ws, headerRow, "구매(환불)일");
  const typeCol = findColumn(ws, headerRow, "거래구분");
  const amountACol = findColumn(ws, headerRow, "고객구매금(A)");

  const out: ParsedSeoulPayPurchase[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    // "환불" 등 구매가 아닌 거래구분은 무시한다(사용자 확정 사항).
    if (cellText(row.getCell(typeCol)) !== "구매") continue;
    const productName = cellText(row.getCell(nameCol));
    const dt = parseDateTimeString(cellText(row.getCell(dateCol)));
    const amountA = cellNumber(row.getCell(amountACol));
    if (!productName || !dt || amountA === null) continue;
    out.push({ txnDate: dt.date, txnTime: dt.time, productName, amountA });
  }
  return out;
}

function parsePaymentSheet(ws: Worksheet): ParsedSeoulPayPayment[] {
  const headerRow = findHeaderRow(ws, PAYMENT_HEADER_LABELS);
  if (headerRow === null) {
    throw new Error("서울페이 파일에서 '결제내역' 시트의 헤더(가맹점/결제일)를 찾을 수 없습니다.");
  }
  const merchantCol = findColumn(ws, headerRow, "가맹점");
  const dateCol = findColumn(ws, headerRow, "결제일");
  const amountCol = findColumn(ws, headerRow, "거래금액");
  const kindCol = findColumn(ws, headerRow, "결제구분");
  if (amountCol < 0) {
    throw new Error("서울페이 파일에서 '결제내역' 시트의 거래금액 컬럼을 찾을 수 없습니다.");
  }

  const out: ParsedSeoulPayPayment[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const merchant = cellText(row.getCell(merchantCol))?.trim();
    const dt = parseDateTimeString(cellText(row.getCell(dateCol)));
    const rawAmount = cellNumber(row.getCell(amountCol));
    if (!merchant || !dt || rawAmount === null) continue;
    // 결제구분="취소"는 환불로 보고 뱅크샐러드 환불 관례(양수 지출행, flowLabel이 "입금"으로
    // 판정)를 그대로 따른다. 그 외("결제" 및 알 수 없는 값)는 실제 지출(음수)로 취급한다.
    const kind = kindCol > 0 ? cellText(row.getCell(kindCol)) : null;
    const amount = kind === "취소" ? Math.abs(rawAmount) : -Math.abs(rawAmount);
    out.push({ txnDate: dt.date, txnTime: dt.time, merchant, amount });
  }
  return out;
}

export function parseSeoulPayWorkbook(workbook: Workbook): ParsedSeoulPay {
  const paymentSheet = workbook.getWorksheet("결제내역");
  if (!paymentSheet) throw new Error("서울페이 파일에서 '결제내역' 시트를 찾을 수 없습니다.");
  const purchaseSheet = workbook.getWorksheet("구매내역");

  const purchases = parsePurchaseSheet(purchaseSheet);
  const payments = parsePaymentSheet(paymentSheet);

  const period = findPeriod(paymentSheet) ?? findPeriod(purchaseSheet);
  const allDates = [...payments.map((p) => p.txnDate), ...purchases.map((p) => p.txnDate)];
  const fallbackStart = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null;
  const fallbackEnd = allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null;

  return {
    periodStart: period?.start ?? fallbackStart,
    periodEnd: period?.end ?? fallbackEnd,
    payments,
    purchases,
  };
}

/** 버퍼(필요시 비밀번호로 복호화)를 읽어 서울페이 이용내역으로 파싱한다. */
export async function parseSeoulPayFile(buffer: ArrayBuffer, password?: string): Promise<ParsedSeoulPay> {
  const decrypted = await decryptWorkbookBuffer(buffer, password);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(decrypted);
  if (!isSeoulPayWorkbook(workbook)) {
    throw new Error("서울페이 이용내역 엑셀 형식이 아니에요. '결제내역' 시트를 확인해 주세요.");
  }
  return parseSeoulPayWorkbook(workbook);
}
