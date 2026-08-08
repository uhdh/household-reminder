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
import { BeneficiarySelect } from "./beneficiary-select";
import { CategorySelect } from "./category-select";
import { PersonFilter } from "./person-filter";

export const dynamic = "force-dynamic";

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; person?: string }>;
}) {
  const { month: monthParam, person } = await searchParams;
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";

  const db = getDb();
  const [{ transactions: allTx, displayNameByPerson }, budgetRows] = await Promise.all([
    getActiveTransactions(),
    db.select().from(budgetCategories),
  ]);
  const categoryOptions = [...budgetRows]
    .sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder))
    .map((b) => ({ name: b.name, kind: b.kind }));
  const includedTx = allTx.filter((t) => t.included);

  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(includedTx);

  const monthTx = includedTx.filter((t) => monthKeyOf(t.txnDate) === month);
  const filtered = (personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter)).sort(
    (a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate))
  );

  const unmappedCount = filtered.filter((t) => !t.stdCategory).length;

  const returnTo = `/finance/spending?month=${month}${personFilter === "all" ? "" : `&person=${personFilter}`}`;
  const hrefFor = (m: string, p: "all" | PersonId) =>
    `/finance/spending?month=${m}${p === "all" ? "" : `&person=${p}`}`;

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

        <PersonFilter pathname="/finance/spending" periodKey="month" periodValue={month} selected={personFilter} displayNameByPerson={displayNameByPerson} />
      </div>

      {unmappedCount > 0 && (
        <div className="mb-3 border-[0.8px] border-gain/30 bg-gain/10 px-3 py-2 text-[12px] text-gain">
          표준카테고리가 없는 거래 {unmappedCount}건이 있습니다.{" "}
          <Link href="/finance/spending/settings" className="underline">
            설정에서 매핑하기
          </Link>
        </div>
      )}

      <div className="overflow-x-auto border-[0.8px] border-hairline bg-card">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">날짜</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">구분</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold sm:table-cell">결제한 사람</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">주체</th>
              <th className="whitespace-nowrap px-2 py-2 text-[11px] font-semibold sm:px-3">카테고리</th>
              <th className="hidden whitespace-nowrap px-3 py-2 text-[11px] font-semibold md:table-cell">결제수단</th>
              <th className="hidden px-3 py-2 text-[11px] font-semibold md:table-cell">메모</th>
              <th className="whitespace-nowrap px-2 py-2 text-right text-[11px] font-semibold sm:px-3">금액</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-muted">
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
                  <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted sm:table-cell">
                    {displayNameByPerson.get(t.personId) ?? PERSON_LABELS[t.personId as PersonId] ?? t.personId}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                    <BeneficiarySelect txnId={t.id} value={t.beneficiary} returnTo={returnTo} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 sm:px-3">
                    <CategorySelect txnId={t.id} value={t.stdCategory} options={categoryOptions} returnTo={returnTo} />
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-ink-muted md:table-cell">
                    {t.paymentMethod ?? "-"}
                  </td>
                  <td className="hidden px-3 py-2 text-ink-muted md:table-cell">{t.description ?? "-"}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums sm:px-3">
                    {formatKRW(Math.abs(toNum(t.amount)))}
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
