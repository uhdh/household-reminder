import Link from "next/link";
import { formatKRW } from "@/lib/finance-format";
import type { BeneficiarySpending } from "@/lib/spending-queries";

/** 월별 화면의 "개인 지출 현황": 사용 대상별 개인 지출·월 용돈 한도(초과 시 강조)와 공동 지출. */
export function BeneficiaryCard({ month, summary }: { month: string; summary: BeneficiarySpending }) {
  const hrefFor = (beneficiary: string) => `/finance/spending?${new URLSearchParams({ month, flow: "expense", beneficiary })}`;

  return (
    <section className="seed-card mb-4 p-5 shadow-none sm:p-7" aria-labelledby="beneficiary-card-title">
      <h2 id="beneficiary-card-title" className="mb-4 text-[18px] font-extrabold text-ink">개인 지출 현황</h2>
      <ul className="space-y-4">
        {summary.rows.map((row) => {
          const usagePct = row.allowance === null ? null : row.allowance > 0 ? Math.min((row.spent / row.allowance) * 100, 100) : row.spent > 0 ? 100 : 0;
          return (
            <li key={row.id}>
              <Link href={hrefFor(row.id)} className="block rounded-r2 hover:bg-bg-neutral-weak/60">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-bold text-ink">{row.label}</span>
                  <span className="text-[15px] font-bold tabular-nums text-ink">
                    {formatKRW(row.spent)}
                    {row.allowance !== null && <span className="ml-1.5 text-[13px] font-medium text-ink-muted">/ 한도 {formatKRW(row.allowance)}</span>}
                  </span>
                </div>
                {usagePct !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-neutral-weak">
                    <div className={`h-full rounded-full ${row.over > 0 ? "bg-fg-critical/60" : "bg-ink/40"}`} style={{ width: `${usagePct}%` }} />
                  </div>
                )}
                {row.over > 0 && <p className="mt-1 text-[13px] font-semibold text-fg-critical">초과 {formatKRW(row.over)}</p>}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href={hrefFor("joint")} className="flex items-baseline justify-between gap-3 rounded-r2 hover:bg-bg-neutral-weak/60">
            <span className="text-[15px] font-bold text-ink">공동</span>
            <span className="text-[15px] font-bold tabular-nums text-ink">{formatKRW(summary.joint)}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
