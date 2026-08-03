"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatKRW } from "@/lib/finance-format";

type Datum = { name: string; value: number; fill: string };

const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E1E0D9",
  borderRadius: 2,
  color: "#0B0B0B",
  fontSize: 12,
};

export function ExpenseDonut({ data }: { data: Datum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;

  if (data.length === 0) {
    return <p className="text-[13px] text-ink-muted">이번 달 지출 데이터가 없습니다.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:flex-row">
      <ResponsiveContainer width="100%" height={180} className="sm:w-[45%]">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={48}
            outerRadius={80}
            paddingAngle={2}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatKRW(Number(value))} contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="w-full space-y-2 sm:w-[55%]">
        {data.map((d) => {
          const pctOfTotal = (d.value / total) * 100;
          const barWidthPct = (d.value / max) * 100;
          return (
            <li key={d.name} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.fill }} />
              <span className="w-20 shrink-0 truncate text-ink-muted">{d.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                <span
                  className="block h-1.5 rounded-full"
                  style={{ width: `${barWidthPct}%`, backgroundColor: d.fill }}
                />
              </span>
              <span className="w-24 shrink-0 text-right tabular-nums text-ink">{formatKRW(d.value)}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-ink-muted">{pctOfTotal.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
