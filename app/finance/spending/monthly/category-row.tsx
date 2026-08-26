"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/finance-format";

export type BreakdownItem = {
  label: string;
  value: number;
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
    <span className="whitespace-nowrap font-semibold tabular-nums text-ink">
      {formatKRW(actual)}
      {budget !== null && budget > 0 && <span className="text-ink-muted"> / {formatKRW(budget)}</span>}
      {usagePct !== null && <span className={USAGE_COLORS[usageStatus(usagePct)].text}>({usagePct.toFixed(0)}%)</span>}
    </span>
  );
}

export function UsageBar({ actual, budget }: { actual: number; budget: number | null }) {
  const usagePct = usagePctOf(actual, budget);
  if (usagePct === null) return null;
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg-neutral-weak">
      <div
        className={`h-full rounded-full ${USAGE_COLORS[usageStatus(usagePct)].fill}`}
        style={{ width: `${Math.min(usagePct, 100)}%` }}
      />
    </div>
  );
}

function Breakdown({ title, items }: { title: string; items: BreakdownItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-[11px] font-semibold text-ink-muted">{title}</p>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => {
            const percent = total > 0 ? (item.value / total) * 100 : 0;
            return (
              <li key={item.label}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-ink">{item.label}</span>
                  <span className="tabular-nums text-ink-muted">
                    {formatKRW(item.value)} · {percent.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-neutral-weak">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-ink-muted">내역 없음</p>
      )}
    </div>
  );
}

export function CategoryRow({
  name,
  budget,
  actual,
  paidBy,
  beneficiaries,
  hidePayerBreakdown = false,
}: {
  name: string;
  budget: number | null;
  actual: number;
  paidBy: BreakdownItem[];
  beneficiaries: BreakdownItem[];
  hidePayerBreakdown?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (actual === 0 && budget === null) return null;
  const hasBudget = budget !== null && budget > 0;

  return (
    <li className="border-b-[0.8px] border-hairline2 px-2 py-2.5 last:border-0 sm:px-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-ink">
          <span
            aria-hidden="true"
            className={`text-[10px] text-ink-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ›
          </span>
          {name}
        </span>
        <UsageAmount actual={actual} budget={budget} />
      </button>
      {hasBudget ? (
        <UsageBar actual={actual} budget={budget} />
      ) : (
        <span className="mt-1.5 inline-block rounded-full bg-bg-neutral-weak px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
          예산 미설정
        </span>
      )}
      {expanded && (
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:gap-8">
          {!hidePayerBreakdown && <Breakdown title="결제한 사람" items={paidBy} />}
          <Breakdown title="사용 대상" items={beneficiaries} />
        </div>
      )}
    </li>
  );
}
