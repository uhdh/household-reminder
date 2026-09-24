"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/finance-format";
import { CategoryIcon } from "@/app/finance/spending/category-icon";

export type CategoryTransaction = {
  id: string;
  description: string | null;
  amount: number;
};

function usagePctOf(actual: number, budget: number | null): number | null {
  return budget !== null && budget > 0 ? (actual / budget) * 100 : null;
}

/** 남은/초과 금액 한 줄. 색은 초과일 때 빨강 글자 하나에만 쓴다. */
function BudgetDiff({ actual, budget }: { actual: number; budget: number }) {
  const diff = budget - actual;
  return diff >= 0 ? (
    <span className="text-ink-muted">{formatKRW(diff)} 남음</span>
  ) : (
    <span className="font-semibold text-fg-critical">{formatKRW(-diff)} 초과</span>
  );
}

// 호환용(다른 곳에서 합계 표시로 쓰던 컴포넌트): 금액 / 예산 사용률.
export function UsageAmount({ actual, budget }: { actual: number; budget: number | null }) {
  const usagePct = usagePctOf(actual, budget);
  return (
    <span className="whitespace-nowrap text-[14px] font-bold tabular-nums text-ink">
      {formatKRW(actual)}
      {usagePct !== null && <span className={`ml-1.5 text-[13px] font-semibold ${usagePct > 100 ? "text-fg-critical" : "text-ink-muted"}`}>{usagePct.toFixed(0)}%</span>}
    </span>
  );
}

/** 고정비/변동비 카드 머리: 합계, 전체 예산 대비 막대 하나, 초과·여유 개수. */
export function BudgetSectionHeader({
  title,
  actual,
  budget,
  rows,
}: {
  title: string;
  actual: number;
  budget: number | null;
  rows: { actual: number; budget: number | null }[];
}) {
  const usagePct = usagePctOf(actual, budget);
  const budgeted = rows.filter((row) => row.budget !== null && row.budget > 0);
  const overCount = budgeted.filter((row) => row.actual > (row.budget ?? 0)).length;
  return (
    <li className="border-b border-stroke-neutral-muted px-4 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-extrabold text-ink">{title}</span>
        <span className="text-[20px] font-extrabold tabular-nums tracking-[-0.02em] text-ink">{formatKRW(actual)}</span>
      </div>
      {usagePct !== null && budget !== null && (
        <>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-neutral-weak">
              <div className={`h-full rounded-full ${usagePct > 100 ? "bg-fg-critical/60" : "bg-ink/40"}`} style={{ width: `${Math.min(usagePct, 100)}%` }} />
            </div>
            <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${usagePct > 100 ? "text-fg-critical" : "text-ink-muted"}`}>{usagePct.toFixed(0)}%</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[13px] tabular-nums">
            <span className="text-ink-muted">
              예산 {formatKRW(budget)}
              {budgeted.length > 0 && (
                <>
                  {" · "}
                  {overCount > 0 && <span className="font-semibold text-fg-critical">초과 {overCount}</span>}
                  {overCount > 0 && " · "}여유 {budgeted.length - overCount}
                </>
              )}
            </span>
            <BudgetDiff actual={actual} budget={budget} />
          </div>
        </>
      )}
    </li>
  );
}

export function CategoryRow({
  name,
  budget,
  actual,
  transactions,
}: {
  name: string;
  budget: number | null;
  actual: number;
  transactions: CategoryTransaction[];
}) {
  const [expanded, setExpanded] = useState(false);
  if (actual === 0 && budget === null) return null;
  const hasBudget = budget !== null && budget > 0;

  return (
    <li className="border-b border-stroke-neutral-muted/60 last:border-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-bg-neutral-weak/60 sm:px-6"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-neutral-weak text-ink-muted">
          <CategoryIcon name={name} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold text-ink">{name}</span>
          <span className="mt-0.5 block text-[12px] tabular-nums text-ink-muted">{hasBudget ? `예산 ${formatKRW(budget)}` : "예산 없음"}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-bold tabular-nums text-ink">{formatKRW(actual)}</span>
          {hasBudget && (
            <span className="mt-0.5 block text-[12px] tabular-nums">
              <BudgetDiff actual={actual} budget={budget} />
            </span>
          )}
        </span>
        <span aria-hidden="true" className={`shrink-0 text-[14px] font-bold text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}>
          ›
        </span>
      </button>
      {expanded && (
        <ul className="mx-4 mb-3 divide-y divide-stroke-neutral-muted/60 border-t border-stroke-neutral-muted/60 text-[13px] sm:mx-6">
          {transactions.length > 0 ? transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-ink-muted">{transaction.description || "메모 없음"}</span>
              <span className="shrink-0 font-semibold tabular-nums text-ink">{formatKRW(transaction.amount)}</span>
            </li>
          )) : <li className="py-2 text-ink-muted">내역 없음</li>}
        </ul>
      )}
    </li>
  );
}
