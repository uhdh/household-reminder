"use client";

import { useState } from "react";
import { formatKRW } from "@/lib/finance-format";

export type BreakdownItem = {
  label: string;
  value: number;
};

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
  const usagePct = budget && budget > 0 ? (actual / budget) * 100 : null;

  return (
    <>
      <tr className="border-b-[0.8px] border-hairline2 last:border-0">
        <td className="whitespace-nowrap px-2 py-2 text-ink sm:px-3">{name}</td>
        <td className="whitespace-nowrap px-2 py-2 text-right text-ink-muted sm:px-3">
          {budget !== null ? formatKRW(budget) : "-"}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-ink sm:px-3">{formatKRW(actual)}</td>
        <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
          {usagePct !== null ? (
            <span className={usagePct > 100 ? "text-gain" : "text-ink-muted"}>{usagePct.toFixed(0)}%</span>
          ) : "-"}
        </td>
        <td className="whitespace-nowrap px-2 py-2 text-right sm:px-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-accent hover:bg-bg-neutral-weak"
          >
            {expanded ? "닫기" : "상세"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b-[0.8px] border-hairline2 bg-canvas">
          <td colSpan={5} className="px-3 py-4">
            <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
              {!hidePayerBreakdown && <Breakdown title="결제한 사람" items={paidBy} />}
              <Breakdown title="사용 주체" items={beneficiaries} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
