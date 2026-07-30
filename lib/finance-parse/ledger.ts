import type { Worksheet } from "exceljs";
import { cellDate, cellNumber, cellText, formatDateUTC, formatTimeUTC } from "./excel-utils";
import type { ParsedTransaction } from "./types";

const VALID_TYPES = new Set(["수입", "지출", "이체"]);

export function parseTransactions(ws: Worksheet): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = cellDate(row.getCell(1));
    const amount = cellNumber(row.getCell(7));
    const typeRaw = cellText(row.getCell(3));
    if (!date || amount === null || !typeRaw || !VALID_TYPES.has(typeRaw)) continue;

    const time = cellDate(row.getCell(2));

    out.push({
      txnDate: formatDateUTC(date),
      txnTime: time ? formatTimeUTC(time) : null,
      txnType: typeRaw as ParsedTransaction["txnType"],
      category: cellText(row.getCell(4)),
      subcategory: cellText(row.getCell(5)),
      description: cellText(row.getCell(6)),
      amount,
      paymentMethod: cellText(row.getCell(9)),
    });
  }

  return out;
}
