"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/finance-format";

export type CategoryTransaction = {
  id: string;
  description: string | null;
  amount: number;
};

type UsageStatus = "good" | "warn" | "over";

const USAGE_COLORS: Record<UsageStatus, { fill: string; text: string }> = {
  good: { fill: "bg-bg-positive-solid", text: "text-fg-positive" },
  warn: { fill: "bg-bg-warning-solid", text: "text-fg-warning" },
  over: { fill: "bg-bg-critical-solid", text: "text-fg-critical" },
};

function usageStatus(pct: number): UsageStatus {
  if (pct > 100) return "over";
  if (pct >= 70) return "warn";
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
      {budget !== null && budget > 0 && <span className="text-ink-muted"> / {formatKRW(budget)}</span>}
      {usagePct !== null && <span className={USAGE_COLORS[usageStatus(usagePct)].text}>({usagePct.toFixed(0)}%)</span>}
    </span>
  );
}

/** 막대 앞 GAUGE_SPLIT%는 0~100% 사용률 구간, 뒤 나머지는 100%를 넘긴 초과분을 scaleMax 기준으로 다시 늘려 보여주는 구간. */
const GAUGE_SPLIT = 60;

function gaugeWidth(pct: number, scaleMax: number): number {
  if (pct <= 100) return (pct / 100) * GAUGE_SPLIT;
  const overRange = Math.max(scaleMax - 100, 1);
  const over = Math.min(pct - 100, overRange);
  return GAUGE_SPLIT + (over / overRange) * (100 - GAUGE_SPLIT);
}

export function UsageBar({ actual, budget, scaleMax }: { actual: number; budget: number | null; scaleMax: number }) {
  const usagePct = usagePctOf(actual, budget);
  if (usagePct === null) return null;
  return (
    <div className="relative mt-2.5 h-2 overflow-hidden rounded-full bg-bg-neutral-weak">
      <div
        className={`h-full rounded-full ${USAGE_COLORS[usageStatus(usagePct)].fill}`}
        style={{ width: `${gaugeWidth(usagePct, scaleMax)}%` }}
      />
      <div className="absolute inset-y-0 w-0.5 bg-ink/50" style={{ left: `${GAUGE_SPLIT}%` }} />
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
