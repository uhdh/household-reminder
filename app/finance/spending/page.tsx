import Link from "next/link";
import { getDb } from "@/lib/db";
import { budgetCategories } from "@/lib/finance-db";
import {
  MONTH_RE,
  PERSON_LABELS,
  flowLabel,
  getActiveTransactions,
  isPersonId,
  latestMonth,
  monthKeyOf,
  shiftMonth,
  toNum,
  type PersonId,
} from "@/lib/spending-queries";
import { formatKRW } from "@/lib/finance-format";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";
import { BeneficiarySelect } from "./beneficiary-select";
import { CategoryIcon } from "./category-icon";
import { CategorySelect } from "./category-select";
import { PersonFilter } from "./person-filter";
import { ManualTransactionForm } from "./manual-transaction-form";
import { TransactionDeleteButton } from "./transaction-delete-button";

export const dynamic = "force-dynamic";

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    person?: string;
    addError?: string;
    flow?: string;
    beneficiary?: string;
    category?: string;
    q?: string;
  }>;
}) {
  const { month: monthParam, person, addError, flow, beneficiary, category, q } = await searchParams;
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";

  const db = getDb();
  const [{ transactions: allTx, displayNameByPerson }, budgetRows] = await Promise.all([
    getActiveTransactions(),
    db.select().from(budgetCategories),
  ]);
  const categoryOptions = [...budgetRows]
    .sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder))
    .map((b) => ({ name: b.name, kind: b.kind }));
  const flowFilter = flow === "income" || flow === "expense" ? flow : "all";
  const beneficiaryFilter = beneficiary === "husband" || beneficiary === "wife" || beneficiary === "joint" ? beneficiary : "all";
  const categoryFilter = categoryOptions.some((option) => option.name === category) ? category! : "all";
  const query = q?.trim().slice(0, 50) ?? "";
  // 자산수정은 집계에서는 제외하지만, 사용자가 다른 카테고리로 변경할 수 있도록
  // 지출 내역 화면에는 계속 노출한다.
  const visibleTx = allTx.filter((t) => t.included || t.stdCategory === "자산수정");

  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(visibleTx);

  const monthTx = visibleTx.filter((t) => monthKeyOf(t.txnDate) === month);
  const filtered = (personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter))
    .filter((t) => flowFilter === "all" || (flowFilter === "income" ? flowLabel(t) === "입금" : flowLabel(t) === "지출"))
    .filter((t) => beneficiaryFilter === "all" || t.beneficiary === beneficiaryFilter)
    .filter((t) => categoryFilter === "all" || t.stdCategory === categoryFilter)
    .filter((t) => {
      if (!query) return true;
      const haystack = [t.description, t.paymentMethod, t.category, t.subcategory, t.stdCategory]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko");
      return haystack.includes(query.toLocaleLowerCase("ko"));
    })
    .sort((a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate)));

  const unmappedCount = filtered.filter((t) => !t.stdCategory).length;

  const activeFilterParams: Record<string, string> = {};
  if (flowFilter !== "all") activeFilterParams.flow = flowFilter;
  if (beneficiaryFilter !== "all") activeFilterParams.beneficiary = beneficiaryFilter;
  if (categoryFilter !== "all") activeFilterParams.category = categoryFilter;
  if (query) activeFilterParams.q = query;
  const hrefFor = (m: string, p: "all" | PersonId, includeFilters = true) => {
    const params = new URLSearchParams({ month: m, ...(includeFilters ? activeFilterParams : {}) });
    if (p !== "all") params.set("person", p);
    return `/finance/spending?${params.toString()}`;
  };
  const returnTo = hrefFor(month, personFilter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={hrefFor(shiftMonth(month, -1), personFilter)}
            className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
          >
            ← 이전달
          </Link>
          <span className="text-[14px] font-semibold text-ink">{month}</span>
          <Link
            href={hrefFor(shiftMonth(month, 1), personFilter)}
            className="border-[0.8px] border-hairline px-2 py-1 text-[12px] text-ink-muted hover:text-ink"
          >
            다음달 →
          </Link>
        </div>

        <PersonFilter pathname="/finance/spending" periodKey="month" periodValue={month} selected={personFilter} displayNameByPerson={displayNameByPerson} extraParams={activeFilterParams} />
      </div>

      <form method="get" className="seed-card mb-4 flex flex-wrap items-end gap-2 p-3">
        <input type="hidden" name="month" value={month} />
        {personFilter !== "all" && <input type="hidden" name="person" value={personFilter} />}
        <label className="min-w-24 flex-1 text-[11px] font-semibold text-ink-muted sm:flex-none">
          구분
          <SelectInput name="flow" defaultValue={flowFilter} className="mt-1 min-h-9 w-full px-2 py-1 text-[12px]">
            <option value="all">전체</option>
            <option value="expense">지출</option>
            <option value="income">입금</option>
          </SelectInput>
        </label>
        <label className="min-w-24 flex-1 text-[11px] font-semibold text-ink-muted sm:flex-none">
          사용 대상
          <SelectInput name="beneficiary" defaultValue={beneficiaryFilter} className="mt-1 min-h-9 w-full px-2 py-1 text-[12px]">
            <option value="all">전체</option>
            <option value="husband">남편</option>
            <option value="wife">아내</option>
            <option value="joint">우리</option>
          </SelectInput>
        </label>
        <label className="min-w-32 flex-1 text-[11px] font-semibold text-ink-muted sm:flex-none">
          카테고리
          <SelectInput name="category" defaultValue={categoryFilter} className="mt-1 min-h-9 w-full px-2 py-1 text-[12px]">
            <option value="all">전체</option>
            {categoryOptions.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
          </SelectInput>
        </label>
        <label className="min-w-44 flex-[2] text-[11px] font-semibold text-ink-muted">
          검색
          <TextInput name="q" defaultValue={query} placeholder="메모·결제수단·원본 분류" className="mt-1 min-h-9 w-full px-2 py-1 text-[12px]" />
        </label>
        <ActionButton type="submit" className="min-h-9 px-3 py-1">적용</ActionButton>
        <Link href={hrefFor(month, personFilter, false)} className="seed-button seed-button-secondary min-h-9 px-3 py-1 text-[12px]">초기화</Link>
        <span className="ml-auto pb-2 text-[11px] text-ink-muted">{filtered.length}건</span>
      </form>

      {unmappedCount > 0 && (
        <div className="mb-3 border-[0.8px] border-gain/30 bg-gain/10 px-3 py-2 text-[12px] text-gain">
          표준카테고리가 없는 거래 {unmappedCount}건이 있습니다.{" "}
          <Link href="/finance/spending/settings" className="underline">
            설정에서 매핑하기
          </Link>
        </div>
      )}

      {addError && <div className="mb-3 rounded-r2 bg-bg-critical-weak px-3 py-2 text-[12px] text-fg-critical">{addError}</div>}

      <ManualTransactionForm
        month={month}
        defaultPerson={personFilter === "all" ? "husband" : personFilter}
        categories={categoryOptions}
        returnTo={returnTo}
      />

      <div className="overflow-x-auto border-[0.8px] border-hairline bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">날짜</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">구분</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">카테고리</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold lg:table-cell">대분류</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold sm:table-cell">결제한 사람</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">사용 대상</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold md:table-cell">결제수단</th>
              <th className="hidden px-3 py-2 text-[11px] font-semibold md:table-cell">메모</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">금액</th>
              <th className="w-12 px-2 py-2 text-right text-[11px] font-semibold sm:px-3"><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-ink-muted">
                  해당 월에 표시할 거래가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map((t) => {
              const flow = flowLabel(t);
              return (
                <tr key={t.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                  <td className="whitespace-nowrap px-2 py-2 text-ink-muted sm:px-3">{t.txnDate.slice(5)}</td>
                  <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                    <span className={flow === "입금" ? "text-legend1" : "text-ink"}>{flow}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                    <div className="flex items-center gap-1.5">
                      <CategoryIcon name={t.stdCategory} className="shrink-0 text-ink-muted" />
                      <CategorySelect txnId={t.id} value={t.stdCategory} options={categoryOptions} returnTo={returnTo} />
                    </div>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted lg:table-cell">
                    {t.category ?? "-"}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted sm:table-cell">
                    {displayNameByPerson.get(t.personId) ?? PERSON_LABELS[t.personId as PersonId] ?? t.personId}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                    <BeneficiarySelect txnId={t.id} value={t.beneficiary} returnTo={returnTo} />
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted md:table-cell">
                    {t.paymentMethod ?? "-"}
                  </td>
                  <td className="hidden px-3 py-2 text-ink-muted md:table-cell">{t.description ?? "-"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums sm:px-3">
                    {formatKRW(Math.abs(toNum(t.amount)))}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
                    <TransactionDeleteButton txnId={t.id} returnTo={returnTo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
