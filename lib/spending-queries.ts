import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";

export const PERSON_IDS = ["husband", "wife"] as const;
export type PersonId = (typeof PERSON_IDS)[number];

export const PERSON_LABELS: Record<PersonId, string> = {
  husband: "남편",
  wife: "아내",
};

export type Beneficiary = PersonId | "joint";

export function isPersonId(value: string | undefined): value is PersonId {
  return !!value && (PERSON_IDS as readonly string[]).includes(value);
}

export function isBeneficiary(value: string | undefined | null): value is Beneficiary {
  return value === "husband" || value === "wife" || value === "joint";
}

export type Txn = typeof transactions.$inferSelect;

/** 현재 활성 업로드(사람별 최신 스냅샷)에 속한 거래 전체를 가져온다. */
export async function getActiveTransactions(): Promise<{
  transactions: Txn[];
  displayNameByPerson: Map<string, string>;
}> {
  const db = getDb();
  const [activeUploads, allPeople] = await Promise.all([
    db.select().from(uploads).where(eq(uploads.isActive, true)),
    db.select().from(people),
  ]);

  const displayNameByPerson = new Map(allPeople.map((p) => [p.id, p.displayName]));
  const activeUploadIds = activeUploads.map((u) => u.id);
  if (activeUploadIds.length === 0) {
    return { transactions: [], displayNameByPerson };
  }

  const rows = await db.select().from(transactions).where(inArray(transactions.uploadId, activeUploadIds));
  return { transactions: rows, displayNameByPerson };
}

export function beneficiaryLabel(value: string, displayNameByPerson: Map<string, string>): string {
  if (value === "joint") return "우리";
  return displayNameByPerson.get(value) ?? PERSON_LABELS[value as PersonId] ?? value;
}

export function monthKeyOf(txnDate: string): string {
  return txnDate.slice(0, 7); // YYYY-MM
}

export function yearOf(txnDate: string): number {
  return Number(txnDate.slice(0, 4));
}

export function monthOf(txnDate: string): number {
  return Number(txnDate.slice(5, 7));
}

export function toNum(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

/** 데이터가 있는 월(YYYY-MM) 중 가장 최근 월. 데이터가 없으면 현재 월. */
export function latestMonth(rows: Txn[]): string {
  if (rows.length === 0) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  return rows.reduce((max, r) => (r.txnDate > max ? r.txnDate : max), rows[0].txnDate).slice(0, 7);
}

/** 데이터가 있는 연도 중 가장 최근 연도. 데이터가 없으면 현재 연도. */
export function latestYear(rows: Txn[]): number {
  if (rows.length === 0) return new Date().getFullYear();
  return Math.max(...rows.map((r) => yearOf(r.txnDate)));
}

export const MONTH_RE = /^\d{4}-\d{2}$/;

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 원본 엑셀 L열(타입변환)과 동치: included=true인 거래만 대상으로 하므로
 * 이체 타입은 저축/투자(입금 취급) 또는 현금(지출 취급)만 남는다.
 */
export function flowLabel(txn: { txnType: string; category: string | null }): "입금" | "지출" {
  if (txn.txnType === "수입") return "입금";
  if (txn.txnType === "이체") return txn.category === "현금" ? "지출" : "입금";
  return "지출";
}
