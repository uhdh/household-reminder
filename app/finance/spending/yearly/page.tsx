import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import { formatKRW } from "@/lib/finance-format";
import { requireHouseholdOrOnboard } from "@/lib/require-household";
import {
  classifySpendingEmptyStateScoped,
  countsInTotals,
  flowLabel,
  getActiveTransactionsInRange,
  getLatestActivePeriod,
  hasAnyTransaction,
  isPersonId,
  monthOf,
  toNum,
  unmappedTransferExclusion,
  yearOf,
  type PersonId,
} from "@/lib/spending-queries";
import { PersonFilter } from "../person-filter";
import { YearlyView } from "./yearly-view";
import { DemoYearlySpending } from "@/app/finance/_components/demo-pages";
import { FinanceEmptyState, PeriodEmptyNote } from "@/app/finance/_components/empty-state";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";

export const dynamic = "force-dynamic";

const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const UNMAPPED = "미분류";

function emptyMonths(): number[] {
  return new Array(12).fill(0);
}

function fmt(n: number): string {
  return n === 0 ? "-" : Math.round(n / 10_000).toLocaleString("ko-KR");
}

function Row({
  label,
  values,
  divisor,
  strong,
  muted,
}: {
  label: string;
  values: number[];
  divisor: number;
  strong?: boolean;
  muted?: boolean;
}) {
  const total = values.reduce((s, v) => s + v, 0);
  const avg = total / divisor;
  return (
    <tr className="border-b-[0.8px] border-hairline2 last:border-0">
      <td className={`sticky left-0 whitespace-nowrap bg-card px-3 py-2 ${muted ? "text-ink-muted" : "text-ink"} ${strong ? "font-semibold" : ""}`}>
        {label}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${strong ? "font-semibold text-ink" : "text-ink-muted"}`}>
        {fmt(total)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-muted">{fmt(avg)}</td>
      {values.map((v, i) => (
        <td key={i} className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-muted">
          {fmt(v)}
        </td>
      ))}
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
      <td colSpan={15} className="sticky left-0 bg-canvas px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
        {label}
      </td>
    </tr>
  );
}

export default async function YearlyPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; person?: string }>;
}) {
  const { year: yearParam, person } = await searchParams;

  if (await isFinanceDemoMode()) {
    const personFilter: "all" | PersonId = person === "husband" || person === "wife" ? person : "all";
    return <DemoYearlySpending personFilter={personFilter} />;
  }

  const { householdId } = await requireHouseholdOrOnboard();
  // maxYear(다음 해 이동 가능 여부)는 연도 파라미터 유무와 무관하게 항상 필요하므로 매번 조회한다.
  const [householdHasAny, latestPeriod] = await Promise.all([hasAnyTransaction(householdId), getLatestActivePeriod(householdId)]);
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : latestPeriod.year;
  const maxYear = Math.max(new Date().getFullYear(), latestPeriod.year);

  // 해당 연도만 SQL로 가져온다. household_id + txn_date 범위(그 해 1/1 ~ 다음 해 1/1 직전).
  const { transactions: yearRangeTx, displayNameByPerson } = await getActiveTransactionsInRange(householdId, `${year}-01-01`, `${year + 1}-01-01`);
  const personIds = Array.from(displayNameByPerson.keys());
  const personFilter: "all" | PersonId = isPersonId(person, personIds) ? person : "all";
  const periodTxAll = yearRangeTx.filter((t) => yearOf(t.txnDate) === year && (personFilter === "all" || t.personId === personFilter));
  const yearTx = periodTxAll.filter(countsInTotals);
  const exclusion = unmappedTransferExclusion(periodTxAll);
  const emptyState = classifySpendingEmptyStateScoped(householdHasAny, periodTxAll);

  const db = getDb();
  const budgetRows = await db.select().from(budgetCategories).where(eq(budgetCategories.householdId, householdId));
  const budgetByName = new Map(budgetRows.map((b) => [b.name, b]));
  const sortedBudgets = [...budgetRows].sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder));

  function kindOf(stdCategory: string | null, flow: "입금" | "지출"): string {
    const b = stdCategory ? budgetByName.get(stdCategory) : undefined;
    if (b) return b.kind;
    return flow === "입금" ? "변동수입" : "변동비";
  }

  const totalIncomeM = emptyMonths();
  const fixedIncomeM = emptyMonths();
  const variableIncomeM = emptyMonths();
  const totalExpenseM = emptyMonths();
  const categoryMonthly = new Map<string, number[]>();
  const monthsPresent = new Set<number>();

  for (const t of yearTx) {
    const m = monthOf(t.txnDate) - 1;
    monthsPresent.add(m + 1);
    const flow = flowLabel(t);
    const amt = Math.abs(toNum(t.amount));
    const kind = kindOf(t.stdCategory, flow);

    if (flow === "입금") {
      totalIncomeM[m] += amt;
      if (kind === "고정수입") fixedIncomeM[m] += amt;
      else variableIncomeM[m] += amt;
      continue;
    }

    totalExpenseM[m] += amt;
    const cat = t.stdCategory ?? UNMAPPED;
    const arr = categoryMonthly.get(cat) ?? emptyMonths();
    arr[m] += amt;
    categoryMonthly.set(cat, arr);
  }

  const fixedExpenseM = emptyMonths();
  const variableExpenseM = emptyMonths();
  for (const b of sortedBudgets) {
    const arr = categoryMonthly.get(b.name);
    if (!arr) continue;
    const target = b.kind === "고정비" ? fixedExpenseM : variableExpenseM;
    for (let i = 0; i < 12; i++) target[i] += arr[i];
  }
  const unmappedArr = categoryMonthly.get(UNMAPPED);
  if (unmappedArr) {
    for (let i = 0; i < 12; i++) variableExpenseM[i] += unmappedArr[i];
  }

  const divisor = monthsPresent.size > 0 ? Math.max(...monthsPresent) : 1;

  const ANNUAL_CATEGORY = "연간비용";
  const fixedRows = sortedBudgets.filter((b) => b.kind === "고정비");
  const variableRows = sortedBudgets.filter((b) => b.kind === "변동비");
  const buildCategorySeries = (rows: typeof fixedRows, prefix: "fixed" | "variable") => {
    const ranked = rows
      .filter((row) => row.name !== ANNUAL_CATEGORY)
      .map((row) => ({ name: row.name, total: (categoryMonthly.get(row.name) ?? []).reduce((sum, value) => sum + value, 0) }))
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total);
    const top = ranked.slice(0, 5).map((item) => ({ name: item.name, dataKey: `${prefix}:${item.name}`, sourceNames: [item.name] }));
    const otherNames = ranked.slice(5).map((item) => item.name);
    return otherNames.length > 0 ? [...top, { name: "기타", dataKey: `${prefix}:other`, sourceNames: otherNames }] : top;
  };
  const fixedCategorySeries = buildCategorySeries(fixedRows, "fixed");
  const variableCategorySeries = buildCategorySeries(variableRows, "variable");
  const annualCategoryValues = categoryMonthly.get(ANNUAL_CATEGORY);
  const annualCategory = annualCategoryValues
    ? { name: ANNUAL_CATEGORY, values: annualCategoryValues.map((v) => Math.round(v / 10_000)) }
    : null;
  const hrefForYear = (value: number) => `/finance/spending/yearly?year=${value}${personFilter === "all" ? "" : `&person=${personFilter}`}`;
  const chartData = MONTH_LABELS.map((monthLabel, index) => ({
    month: monthLabel,
    income: Math.round(totalIncomeM[index] / 10_000),
    expense: Math.round(totalExpenseM[index] / 10_000),
    fixedExpense: Math.round(fixedExpenseM[index] / 10_000),
    variableExpense: Math.round(variableExpenseM[index] / 10_000),
    savingsRate: totalIncomeM[index] > 0 ? ((totalIncomeM[index] - totalExpenseM[index]) / totalIncomeM[index]) * 100 : null,
    ...Object.fromEntries(fixedCategorySeries.map(({ dataKey, sourceNames }) => [dataKey, Math.round(sourceNames.reduce((sum, name) => sum + (categoryMonthly.get(name)?.[index] ?? 0), 0) / 10_000)])),
    ...Object.fromEntries(variableCategorySeries.map(({ dataKey, sourceNames }) => [dataKey, Math.round(sourceNames.reduce((sum, name) => sum + (categoryMonthly.get(name)?.[index] ?? 0), 0) / 10_000)])),
  }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">연간 내역</h1>
        <div className="inline-flex items-center gap-0.5 rounded-r3 bg-bg-neutral-weak p-1 text-[14px]">
        <Link href={hrefForYear(year - 1)} className="flex h-9 items-center rounded-r2 px-3 text-ink-muted hover:text-ink">
          ← {year - 1}년
        </Link>
        <span className="flex h-9 items-center rounded-r2 bg-bg-layer-default px-4 font-bold text-ink">{year}년</span>
        {year < maxYear ? (
          <Link href={hrefForYear(year + 1)} className="flex h-9 items-center rounded-r2 px-3 text-ink-muted hover:text-ink">
            {year + 1}년 →
          </Link>
        ) : (
          <span aria-disabled="true" className="flex h-9 cursor-not-allowed items-center rounded-r2 px-3 text-ink-muted/40">
            {year + 1}년 →
          </span>
        )}
        </div>
        <span className="text-[13px] text-ink-muted">{divisor}월까지 · 평균은 {divisor}개월 기준</span>
        </div>
        <PersonFilter pathname="/finance/spending/yearly" periodKey="year" periodValue={String(year)} selected={personFilter} displayNameByPerson={displayNameByPerson} />
      </div>

      {emptyState === "onboarding" ? (
        <FinanceEmptyState secondaryHref="/finance/spending?manual=1#manual-entry" secondaryLabel="직접 입력하기" />
      ) : emptyState === "period" ? (
        <PeriodEmptyNote label="이 해" />
      ) : (
      <>
      {exclusion.count > 0 && (
        <div className="mb-4 rounded-r3 bg-bg-warning-weak px-4 py-2.5 text-[13px] text-ink-muted">
          분류 안 된 이체 {exclusion.count}건 · {formatKRW(exclusion.total)}은 집계에서 뺐어요 →{" "}
          <Link href="/finance/spending/settings?tab=unmapped" className="font-semibold text-fg-brand hover:underline">
            미분류 관리
          </Link>
        </div>
      )}

      <YearlyView data={chartData} fixedCategories={fixedCategorySeries} variableCategories={variableCategorySeries} annualCategory={annualCategory}>
      <div className="seed-card relative overflow-x-auto shadow-none">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-stroke-neutral-muted text-left text-ink-muted">
              <th className="sticky left-0 whitespace-nowrap bg-card px-3 py-2 text-[11px] font-semibold">구분</th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold">합계</th>
              <th className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold">평균</th>
              {MONTH_LABELS.map((m) => (
                <th key={m} className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="총수입" values={totalIncomeM} divisor={divisor} strong />
            <Row label="고정수입" values={fixedIncomeM} divisor={divisor} muted />
            <Row label="변동수입" values={variableIncomeM} divisor={divisor} muted />
            <Row label="총지출" values={totalExpenseM} divisor={divisor} strong />

            <SectionHeader label="고정비" />
            <Row label="고정비 합계" values={fixedExpenseM} divisor={divisor} strong />
            {fixedRows.map((b) => (
              <Row key={b.name} label={b.name} values={categoryMonthly.get(b.name) ?? emptyMonths()} divisor={divisor} />
            ))}

            <SectionHeader label="변동비" />
            <Row label="변동비 합계" values={variableExpenseM} divisor={divisor} strong />
            {variableRows.map((b) => (
              <Row key={b.name} label={b.name} values={categoryMonthly.get(b.name) ?? emptyMonths()} divisor={divisor} />
            ))}
            {unmappedArr && <Row label={UNMAPPED} values={unmappedArr} divisor={divisor} />}
          </tbody>
        </table>
      </div>
      </YearlyView>
      </>
      )}
    </div>
  );
}
