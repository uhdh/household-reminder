import Link from "next/link";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import {
  MONTH_RE,
  PERSON_IDS,
  PERSON_LABELS,
  getActiveTransactions,
  latestMonth,
  monthKeyOf,
  shiftMonth,
  summarizeMonthlyTransactions,
  toNum,
  UNMAPPED_CATEGORY,
  type PersonId,
  type PersonSplit,
} from "@/lib/spending-queries";
import { buildCategoryColorMap, formatKRW, topNWithOther } from "@/lib/finance-format";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "./chart";

export const dynamic = "force-dynamic";

const UNMAPPED = UNMAPPED_CATEGORY;

function initials(displayNameByPerson: Map<string, string>): Record<PersonId, string> {
  return {
    husband: (displayNameByPerson.get("husband") ?? PERSON_LABELS.husband).charAt(0),
    wife: (displayNameByPerson.get("wife") ?? PERSON_LABELS.wife).charAt(0),
  };
}

function formatBreakdown(record: Record<string, number>, labelOf: (key: string) => string): string {
  const parts = Object.entries(record)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${labelOf(k)} ${formatKRW(v)}`);
  return parts.length > 0 ? parts.join(" · ") : "-";
}

function CategoryRow({
  name,
  budget,
  actual,
  byPerson,
  byBeneficiary,
  personLabelOf,
  benLabelOf,
}: {
  name: string;
  budget: number | null;
  actual: number;
  byPerson: Record<string, number>;
  byBeneficiary: Record<string, number>;
  personLabelOf: (key: string) => string;
  benLabelOf: (key: string) => string;
}) {
  if (actual === 0 && budget === null) return null;
  const usagePct = budget && budget > 0 ? (actual / budget) * 100 : null;
  return (
    <tr className="border-b-[0.8px] border-hairline2 last:border-0">
      <td className="whitespace-nowrap px-2 py-2 text-ink sm:px-3">{name}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right text-ink-muted sm:px-3">
        {budget !== null ? formatKRW(budget) : "-"}
      </td>
      <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-ink sm:px-3">{formatKRW(actual)}</td>
      <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
        {usagePct !== null ? (
          <span className={usagePct > 100 ? "text-gain" : "text-ink-muted"}>{usagePct.toFixed(0)}%</span>
        ) : (
          "-"
        )}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted lg:table-cell">
        {formatBreakdown(byPerson, personLabelOf)}
      </td>
      <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted lg:table-cell">
        {formatBreakdown(byBeneficiary, benLabelOf)}
      </td>
    </tr>
  );
}

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;

  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions();
  const includedTx = allTx.filter((t) => t.included);
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(includedTx);
  const monthTx = includedTx.filter((t) => monthKeyOf(t.txnDate) === month);

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

  const personLabels = initials(displayNameByPerson);
  const personLabelOf = (key: string) => personLabels[key as PersonId] ?? key;
  const benLabelOf = (key: string) => (key === "joint" ? "우리" : personLabelOf(key));

  const fullNameOf = (id: PersonId) => displayNameByPerson.get(id) ?? PERSON_LABELS[id];
  const cardBreakdown = (split: PersonSplit) => PERSON_IDS.map((id) => ({ label: fullNameOf(id), value: split[id] }));

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

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Link
          href={`/finance/spending/monthly?month=${shiftMonth(month, -1)}`}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          ← 이전달
        </Link>
        <span className="text-[14px] font-semibold text-ink">{month}</span>
        <Link
          href={`/finance/spending/monthly?month=${shiftMonth(month, 1)}`}
          className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
        >
          다음달 →
        </Link>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="총수입" value={summary.totalIncome} breakdown={cardBreakdown(summary.totalIncomeByPerson)} />
        <SummaryCard label="총지출" value={summary.totalExpense} breakdown={cardBreakdown(summary.totalExpenseByPerson)} />
        <SummaryCard label="당월 잔고" value={summary.balance} breakdown={cardBreakdown(summary.balanceByPerson)} />
        <SummaryCard
          label="저축율"
          value={summary.savingsRate}
          breakdown={cardBreakdown(summary.savingsRateByPerson)}
          format="signedPct"
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="고정수입"
          value={summary.fixedIncome}
          breakdown={cardBreakdown(summary.fixedIncomeByPerson)}
          variant="detail"
        />
        <SummaryCard
          label="변동수입"
          value={summary.variableIncome}
          breakdown={cardBreakdown(summary.variableIncomeByPerson)}
          variant="detail"
        />
        <SummaryCard
          label="고정비"
          value={summary.fixedExpense}
          breakdown={cardBreakdown(summary.fixedExpenseByPerson)}
          variant="detail"
        />
        <SummaryCard
          label="변동비"
          value={summary.variableExpense}
          breakdown={cardBreakdown(summary.variableExpenseByPerson)}
          variant="detail"
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
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold lg:table-cell">결제한 사람</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold lg:table-cell">주체</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
              <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
                고정비
              </td>
            </tr>
            {fixedRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                byPerson={categoryByPerson.get(b.name) ?? {}}
                byBeneficiary={categoryByBeneficiary.get(b.name) ?? {}}
                personLabelOf={personLabelOf}
                benLabelOf={benLabelOf}
              />
            ))}
            <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
              <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-ink-muted">
                변동비
              </td>
            </tr>
            {variableRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                byPerson={categoryByPerson.get(b.name) ?? {}}
                byBeneficiary={categoryByBeneficiary.get(b.name) ?? {}}
                personLabelOf={personLabelOf}
                benLabelOf={benLabelOf}
              />
            ))}
            {unmappedTotal > 0 && (
              <tr className="border-b-[0.8px] border-hairline2 last:border-0">
                <td className="px-2 py-2 text-gain sm:px-3">{UNMAPPED}</td>
                <td className="px-2 py-2 text-right text-ink-muted sm:px-3">-</td>
                <td className="px-2 py-2 text-right font-semibold text-ink sm:px-3">{formatKRW(unmappedTotal)}</td>
                <td className="px-2 py-2 text-right text-ink-muted sm:px-3">-</td>
                <td className="hidden px-3 py-2 text-ink-muted lg:table-cell">
                  {formatBreakdown(categoryByPerson.get(UNMAPPED) ?? {}, personLabelOf)}
                </td>
                <td className="hidden px-3 py-2 text-ink-muted lg:table-cell">
                  {formatBreakdown(categoryByBeneficiary.get(UNMAPPED) ?? {}, benLabelOf)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
