import type { Cell } from "exceljs";

export function cellNumber(cell: Cell): number | null {
  let v: unknown = cell.value;
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) {
    v = (v as { result: unknown }).result;
  }
  if (typeof v === "number") return v;
  return null;
}

export function cellText(cell: Cell): string | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

export function cellDate(cell: Cell): Date | null {
  const v = cell.value;
  if (v instanceof Date) return v;
  return null;
}

export function formatDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatTimeUTC(date: Date): string {
  const h = String(date.getUTCHours()).padStart(2, "0");
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
