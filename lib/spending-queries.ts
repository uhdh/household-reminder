import { and, eq, gte, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";

// 기존 "우리집" 가구는 이 두 id를 그대로 쓴다(마이그레이션으로 이미 people 행이 있음). 새 가구는
// 온보딩/초대에서 uuid 문자열 id를 받는다 - PersonId는 이제 가구별 people.id 아무거나를 뜻하는
// 일반 문자열이고, 유효성 검사는 항상 그 가구의 실제 people 목록(knownIds)을 기준으로 한다.
export type PersonId = string;

export type Beneficiary = string; // people.id 또는 'joint'

export function isPersonId(value: string | undefined | null, knownIds: Iterable<string>): value is string {
  if (!value) return false;
  const set = knownIds instanceof Set ? knownIds : new Set(knownIds);
  return set.has(value);
}

export function isBeneficiary(value: string | undefined | null, knownIds: Iterable<string>): value is string {
  if (value === "joint") return true;
  return isPersonId(value, knownIds);
}

export type Txn = typeof transactions.$inferSelect;

/** 가구 구성원(people) 목록. 자산·거래의 personId, beneficiary 유효성 검사와 화면 표시 이름의 기준이다. */
export async function getHouseholdPeople(householdId: string): Promise<{ id: string; displayName: string }[]> {
  const db = getDb();
  return db.select({ id: people.id, displayName: people.displayName }).from(people).where(eq(people.householdId, householdId));
}

type UploadMeta = { id: string; uploadedAt: Date };

/**
 * 같은 (personId, txnDate)에 대해 재업로드로 겹치는 행이 남아있어도 가장 최근 업로드(uploadedAt)
 * 행만 남긴다. getActiveTransactions류 함수들이 전체 히스토리든 날짜 범위로 좁힌 행이든 동일하게
 * 쓰는 공통 로직 - 날짜 범위로 좁혀 가져와도 경쟁하는 두 행은 항상 같은 날짜(같은 쿼리 범위)에
 * 있으므로 결과가 전체를 불러와 필터링한 것과 같다.
 */
function dedupeActiveRows<T extends { personId: string; txnDate: string; uploadId: string }>(
  rows: T[],
  uploadRows: UploadMeta[]
): T[] {
  const uploadById = new Map(uploadRows.map((upload) => [upload.id, upload]));
  const latestUploadByDate = new Map<string, string>();

  for (const row of rows) {
    const key = `${row.personId}|${row.txnDate}`;
    const currentId = latestUploadByDate.get(key);
    const candidate = uploadById.get(row.uploadId);
    const current = currentId ? uploadById.get(currentId) : null;
    if (!current || (candidate && candidate.uploadedAt > current.uploadedAt)) latestUploadByDate.set(key, row.uploadId);
  }

  return rows.filter((row) => latestUploadByDate.get(`${row.personId}|${row.txnDate}`) === row.uploadId);
}

/** 모든 업로드에서 누적된 거래 전체를 가져온다. 자산만 최신 업로드 스냅샷을 사용한다. */
export async function getActiveTransactions(householdId: string): Promise<{
  transactions: Txn[];
  displayNameByPerson: Map<string, string>;
}> {
  const db = getDb();
  const [rows, uploadRows, peopleRows] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.householdId, householdId)),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
    getHouseholdPeople(householdId),
  ]);
  const displayNameByPerson = new Map<string, string>(peopleRows.map((p) => [p.id, p.displayName]));
  return { transactions: dedupeActiveRows(rows, uploadRows), displayNameByPerson };
}

/**
 * getActiveTransactions와 같지만 txn_date가 [fromDate, toDateExclusive) 범위인 행만 SQL WHERE로
 * 가져온다(household_id + 날짜 범위). 월별/연간/세부 내역 화면이 필요한 기간만 조회할 때 쓴다.
 * uploads는 가구당 행 수가 적어(파일 업로드 횟수만큼) 범위를 좁히지 않고 전체를 가져와도 무겁지 않다.
 */
export async function getActiveTransactionsInRange(
  householdId: string,
  fromDate: string,
  toDateExclusive: string
): Promise<{ transactions: Txn[]; displayNameByPerson: Map<string, string> }> {
  const db = getDb();
  const [rows, uploadRows, peopleRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), gte(transactions.txnDate, fromDate), lt(transactions.txnDate, toDateExclusive))),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
    getHouseholdPeople(householdId),
  ]);
  const displayNameByPerson = new Map<string, string>(peopleRows.map((p) => [p.id, p.displayName]));
  return { transactions: dedupeActiveRows(rows, uploadRows), displayNameByPerson };
}

export type MerchantHistoryRow = {
  id: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  stdCategory: string | null;
  txnType: string;
};

/**
 * 세부 내역의 카테고리 추천/자주 쓰는/가맹점 건수/병합 토스트 대상 찾기는 가구 전체 과거
 * 이력이 필요하지만(특정 월로 좁힐 수 없음), 행 표시에 안 쓰는 컬럼(금액·결제수단·수혜자 등)은
 * 필요 없다. 필요한 컬럼만 select해 전송량을 줄인다.
 */
export async function getMerchantHistory(householdId: string): Promise<MerchantHistoryRow[]> {
  const db = getDb();
  const [rows, uploadRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        personId: transactions.personId,
        txnDate: transactions.txnDate,
        uploadId: transactions.uploadId,
        description: transactions.description,
        category: transactions.category,
        subcategory: transactions.subcategory,
        stdCategory: transactions.stdCategory,
        txnType: transactions.txnType,
      })
      .from(transactions)
      .where(eq(transactions.householdId, householdId)),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
  ]);
  return dedupeActiveRows(rows, uploadRows).map(({ id, description, category, subcategory, stdCategory, txnType }) => ({
    id,
    description,
    category,
    subcategory,
    stdCategory,
    txnType,
  }));
}

/** 가구에 활성 거래가 하나라도 있는지(온보딩 빈 상태 판정용). 존재 여부만 필요하므로 dedup 없이 1행만 확인한다. */
export async function hasAnyTransaction(householdId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.householdId, householdId)).limit(1);
  return !!row;
}

function currentMonthYear(): { month: string; year: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { month, year };
}

/**
 * latestMonth/latestYear(includedTx)와 동치: 집계에 잡히는(included=true, 미분류 이체 제외) 거래 중
 * 가장 최근 txn_date의 월/연. 전체 이력을 불러오지 않고 max(txn_date) 1행만 조회한다.
 * ponytail: 같은 (personId, txnDate)에 재업로드 중복이 남아있고 그 중 하나만 조건에 맞는 극단적인
 * 경우 이론상 오차가 날 수 있지만(업로드 시 델리트 후 재삽입이라 실사용에서 사실상 발생하지 않음),
 * 정확한 dedup이 필요하면 getActiveTransactions 계열로 전환.
 */
export async function getLatestActivePeriod(householdId: string): Promise<{ month: string; year: number }> {
  const db = getDb();
  const [row] = await db
    .select({ maxDate: sql<string | null>`max(${transactions.txnDate})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.included, true),
        or(ne(transactions.txnType, "이체"), isNotNull(transactions.stdCategory))
      )
    );
  const maxDate = row?.maxDate ?? null;
  if (!maxDate) return currentMonthYear();
  return { month: maxDate.slice(0, 7), year: Number(maxDate.slice(0, 4)) };
}

/**
 * 세부 내역 화면의 기본 월 계산 기준(visibleTx: included이거나 자산수정)으로 가장 최근 txn_date의 월.
 * getLatestActivePeriod와 필터 기준이 달라(자산수정 포함) 별도 함수로 둔다.
 */
export async function getLatestVisibleMonth(householdId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ maxDate: sql<string | null>`max(${transactions.txnDate})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        or(eq(transactions.included, true), eq(transactions.stdCategory, "자산수정"))
      )
    );
  const maxDate = row?.maxDate ?? null;
  return maxDate ? maxDate.slice(0, 7) : currentMonthYear().month;
}

/**
 * 세부 내역 "구분" 필터의 "집계 제외"(flow=excluded) 옵션이 보여줄 행: included=false인
 * 거래(단, 서울페이 상품권 구매 장부 행은 isVoucherPurchaseRecord로 화면단에서 이미 따로
 * 제외한다 - 이 함수는 그 이후의 included=false 판정만 맡는다).
 */
export function isExcludedFromTotals(t: { included: boolean }): boolean {
  return !t.included;
}

/** "집계 제외" 목록에서 각 행 옆에 보여줄 짧은 사유 라벨. */
export function excludedReasonLabel(t: { isInternalTransfer: boolean; stdCategory: string | null }): string {
  if (t.isInternalTransfer) return "내 계좌 이동";
  if (t.stdCategory === "자산수정") return "집계 제외";
  return "소액·기타 제외";
}

export function beneficiaryLabel(value: string, displayNameByPerson: Map<string, string>): string {
  if (value === "joint") return "우리";
  return displayNameByPerson.get(value) ?? value;
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

export type SpendingEmptyState = "onboarding" | "period" | null;

/**
 * 가계부 빈 상태 판정. 가구 전체에 활성 거래가 하나도 없으면 온보딩 유도가 필요한
 * "onboarding", 가구 전체는 데이터가 있지만 조회 중인 기간(월/연)에만 없으면 짧은
 * 안내만 필요한 "period", 둘 다 아니면 null(정상 렌더).
 */
export function classifySpendingEmptyState(allTx: readonly unknown[], periodTx: readonly unknown[]): SpendingEmptyState {
  if (allTx.length === 0) return "onboarding";
  if (periodTx.length === 0) return "period";
  return null;
}

/**
 * classifySpendingEmptyState와 동치이지만, 가구 전체 이력을 불러오지 않고 hasAnyTransaction()으로
 * 구한 존재 여부(householdHasAny)만으로 판정한다. 월별/연간 화면처럼 조회 기간만 SQL로 좁혀 가져올 때 쓴다.
 */
export function classifySpendingEmptyStateScoped(householdHasAny: boolean, periodTx: readonly unknown[]): SpendingEmptyState {
  if (!householdHasAny) return "onboarding";
  if (periodTx.length === 0) return "period";
  return null;
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
export function flowLabel(txn: { txnType: string; category: string | null; amount: string | number }): "입금" | "지출" {
  const amount = toNum(txn.amount);
  if (amount > 0) return "입금";
  if (amount < 0) return "지출";
  if (txn.txnType === "수입") return "입금";
  if (txn.txnType === "이체") return txn.category === "현금" ? "지출" : "입금";
  return "지출";
}

/**
 * 실제 수입/지출 "집계"에 넣을지 여부. included=true라도 뱅크샐러드 이체 거래 중
 * 원본 대분류가 없어 표준카테고리를 못 정한 건(대부분 내 계좌 간 이동)은 미분류
 * 관리에서 카테고리를 지정하기 전까지 합계에서 뺀다. 월별·연간·홈 등 "합계"를
 * 내는 곳은 모두 이 함수를 거쳐야 한다. 세부 내역 목록처럼 개별 거래를 그대로
 * 보여주는 화면(포함 여부만 표시)은 대상이 아니다.
 */
export function countsInTotals(t: { included: boolean; txnType: string; stdCategory: string | null }): boolean {
  return t.included && !(t.txnType === "이체" && !t.stdCategory);
}

/** 집계에서 빠진(included=true지만 미분류 이체인) 거래의 건수·합계. 월별·연간 화면 상단 안내에 쓴다. */
export function unmappedTransferExclusion(rows: { included: boolean; txnType: string; stdCategory: string | null; amount: string | number }[]): {
  count: number;
  total: number;
} {
  const excluded = rows.filter((t) => t.included && !countsInTotals(t));
  return { count: excluded.length, total: excluded.reduce((sum, t) => sum + Math.abs(toNum(t.amount)), 0) };
}

export type PersonSplit = Record<string, number>;

function emptySplit(personIds: readonly string[]): PersonSplit {
  return Object.fromEntries(personIds.map((id) => [id, 0]));
}

export interface MonthlySummary {
  totalIncome: number;
  totalIncomeByPerson: PersonSplit;
  fixedIncome: number;
  fixedIncomeByPerson: PersonSplit;
  variableIncome: number;
  variableIncomeByPerson: PersonSplit;
  totalExpense: number;
  totalExpenseByPerson: PersonSplit;
  fixedExpense: number;
  fixedExpenseByPerson: PersonSplit;
  variableExpense: number;
  variableExpenseByPerson: PersonSplit;
  balance: number;
  balanceByPerson: PersonSplit;
  savingsRate: number;
  savingsRateByPerson: PersonSplit;
  categoryTotals: Map<string, number>;
  categoryByPerson: Map<string, PersonSplit>;
  categoryByBeneficiary: Map<string, Record<string, number>>;
}

export const UNMAPPED_CATEGORY = "미분류";

/**
 * 한 달치 거래를 집계해서 가구 전체 합계와 구성원별(personIds) 개인별 합계를 함께 반환한다.
 * kindOf는 표준카테고리(+수입/지출 흐름)로부터 '고정비/변동비/고정수입/변동수입' 성격을 결정하는 함수로,
 * budgetCategories 테이블 내용에 의존하므로 페이지 쪽에서 주입한다. personIds는 이 가구의 people.id
 * 전체 목록(1인 이상) - 결과의 *ByPerson 레코드가 이 id들을 키로 갖는다.
 */
export function summarizeMonthlyTransactions(
  monthTx: Txn[],
  kindOf: (stdCategory: string | null, flow: "입금" | "지출") => string,
  personIds: readonly string[]
): MonthlySummary {
  let totalIncome = 0;
  let fixedIncome = 0;
  let variableIncome = 0;
  let totalExpense = 0;
  let fixedExpense = 0;
  let variableExpense = 0;

  const totalIncomeByPerson = emptySplit(personIds);
  const fixedIncomeByPerson = emptySplit(personIds);
  const variableIncomeByPerson = emptySplit(personIds);
  const totalExpenseByPerson = emptySplit(personIds);
  const fixedExpenseByPerson = emptySplit(personIds);
  const variableExpenseByPerson = emptySplit(personIds);

  const categoryTotals = new Map<string, number>();
  const categoryByPerson = new Map<string, PersonSplit>();
  const categoryByBeneficiary = new Map<string, Record<string, number>>();

  for (const t of monthTx) {
    const flow = flowLabel(t);
    const amt = Math.abs(toNum(t.amount));
    const kind = kindOf(t.stdCategory, flow);
    const personId = t.personId;

    if (flow === "입금") {
      totalIncome += amt;
      totalIncomeByPerson[personId] = (totalIncomeByPerson[personId] ?? 0) + amt;
      if (kind === "고정수입") {
        fixedIncome += amt;
        fixedIncomeByPerson[personId] = (fixedIncomeByPerson[personId] ?? 0) + amt;
      } else {
        variableIncome += amt;
        variableIncomeByPerson[personId] = (variableIncomeByPerson[personId] ?? 0) + amt;
      }
      continue;
    }

    totalExpense += amt;
    totalExpenseByPerson[personId] = (totalExpenseByPerson[personId] ?? 0) + amt;
    if (kind === "고정비") {
      fixedExpense += amt;
      fixedExpenseByPerson[personId] = (fixedExpenseByPerson[personId] ?? 0) + amt;
    } else {
      variableExpense += amt;
      variableExpenseByPerson[personId] = (variableExpenseByPerson[personId] ?? 0) + amt;
    }

    const cat = t.stdCategory ?? UNMAPPED_CATEGORY;
    categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt);

    const byPerson = categoryByPerson.get(cat) ?? emptySplit(personIds);
    byPerson[personId] = (byPerson[personId] ?? 0) + amt;
    categoryByPerson.set(cat, byPerson);

    const byBen = categoryByBeneficiary.get(cat) ?? { ...emptySplit(personIds), joint: 0 };
    const ben = t.beneficiary;
    byBen[ben] = (byBen[ben] ?? 0) + amt;
    categoryByBeneficiary.set(cat, byBen);
  }

  const balance = totalIncome - totalExpense;
  const balanceByPerson: PersonSplit = Object.fromEntries(
    personIds.map((id) => [id, (totalIncomeByPerson[id] ?? 0) - (totalExpenseByPerson[id] ?? 0)])
  );
  const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
  const savingsRateByPerson: PersonSplit = Object.fromEntries(
    personIds.map((id) => [id, (totalIncomeByPerson[id] ?? 0) > 0 ? ((balanceByPerson[id] ?? 0) / totalIncomeByPerson[id]) * 100 : 0])
  );

  return {
    totalIncome,
    totalIncomeByPerson,
    fixedIncome,
    fixedIncomeByPerson,
    variableIncome,
    variableIncomeByPerson,
    totalExpense,
    totalExpenseByPerson,
    fixedExpense,
    fixedExpenseByPerson,
    variableExpense,
    variableExpenseByPerson,
    balance,
    balanceByPerson,
    savingsRate,
    savingsRateByPerson,
    categoryTotals,
    categoryByPerson,
    categoryByBeneficiary,
  };
}

export interface MonthlyComparison {
  totalIncomeDelta: number;
  totalExpenseDelta: number;
  balanceDelta: number;
  /** 지난달보다 가장 많이 늘어난 지출 카테고리 (늘어난 카테고리가 없으면 null) */
  topIncreaseCategory: { name: string; delta: number } | null;
}

/** 이번 달 요약을 전월 요약과 비교한다. 전월에 거래가 없으면(prev=null) 비교하지 않는다. */
export function compareMonthlySummaries(current: MonthlySummary, previous: MonthlySummary | null): MonthlyComparison | null {
  if (!previous) return null;

  let topIncreaseCategory: { name: string; delta: number } | null = null;
  for (const [name, value] of current.categoryTotals) {
    const delta = value - (previous.categoryTotals.get(name) ?? 0);
    if (delta > 0 && (!topIncreaseCategory || delta > topIncreaseCategory.delta)) {
      topIncreaseCategory = { name, delta };
    }
  }

  return {
    totalIncomeDelta: current.totalIncome - previous.totalIncome,
    totalExpenseDelta: current.totalExpense - previous.totalExpense,
    balanceDelta: current.balance - previous.balance,
    topIncreaseCategory,
  };
}
