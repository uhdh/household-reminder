"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCompactKRW, formatKRW, formatManwon } from "@/lib/finance-format";

type Datum = { name: string; value: number; fill: string };

const TOOLTIP_STYLE = {
  backgroundColor: "var(--seed-color-bg-layer-floating)",
  border: "1px solid var(--seed-color-stroke-neutral-muted)",
  borderRadius: 10,
  color: "var(--seed-color-fg-neutral)",
  fontSize: 12,
};

export function CategoryPie({
  title,
  data,
  amountFormat = "krw",
  showTotal = false,
}: {
  title: string;
  data: Datum[];
  amountFormat?: "krw" | "manwon";
  showTotal?: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="seed-card p-5 shadow-none sm:p-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
        </div>
        <p className="text-[13px] text-ink-muted">이번 달 {title} 내역이 없습니다.</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const formatAmount = amountFormat === "manwon" ? formatManwon : formatKRW;
  const totalLabel = amountFormat === "manwon" ? formatManwon(total) : formatCompactKRW(total);

  return (
    <div className="seed-card p-5 shadow-none sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
        {showTotal && (
          <span className="shrink-0 text-[13px] tabular-nums text-ink-muted" title={formatKRW(total)}>
            {totalLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <div className="relative size-[176px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {data.map((d, index) => (
                  <Cell key={`${d.name}-${index}`} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatAmount(Number(value))} contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[12px] text-ink-muted">합계</span>
            <span className="text-[17px] font-extrabold tabular-nums text-ink" title={formatKRW(total)}>
              {totalLabel}
            </span>
          </div>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-3.5">
          {data.map((d, index) => {
            const pct = (d.value / total) * 100;
            return (
              <li key={`${d.name}-${index}`}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.fill }} aria-hidden="true" />
                    <span className="truncate text-ink">{d.name}</span>
                    <span className="shrink-0 text-[13px] text-ink-muted">{pct.toFixed(0)}%</span>
                  </span>
                  <span className="shrink-0 text-right font-bold tabular-nums text-ink">{formatAmount(d.value)}</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-bg-neutral-weak" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.fill }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
