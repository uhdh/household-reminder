import Link from "next/link";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import { flowLabel, getActiveTransactions, isPersonId, latestYear, monthOf, toNum, yearOf, type PersonId } from "@/lib/spending-queries";
import { PersonFilter } from "../person-filter";
import { YearlyView } from "./yearly-view";

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
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";

  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions();
  const includedTx = allTx.filter((t) => t.included);
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : latestYear(includedTx);
  const yearTx = includedTx.filter((t) => yearOf(t.txnDate) === year && (personFilter === "all" || t.personId === personFilter));

  const db = getDb();
  const budgetRows = await db.select().from(budgetCategories);
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

  const fixedRows = sortedBudgets.filter((b) => b.kind === "고정비");
  const variableRows = sortedBudgets.filter((b) => b.kind === "변동비");
  const hrefForYear = (value: number) => `/finance/spending/yearly?year=${value}${personFilter === "all" ? "" : `&person=${personFilter}`}`;
  const chartData = MONTH_LABELS.map((monthLabel, index) => ({
    month: monthLabel,
    income: Math.round(totalIncomeM[index] / 10_000),
    expense: Math.round(totalExpenseM[index] / 10_000),
    fixedExpense: Math.round(fixedExpenseM[index] / 10_000),
    variableExpense: Math.round(variableExpenseM[index] / 10_000),
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefForYear(year - 1)}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          ← {year - 1}년
        </Link>
        <span className="text-[14px] font-semibold text-ink">{year}년</span>
        <Link
          href={hrefForYear(year + 1)}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          {year + 1}년 →
        </Link>
        <span className="ml-2 text-[12px] text-ink-muted">{divisor}월까지 · 평균은 {divisor}개월 기준</span>
        </div>
        <PersonFilter pathname="/finance/spending/yearly" periodKey="year" periodValue={String(year)} selected={personFilter} displayNameByPerson={displayNameByPerson} />
      </div>

      <YearlyView data={chartData}>
      <div className="overflow-x-auto border-[0.8px] border-hairline bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
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
    </div>
  );
}
