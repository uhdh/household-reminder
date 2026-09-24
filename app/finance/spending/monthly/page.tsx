import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import { requireHouseholdOrOnboard } from "@/lib/require-household";
import {
  classifySpendingEmptyState,
  compareMonthlySummaries,
  countsInTotals,
  MONTH_RE,
  flowLabel,
  getActiveTransactions,
  isPersonId,
  latestMonth,
  monthKeyOf,
  shiftMonth,
  summarizeMonthlyTransactions,
  toNum,
  UNMAPPED_CATEGORY,
  unmappedTransferExclusion,
  type PersonId,
} from "@/lib/spending-queries";
import { buildCategoryColorMap, formatCompactKRW, formatKRW, topNWithOther } from "@/lib/finance-format";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "./chart";
import { PersonFilter } from "../person-filter";
import { CategoryRow, UsageAmount } from "./category-row";
import { DemoMonthlySpending } from "@/app/finance/_components/demo-pages";
import { FinanceEmptyState, PeriodEmptyNote } from "@/app/finance/_components/empty-state";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";
import { MonthlyNavigator } from "./monthly-navigator";

export const dynamic = "force-dynamic";

const UNMAPPED = UNMAPPED_CATEGORY;

// 지출 증가·수입/저축 감소는 경고색, 반대 방향은 긍정색으로 표시한다.
function DeltaLine({ kind, delta }: { kind: "income" | "expense" | "balance"; delta: number }) {
  if (delta === 0) return null;
  const increased = delta > 0;
  const isWarning = kind === "expense" ? increased : !increased;
  return (
    <p className={`mt-1 px-1 text-[12px] font-semibold tabular-nums ${isWarning ? "text-fg-warning" : "text-fg-positive"}`}>
      지난달보다 {increased ? "▲" : "▼"} {formatCompactKRW(Math.abs(delta))}
    </p>
  );
}

function CompositionCard({ title, items }: { title: string; items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="seed-card p-5 shadow-none sm:p-7">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
        <span className="text-[17px] font-bold tabular-nums text-ink" title={formatKRW(total)}>{formatCompactKRW(total)}</span>
      </div>
      <div className="mb-4 flex h-3 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
        {items.map((item) => <span key={item.label} className={`rounded-full ${item.color}`} style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />)}
      </div>
      <ul className="flex flex-wrap justify-between gap-x-6 gap-y-2">
        {items.map((item) => {
          const percent = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <li key={item.label} className="flex items-center gap-2 text-[14px]">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${item.color}`} aria-hidden="true" />
              <span className="text-ink">{item.label}</span>
              <span className="font-bold tabular-nums text-ink" title={formatKRW(item.value)}>{formatCompactKRW(item.value)}</span>
              <span className="tabular-nums text-ink-muted">{percent.toFixed(0)}%</span>
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

  if (await isFinanceDemoMode()) {
    const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : "2026-07";
    const personFilter: "all" | PersonId = person === "husband" || person === "wife" ? person : "all";
    return <DemoMonthlySpending personFilter={personFilter} month={month} />;
  }

  const { householdId } = await requireHouseholdOrOnboard();
  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions(householdId);
  const personIds = Array.from(displayNameByPerson.keys());
  const personFilter: "all" | PersonId = isPersonId(person, personIds) ? person : "all";
  const includedTx = allTx.filter(countsInTotals);
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(includedTx);
  const periodTxAll = allTx.filter((t) => monthKeyOf(t.txnDate) === month && (personFilter === "all" || t.personId === personFilter));
  const monthTx = periodTxAll.filter(countsInTotals);
  const exclusion = unmappedTransferExclusion(periodTxAll);
  const emptyState = classifySpendingEmptyState(allTx, periodTxAll);

  const db = getDb();
  const budgetRows = await db.select().from(budgetCategories).where(eq(budgetCategories.householdId, householdId));
  const budgetByName = new Map(budgetRows.map((b) => [b.name, b]));
  const sortedBudgets = [...budgetRows].sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder));

  function kindOf(stdCategory: string | null, flow: "입금" | "지출"): string {
    const b = stdCategory ? budgetByName.get(stdCategory) : undefined;
    if (b) return b.kind;
    return flow === "입금" ? "변동수입" : "변동비";
  }

  const summary = summarizeMonthlyTransactions(monthTx, kindOf, personIds);
  const { categoryTotals } = summary;

  const prevMonth = shiftMonth(month, -1);
  const prevMonthTx = includedTx.filter((t) => monthKeyOf(t.txnDate) === prevMonth && (personFilter === "all" || t.personId === personFilter));
  const prevSummary = prevMonthTx.length > 0 ? summarizeMonthlyTransactions(prevMonthTx, kindOf, personIds) : null;
  const comparison = compareMonthlySummaries(summary, prevSummary);

  // 카테고리별 성격은 budgetCategories 기준으로만 판정한다(집계 때 kindOf가 쓰는
  // 판정과 동일). "고정비"가 아니면 전부 변동비로 묶어야, 상단 지출 구성·하단
  // 예산 목록 합계와 도넛 차트 합계가 항상 같아진다. 예산이 삭제됐거나(고아
  // 카테고리) 수입성 카테고리에 지출이 잡힌 경우도 여기 포함된다.
  function categoryEntriesForKind(kind: "고정비" | "변동비"): [string, number][] {
    return Array.from(categoryTotals.entries()).filter(([name, value]) => {
      if (value <= 0) return false;
      const categoryKind = budgetByName.get(name)?.kind === "고정비" ? "고정비" : "변동비";
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
  const fixedBudgetTotal = fixedRows.reduce((sum, budget) => sum + (budget.monthlyBudget === null ? 0 : toNum(budget.monthlyBudget)), 0);
  const variableBudgetTotal = variableRows.reduce((sum, budget) => sum + (budget.monthlyBudget === null ? 0 : toNum(budget.monthlyBudget)), 0);
  const knownNames = new Set(sortedBudgets.map((b) => b.name));
  const unmappedTotal = Array.from(categoryTotals.entries())
    .filter(([name]) => !knownNames.has(name))
    .reduce((s, [, v]) => s + v, 0);
  const transactionsFor = (category: string) => monthTx
    .filter((transaction) => flowLabel(transaction) === "지출" && (transaction.stdCategory ?? UNMAPPED) === category)
    .sort((a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate)))
    .map((transaction) => ({ id: transaction.id, description: transaction.description, amount: Math.abs(toNum(transaction.amount)) }));

  // 이번 달 가장 심한 초과율에 맞춰 초과 구간 게이지 스케일을 자동으로 잡는다 (최소 200%).
  const usagePercents = [...fixedRows, ...variableRows]
    .map((b) => (b.monthlyBudget !== null && toNum(b.monthlyBudget) > 0 ? ((categoryTotals.get(b.name) ?? 0) / toNum(b.monthlyBudget)) * 100 : null))
    .filter((pct): pct is number => pct !== null);
  const maxUsagePercent = usagePercents.length > 0 ? Math.max(...usagePercents) : 100;
  const scaleMax = Math.max(200, Math.ceil(maxUsagePercent / 50) * 50);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">월별 지출</h1>
          <MonthlyNavigator month={month} personFilter={personFilter} />
        </div>
        <PersonFilter pathname="/finance/spending/monthly" periodKey="month" periodValue={month} selected={personFilter} displayNameByPerson={displayNameByPerson} />
      </div>

      {emptyState === "onboarding" ? (
        <FinanceEmptyState secondaryHref="/finance/spending#manual-entry" secondaryLabel="직접 입력하기" />
      ) : emptyState === "period" ? (
        <PeriodEmptyNote label="이 달" />
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

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <SummaryCard label="총수입" value={summary.totalIncome} format="compactKrw" />
          {comparison && <DeltaLine kind="income" delta={comparison.totalIncomeDelta} />}
        </div>
        <div>
          <SummaryCard label="총지출" value={summary.totalExpense} format="compactKrw" />
          {comparison && <DeltaLine kind="expense" delta={comparison.totalExpenseDelta} />}
        </div>
        <div>
          <SummaryCard label="당월 저축" value={summary.balance} format="compactKrw" />
          {comparison && <DeltaLine kind="balance" delta={comparison.balanceDelta} />}
        </div>
        <SummaryCard
          label="저축률"
          value={summary.savingsRate}
          format="signedPct"
        />
      </div>

      {comparison && comparison.totalExpenseDelta !== 0 && (
        <p className="mb-4 text-[13px] text-ink-muted">
          지난달보다 지출이 {formatCompactKRW(Math.abs(comparison.totalExpenseDelta))} {comparison.totalExpenseDelta > 0 ? "늘었어요" : "줄었어요"}.
          {comparison.topIncreaseCategory &&
            ` 가장 많이 늘어난 건 ${comparison.topIncreaseCategory.name}(+${formatCompactKRW(comparison.topIncreaseCategory.delta)})`}
        </p>
      )}

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
        <CategoryPie title="고정비" data={fixedPieData} amountFormat="manwon" showTotal />
        <CategoryPie title="변동비" data={variablePieData} amountFormat="manwon" showTotal />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="seed-card overflow-hidden shadow-none">
          <ul className="text-[13px]">
            <li className="border-b border-stroke-neutral-muted px-4 py-4 sm:px-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-extrabold text-ink">고정비</span>
                <UsageAmount actual={summary.fixedExpense} budget={fixedBudgetTotal} />
              </div>
            </li>
            {fixedRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                transactions={transactionsFor(b.name)}
                scaleMax={scaleMax}
              />
            ))}
          </ul>
        </div>
        <div className="seed-card overflow-hidden shadow-none">
          <ul className="text-[13px]">
            <li className="border-b border-stroke-neutral-muted px-4 py-4 sm:px-6">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[17px] font-extrabold text-ink">변동비</span>
                <UsageAmount actual={summary.variableExpense} budget={variableBudgetTotal} />
              </div>
            </li>
            {variableRows.map((b) => (
              <CategoryRow
                key={b.name}
                name={b.name}
                budget={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : null}
                actual={categoryTotals.get(b.name) ?? 0}
                transactions={transactionsFor(b.name)}
                scaleMax={scaleMax}
              />
            ))}
            {unmappedTotal > 0 && (
              <CategoryRow
                name={UNMAPPED}
                budget={null}
                actual={unmappedTotal}
                transactions={transactionsFor(UNMAPPED)}
                scaleMax={scaleMax}
              />
            )}
          </ul>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
