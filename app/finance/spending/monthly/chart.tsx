"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { formatCompactKRW, formatKRW, formatManwon, isLightColor } from "@/lib/finance-format";

type Datum = { name: string; value: number; fill: string };

const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E1E0D9",
  borderRadius: 2,
  color: "#0B0B0B",
  fontSize: 12,
};

const RADIAN = Math.PI / 180;
const LABEL_GAP = 8;
const LABEL_ELBOW = 18;
const LABEL_TAIL = 14;

function renderLeaderLabel(props: PieLabelRenderProps) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const midAngle = props.midAngle ?? 0;
  const outerRadius = Number(props.outerRadius ?? 0);
  const percent = props.percent ?? 0;
  const name = String(props.name ?? "");
  const fill = String(props.fill ?? "var(--finance-ink-muted)");
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + LABEL_GAP) * cos;
  const sy = cy + (outerRadius + LABEL_GAP) * sin;
  const mx = cx + (outerRadius + LABEL_GAP + LABEL_ELBOW) * cos;
  const my = cy + (outerRadius + LABEL_GAP + LABEL_ELBOW) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * LABEL_TAIL;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";
  const textX = ex + (cos >= 0 ? 4 : -4);

  return (
    <g key={name}>
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={sx} cy={sy} r={2} fill={fill} stroke="none" />
      <text x={textX} y={ey} dominantBaseline="central" textAnchor={textAnchor} fontSize={11} fill="var(--finance-ink)">
        {name}
        <tspan fill="var(--finance-ink-muted)">{` ${(percent * 100).toFixed(1)}%`}</tspan>
      </text>
    </g>
  );
}

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
      <div className="border-[0.8px] border-hairline bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        </div>
        <p className="text-[13px] text-ink-muted">이번 달 {title} 내역이 없습니다.</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const formatAmount = amountFormat === "manwon" ? formatManwon : formatKRW;

  return (
    <div className="border-[0.8px] border-hairline bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        {showTotal && (
          <span className="shrink-0 text-[12px] tabular-nums text-ink-muted" title={formatKRW(total)}>
            {amountFormat === "manwon" ? formatManwon(total) : formatCompactKRW(total)}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart margin={{ top: 24, right: 56, bottom: 24, left: 56 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={44}
            outerRadius={70}
            paddingAngle={2}
            isAnimationActive={false}
            label={renderLeaderLabel}
            labelLine={false}
          >
            {data.map((d, index) => (
              <Cell key={`${d.name}-${index}`} fill={d.fill} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatAmount(Number(value))} contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-2 space-y-1.5">
        {data.map((d, index) => {
          const pct = (d.value / total) * 100;
          return (
            <li key={`${d.name}-${index}`} className="flex items-center gap-2 text-[12px]">
              <span
                className={`w-10 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${
                  isLightColor(d.fill) ? "text-[#0B0B0B]" : "text-white"
                }`}
                style={{ backgroundColor: d.fill }}
              >
                {pct.toFixed(0)}%
              </span>
              <span className="flex-1 truncate text-ink-muted">{d.name}</span>
              <span className="shrink-0 text-right tabular-nums text-ink">{formatAmount(d.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
