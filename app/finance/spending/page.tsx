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
  toNum,
  type PersonId,
} from "@/lib/spending-queries";
import { formatKRW } from "@/lib/finance-format";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";
import { BeneficiarySelect } from "./beneficiary-select";
import { CategoryMergeToast, CategorySelect } from "./category-select";
import {
  buildMerchantCategoryIndex,
  buildMerchantCounts,
  buildRawCategoryIndex,
  findMatchingTransactionIds,
  findNextUnclassifiedId,
  recommendCategoriesForTransaction,
  topFrequentCategories,
} from "./category-suggest";
import { PersonFilter } from "./person-filter";
import { MonthlyNavigator } from "./monthly/monthly-navigator";
import { ManualTransactionForm } from "./manual-transaction-form";
import { TransactionDeleteButton } from "./transaction-delete-button";
import { SelectAllTransactions, TransactionBulkDeleteForm, TransactionCheckbox } from "./transaction-bulk-delete";
import { DemoTransactionList } from "@/app/finance/_components/demo-pages";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";

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
    review?: string;
    toastMerchant?: string;
    toastCategory?: string;
    toastTxnType?: string;
    toastTxnId?: string;
  }>;
}) {
  const {
    month: monthParam,
    person,
    addError,
    flow,
    beneficiary,
    category,
    q,
    review,
    toastMerchant,
    toastCategory,
    toastTxnType,
    toastTxnId,
  } = await searchParams;
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";
  const reviewMode = review === "1";

  if (await isFinanceDemoMode()) {
    return <DemoTransactionList personFilter={personFilter} />;
  }

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
  const categoryFilter = category === "미분류" ? "미분류" : categoryOptions.some((option) => option.name === category) ? category! : "all";
  const query = q?.trim().slice(0, 50) ?? "";
  // 자산수정은 집계에서는 제외하지만, 사용자가 다른 카테고리로 변경할 수 있도록
  // 세부 내역 화면에는 계속 노출한다.
  const visibleTx = allTx.filter((t) => t.included || t.stdCategory === "자산수정");

  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(visibleTx);

  // 카테고리 추천/자주 쓰는 계산은 이미 불러온 전체 활성 거래(allTx)로 서버에서 한 번만 계산해
  // prop으로 내려준다(행마다 추가 쿼리를 하지 않는다).
  const merchantIndex = buildMerchantCategoryIndex(allTx);
  const rawIndex = buildRawCategoryIndex(allTx);
  const merchantCounts = buildMerchantCounts(allTx);

  // 병합 토스트가 실제로 바꿀 대상: 정규화 가맹점 키 + txnType이 정확히 같은 다른 거래만
  // (ILIKE 부분일치가 아님). 표시 건수 = 이 배열 길이이므로 항상 일치한다.
  const toastTxnIds =
    toastMerchant && toastCategory
      ? findMatchingTransactionIds(allTx, toastMerchant, toastTxnType ?? "지출", toastTxnId)
      : [];

  const monthTx = visibleTx.filter((t) => monthKeyOf(t.txnDate) === month);
  const monthPersonTx = personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter);
  const filtered = monthPersonTx
    .filter((t) => flowFilter === "all" || (flowFilter === "income" ? flowLabel(t) === "입금" : flowLabel(t) === "지출"))
    .filter((t) => beneficiaryFilter === "all" || t.beneficiary === beneficiaryFilter)
    .filter((t) => categoryFilter === "all" || (categoryFilter === "미분류" ? !t.stdCategory : t.stdCategory === categoryFilter))
    .filter((t) => {
      if (!query) return true;
      const haystack = [t.description, t.paymentMethod, t.category, t.subcategory, t.stdCategory]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko");
      return haystack.includes(query.toLocaleLowerCase("ko"));
    })
    .sort((a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate)));

  // '자주 쓰는' 카테고리는 현재 화면에 보이는 목록 기준.
  const frequentCategories = topFrequentCategories(filtered);

  // 분류 모드: 이번에 저장한 거래가 필터에서 빠지면서 목록의 첫 미분류 거래가 자연스럽게
  // "다음 미분류"가 된다. 그 다음 항목의 행 피커를 자동으로 연다.
  const autoOpenTxnId = reviewMode ? findNextUnclassifiedId(filtered) : null;

  const reviewCandidates = monthPersonTx.filter((t) => !t.stdCategory);
  const unclassifiedCount = reviewCandidates.length;
  const unclassifiedAmount = reviewCandidates.reduce((sum, t) => sum + Math.abs(toNum(t.amount)), 0);

  const activeFilterParams: Record<string, string> = {};
  if (flowFilter !== "all") activeFilterParams.flow = flowFilter;
  if (beneficiaryFilter !== "all") activeFilterParams.beneficiary = beneficiaryFilter;
  if (categoryFilter !== "all") activeFilterParams.category = categoryFilter;
  if (query) activeFilterParams.q = query;
  if (reviewMode) activeFilterParams.review = "1";
  const hrefFor = (m: string, p: "all" | PersonId, includeFilters = true) => {
    const params = new URLSearchParams({ month: m, ...(includeFilters ? activeFilterParams : {}) });
    if (p !== "all") params.set("person", p);
    return `/finance/spending?${params.toString()}`;
  };
  const returnTo = hrefFor(month, personFilter);
  const reviewParams = new URLSearchParams({ month, category: "미분류", review: "1" });
  if (personFilter !== "all") reviewParams.set("person", personFilter);
  const reviewHref = `/finance/spending?${reviewParams.toString()}`;

  const exportParams = new URLSearchParams({ month, ...(personFilter !== "all" ? { person: personFilter } : {}), ...activeFilterParams });
  const exportHref = `/api/finance/spending/export?${exportParams.toString()}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">세부 내역</h1>
          <MonthlyNavigator month={month} personFilter={personFilter} basePath="/finance/spending" extraParams={activeFilterParams} />
        </div>

        <PersonFilter pathname="/finance/spending" periodKey="month" periodValue={month} selected={personFilter} displayNameByPerson={displayNameByPerson} extraParams={activeFilterParams} />
      </div>

      <form method="get" className="seed-card mb-4 flex flex-wrap items-end gap-3 p-4 shadow-none sm:p-5">
        <input type="hidden" name="month" value={month} />
        {personFilter !== "all" && <input type="hidden" name="person" value={personFilter} />}
        <label className="min-w-24 flex-1 text-[12px] font-medium text-ink-muted sm:flex-none">
          구분
          <SelectInput name="flow" defaultValue={flowFilter} className="mt-1.5 min-h-11 w-full px-3 py-2 text-[14px]">
            <option value="all">전체</option>
            <option value="expense">지출</option>
            <option value="income">입금</option>
          </SelectInput>
        </label>
        <label className="min-w-24 flex-1 text-[12px] font-medium text-ink-muted sm:flex-none">
          사용 대상
          <SelectInput name="beneficiary" defaultValue={beneficiaryFilter} className="mt-1.5 min-h-11 w-full px-3 py-2 text-[14px]">
            <option value="all">전체</option>
            <option value="husband">남편</option>
            <option value="wife">아내</option>
            <option value="joint">우리</option>
          </SelectInput>
        </label>
        <label className="min-w-32 flex-1 text-[12px] font-medium text-ink-muted sm:flex-none">
          카테고리
          <SelectInput name="category" defaultValue={categoryFilter} className="mt-1.5 min-h-11 w-full px-3 py-2 text-[14px]">
            <option value="all">전체</option>
            <option value="미분류">미분류</option>
            {categoryOptions.map((option) => <option key={option.name} value={option.name}>{option.name}</option>)}
          </SelectInput>
        </label>
        <label className="min-w-44 flex-[2] text-[12px] font-medium text-ink-muted">
          검색
          <TextInput name="q" defaultValue={query} placeholder="메모·결제수단·원본 분류" className="mt-1.5 min-h-11 w-full px-3 py-2 text-[14px]" />
        </label>
        <ActionButton type="submit" className="min-h-11 px-5 py-2 text-[14px]">적용</ActionButton>
        <Link href={hrefFor(month, personFilter, false)} className="seed-button seed-button-secondary min-h-11 px-4 py-2 text-[14px]">초기화</Link>
        <a
          href={exportHref}
          download
          className="seed-button seed-button-secondary inline-flex min-h-11 items-center gap-1.5 px-4 py-2 text-[14px]"
          title="현재 조건의 세부 내역을 엑셀 파일로 다운로드합니다"
        >
          <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          엑셀 다운로드
        </a>
        <span className="ml-auto pb-3 text-[13px] text-ink-muted">{filtered.length}건</span>
      </form>

      {unclassifiedCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-r3 border border-stroke-brand-weak bg-bg-brand-weak px-4 py-3 text-[14px] font-medium text-fg-neutral">
          <span>
            분류 안 된 거래 {unclassifiedCount}건 · {formatKRW(unclassifiedAmount)}원
          </span>
          <div className="flex items-center gap-3">
            {reviewMode ? (
              <Link href={hrefFor(month, personFilter, false)} className="text-[12px] font-semibold text-ink-muted hover:text-ink">
                분류 모드 종료
              </Link>
            ) : (
              <Link href={reviewHref} className="seed-button seed-button-primary px-4 py-1.5 text-[13px]">
                분류 시작
              </Link>
            )}
            <Link href="/finance/spending/settings" className="text-[12px] font-semibold text-fg-brand">
              설정에서 매핑하기
            </Link>
          </div>
        </div>
      )}

      {toastMerchant && toastCategory && toastTxnIds.length > 0 && (
        <CategoryMergeToast
          merchantKey={toastMerchant}
          category={toastCategory}
          txnType={toastTxnType ?? "지출"}
          txnIds={toastTxnIds}
          returnTo={returnTo}
        />
      )}

      {addError && <div className="mb-3 rounded-r2 bg-bg-critical-weak px-3 py-2 text-[12px] text-fg-critical">{addError}</div>}

      <ManualTransactionForm
        month={month}
        defaultPerson={personFilter === "all" ? "husband" : personFilter}
        categories={categoryOptions}
        returnTo={returnTo}
      />

      <TransactionBulkDeleteForm
        transactionIds={filtered.map((transaction) => transaction.id)}
        returnTo={returnTo}
        categoryOptions={categoryOptions}
        frequentCategories={frequentCategories}
      >
      <div className="mb-2 flex items-center gap-2 px-1 text-[13px] text-ink-muted md:hidden">
        <SelectAllTransactions />
        <span>전체 선택</span>
      </div>
      <div className="seed-card relative overflow-x-auto shadow-none">
        <table className="block w-full text-[14px] md:table md:min-w-[760px]">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-stroke-neutral-muted text-left text-ink-muted">
              <th className="w-9 px-2 py-2 text-center"><SelectAllTransactions /></th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">날짜</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">카테고리</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">결제 · 사용</th>
              <th className="px-3 py-2 text-[11px] font-semibold">메모</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">금액</th>
              <th className="w-12 px-2 py-2 text-right text-[11px] font-semibold sm:px-3"><span className="sr-only">관리</span></th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group">
            {filtered.length === 0 && (
              <tr className="block md:table-row">
                <td colSpan={7} className="block px-3 py-8 text-center text-ink-muted md:table-cell">
                  해당 월에 표시할 거래가 없습니다.
                </td>
              </tr>
            )}
            {filtered.map((t) => {
              const flow = flowLabel(t);
              const rawCategory = t.category ?? "미분류";
              const displayedCategory = t.stdCategory ?? "미분류";
              const payerLabel = displayNameByPerson.get(t.personId) ?? PERSON_LABELS[t.personId as PersonId] ?? t.personId;
              const amount = toNum(t.amount);
              return (
                <tr
                  key={t.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 border-b border-stroke-neutral-muted/60 p-4 last:border-0 md:table-row md:p-0 md:[&>td]:py-3"
                >
                  <td className="col-start-1 row-start-1 md:table-cell md:px-2 md:text-center"><TransactionCheckbox transactionId={t.id} /></td>
                  <td className="col-start-2 row-start-1 text-[13px] text-ink-muted md:table-cell md:whitespace-nowrap md:px-3 md:text-[14px]">{t.txnDate.slice(5)}</td>
                  <td className="col-span-2 col-start-2 row-start-2 md:table-cell md:whitespace-nowrap md:px-3">
                    <div className="flex flex-col gap-0.5">
                      <CategorySelect
                        txnId={t.id}
                        value={t.stdCategory}
                        options={categoryOptions}
                        returnTo={returnTo}
                        description={t.description}
                        txnType={t.txnType}
                        recommendations={recommendCategoriesForTransaction(t, merchantIndex, rawIndex)}
                        frequentCategories={frequentCategories}
                        merchantCounts={merchantCounts}
                        autoOpen={reviewMode && t.id === autoOpenTxnId}
                      />
                      {rawCategory !== displayedCategory && <span className="text-[10px] text-ink-muted/70">원본: {rawCategory}</span>}
                    </div>
                  </td>
                  <td className="col-span-2 col-start-2 row-start-3 md:table-cell md:whitespace-nowrap md:px-3">
                    <div className="flex items-center gap-1 text-[12px]">
                      {t.personId !== t.beneficiary && (
                        <span className="text-ink-muted">
                          {payerLabel}
                          <span className="mx-1 text-ink-muted/60">→</span>
                        </span>
                      )}
                      <BeneficiarySelect txnId={t.id} value={t.beneficiary} returnTo={returnTo} />
                    </div>
                  </td>
                  <td className="col-span-2 col-start-2 row-start-4 md:table-cell md:px-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink-muted">{t.description ?? "-"}</span>
                      {t.paymentMethod && <span className="text-[10px] text-ink-muted/70">{t.paymentMethod}</span>}
                    </div>
                  </td>
                  <td className="col-start-3 row-start-1 text-right text-[17px] font-extrabold tabular-nums md:table-cell md:whitespace-nowrap md:px-3 md:text-[14px] md:font-semibold">
                    <span className={flow === "입금" ? "text-fg-positive" : "text-ink"}>
                      {flow === "입금" ? "+" : "-"}
                      {formatKRW(Math.abs(amount))}
                    </span>
                  </td>
                  <td className="col-span-2 col-start-2 row-start-5 justify-self-end md:table-cell md:whitespace-nowrap md:px-3 md:text-right">
                    <TransactionDeleteButton txnId={t.id} returnTo={returnTo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </TransactionBulkDeleteForm>
    </div>
  );
}
