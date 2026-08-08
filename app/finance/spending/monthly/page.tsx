import Link from "next/link";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import {
  MONTH_RE,
  PERSON_LABELS,
  getActiveTransactions,
  isPersonId,
  latestMonth,
  monthKeyOf,
  shiftMonth,
  summarizeMonthlyTransactions,
  toNum,
  UNMAPPED_CATEGORY,
  type PersonId,
} from "@/lib/spending-queries";
import { buildCategoryColorMap, formatCompactKRW, formatKRW, topNWithOther } from "@/lib/finance-format";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "./chart";
import { PersonFilter } from "../person-filter";
import { CategoryRow, type BreakdownItem } from "./category-row";

export const dynamic = "force-dynamic";

const UNMAPPED = UNMAPPED_CATEGORY;

function CompositionCard({ title, items }: { title: string; items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="seed-card p-4 shadow-none">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <span className="text-[12px] tabular-nums text-ink-muted" title={formatKRW(total)}>{formatCompactKRW(total)}</span>
      </div>
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-bg-neutral-weak" aria-hidden="true">
        {items.map((item) => <span key={item.label} className={item.color} style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />)}
      </div>
      <ul className="space-y-3">
        {items.map((item) => {
          const percent = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <li key={item.label} className="flex items-center gap-2 text-[12px]">
              <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} aria-hidden="true" />
              <span className="flex-1 text-ink-muted">{item.label}</span>
              <span className="font-semibold tabular-nums text-ink" title={formatKRW(item.value)}>{formatCompactKRW(item.value)}</span>
              <span className="w-10 text-right tabular-nums text-ink-muted">{percent.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; person?: string }>;
}) {
  const { month: monthParam, person } = await searchParams;
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";

  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions();
  const includedTx = allTx.filter((t) => t.included);
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(includedTx);
  const monthTx = includedTx.filter((t) => monthKeyOf(t.txnDate) === month && (personFilter === "all" || t.personId === personFilter));

  const db = getDb();
  const budgetRows = await db.select().from(budgetCategories);
  const budgetByName = new Map(budgetRows.map((b) => [b.name, b]));
  const sortedBudgets = [...budgetRows].sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder));

  function kindOf(stdCategory: string | null, flow: "입금" | "지출"): string {
    const b = stdCategory ? budgetByName.get(stdCategory) : undefined;
    if (b) return b.kind;
    return flow === "입금" ? "변동수입" : "변동비";
  }

  const summary = summarizeMonthlyTransactions(monthTx, kindOf);
  const { categoryTotals, categoryByPerson, categoryByBeneficiary } = summary;

  const personLabelOf = (key: string) => displayNameByPerson.get(key) ?? PERSON_LABELS[key as PersonId] ?? key;
  const benLabelOf = (key: string) => (key === "joint" ? "우리" : personLabelOf(key));
  const toBreakdown = (record: Record<string, number>, labelOf: (key: string) => string): BreakdownItem[] =>
    Object.entries(record)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({ label: labelOf(key), value }));

  function categoryEntriesForKind(kind: "고정비" | "변동비"): [string, number][] {
    return Array.from(categoryTotals.entries()).filter(([name, value]) => {
      if (value <= 0) return false;
      const categoryKind = name === UNMAPPED ? "변동비" : budgetByName.get(name)?.kind;
      return categoryKind === kind;
    });
  }

  function pieDataForKind(kind: "고정비" | "변동비") {
    const top = topNWithOther(categoryEntriesForKind(kind), 5);
    const colorMap = buildCategoryColorMap(top.map(([name]) => name));
    return top.map(([name, value]) => ({ name, value, fill: colorMap[name] }));
  }

  const fixedPieData = pieDataForKind("고정비");
  const variablePieData = pieDataForKind("변동비");

  const fixedRows = sortedBudgets.filter((b) => b.kind === "고정비");
  const variableRows = sortedBudgets.filter((b) => b.kind === "변동비");
  const knownNames = new Set(sortedBudgets.map((b) => b.name));
  const unmappedTotal = Array.from(categoryTotals.entries())
    .filter(([name]) => !knownNames.has(name))
    .reduce((s, [, v]) => s + v, 0);
  const hrefForMonth = (value: string) => `/finance/spending/monthly?month=${value}${personFilter === "all" ? "" : `&person=${personFilter}`}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
        <Link
          href={hrefForMonth(shiftMonth(month, -1))}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          ← 이전달
        </Link>
        <span className="text-[14px] font-semibold text-ink">{month}</span>
        <Link
          href={hrefForMonth(shiftMonth(month, 1))}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          다음달 →
        </Link>
        </div>
        <PersonFilter pathname="/finance/spending/monthly" periodKey="month" periodValue={month} selected={personFilter} displayNameByPerson={displayNameByPerson} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="총수입" value={summary.totalIncome} format="compactKrw" />
        <SummaryCard label="총지출" value={summary.totalExpense} format="compactKrw" />
        <SummaryCard label="당월 잔고" value={summary.balance} format="compactKrw" />
        <SummaryCard
          label="저축률"
          value={summary.savingsRate}
          format="signedPct"
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CompositionCard
          title="수입 구성"
          items={[
            { label: "고정수입", value: summary.fixedIncome, color: "bg-bg-brand-solid" },
            { label: "변동수입", value: summary.variableIncome, color: "bg-bg-positive-solid" },
          ]}
        />
        <CompositionCard
          title="지출 구성"
          items={[
            { label: "고정비", value: summary.fixedExpense, color: "bg-bg-informative-solid" },
            { label: "변동비", value: summary.variableExpense, color: "bg-bg-warning-solid" },
          ]}
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CategoryPie title="고정비" data={fixedPieData} />
        <CategoryPie title="변동비" data={variablePieData} />
      </div>

      <div className="overflow-x-auto border-[0.8px] border-hairline bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">구분</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">예산</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">합계</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">사용률</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">상세</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
              <td colSpan={5} className="px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
                고정비
              </td>
            </tr>
            {fixedRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                paidBy={toBreakdown(categoryByPerson.get(b.name) ?? {}, personLabelOf)}
                beneficiaries={toBreakdown(categoryByBeneficiary.get(b.name) ?? {}, benLabelOf)}
                hidePayerBreakdown={personFilter !== "all"}
              />
            ))}
            <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
              <td colSpan={5} className="px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
                변동비
              </td>
            </tr>
            {variableRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                paidBy={toBreakdown(categoryByPerson.get(b.name) ?? {}, personLabelOf)}
                beneficiaries={toBreakdown(categoryByBeneficiary.get(b.name) ?? {}, benLabelOf)}
                hidePayerBreakdown={personFilter !== "all"}
              />
            ))}
            {unmappedTotal > 0 && (
              <CategoryRow
                name={UNMAPPED}
                budget={null}
                actual={unmappedTotal}
                paidBy={toBreakdown(categoryByPerson.get(UNMAPPED) ?? {}, personLabelOf)}
                beneficiaries={toBreakdown(categoryByBeneficiary.get(UNMAPPED) ?? {}, benLabelOf)}
                hidePayerBreakdown={personFilter !== "all"}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
