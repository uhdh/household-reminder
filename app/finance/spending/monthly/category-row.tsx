"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/finance-format";

export type CategoryTransaction = {
  id: string;
  description: string | null;
  amount: number;
};

type UsageStatus = "good" | "warn" | "over";

// 빨강은 "예산 초과"에만 쓰고, 그 전까지는 차분한 색으로 보여준다(막대가 전부 빨갛게 보이지 않도록).
const USAGE_COLORS: Record<UsageStatus, { fill: string; text: string }> = {
  good: { fill: "bg-bg-informative-solid/70", text: "text-ink-muted" },
  warn: { fill: "bg-bg-warning-solid", text: "text-ink-muted" },
  over: { fill: "bg-bg-critical-solid/45", text: "text-fg-critical" },
};

function usageStatus(pct: number): UsageStatus {
  if (pct > 100) return "over";
  if (pct >= 90) return "warn";
  return "good";
}

function usagePctOf(actual: number, budget: number | null): number | null {
  return budget !== null && budget > 0 ? (actual / budget) * 100 : null;
}

export function UsageAmount({ actual, budget }: { actual: number; budget: number | null }) {
  const usagePct = usagePctOf(actual, budget);
  return (
    <span className="whitespace-nowrap text-[14px] font-bold tabular-nums text-ink">
      {formatKRW(actual)}
      {budget !== null && budget > 0 && <span className="font-medium text-ink-muted"> / {formatKRW(budget)}</span>}
      {usagePct !== null && <span className={`ml-1.5 text-[13px] font-semibold ${USAGE_COLORS[usageStatus(usagePct)].text}`}>{usagePct.toFixed(0)}%</span>}
    </span>
  );
}

/** 막대 전체 길이 = 예산. 초과하면 가득 찬 막대를 부드러운 빨강으로 바꾸고 초과 금액을 글자로 알려준다. */
export function UsageBar({ actual, budget }: { actual: number; budget: number | null; scaleMax?: number }) {
  const usagePct = usagePctOf(actual, budget);
  if (usagePct === null || budget === null) return null;
  const status = usageStatus(usagePct);
  const diff = budget - actual;
  return (
    <div className="mt-2.5 flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-neutral-weak">
        <div className={`h-full rounded-full ${USAGE_COLORS[status].fill}`} style={{ width: `${Math.min(usagePct, 100)}%` }} />
      </div>
      <span className={`shrink-0 text-[12px] font-medium tabular-nums ${status === "over" ? "text-fg-critical" : "text-ink-muted"}`}>
        {diff >= 0 ? `${formatKRW(diff)} 남음` : `${formatKRW(-diff)} 초과`}
      </span>
    </div>
  );
}

export function CategoryRow({
  name,
  budget,
  actual,
  transactions,
  scaleMax,
}: {
  name: string;
  budget: number | null;
  actual: number;
  transactions: CategoryTransaction[];
  scaleMax: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (actual === 0 && budget === null) return null;
  const hasBudget = budget !== null && budget > 0;

  return (
    <li className="border-b border-stroke-neutral-muted/60 px-4 py-4 last:border-0 sm:px-6">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <span
            aria-hidden="true"
            className={`text-[14px] font-bold text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
          {name}
        </span>
        <UsageAmount actual={actual} budget={budget} />
      </button>
      {hasBudget ? (
        <UsageBar actual={actual} budget={budget} scaleMax={scaleMax} />
      ) : (
        <span className="mt-2 inline-block rounded-full bg-bg-neutral-weak px-2.5 py-1 text-[12px] font-medium text-ink-muted">
          예산 미설정
        </span>
      )}
      {expanded && (
        <ul className="mt-3 divide-y divide-stroke-neutral-muted/60 border-t border-stroke-neutral-muted/60 text-[13px]">
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
