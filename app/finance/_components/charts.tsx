"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { formatKRW, isLightColor } from "@/lib/finance-format";

type CategoryDatum = { name: string; value: number; fill: string };
type TreemapDatum = { name: string; value: number; fill: string; returnPct: number | null; sharePct: number };

const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E1E0D9",
  borderRadius: 2,
  color: "#0B0B0B",
  fontSize: 12,
};

function CardHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      {caption && <span className="text-[11px] text-ink-muted">{caption}</span>}
    </div>
  );
}

function LegendList({ data }: { data: CategoryDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <ul className="mt-3 space-y-2">
      {data.map((d) => {
        const pct = (d.value / total) * 100;
        return (
          <li key={d.name} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: d.fill }} />
            <span className="w-20 shrink-0 truncate text-ink-muted">{d.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
              <span
                className="block h-1.5 rounded-full"
                style={{ width: `${pct}%`, backgroundColor: d.fill }}
              />
            </span>
            <span className="w-24 shrink-0 text-right tabular-nums text-ink">{formatKRW(d.value)}</span>
            <span className="w-10 shrink-0 text-right tabular-nums text-ink-muted">{pct.toFixed(0)}%</span>
          </li>
        );
      })}
    </ul>
  );
}

function AllocationCard({ title, data }: { title: string; data: CategoryDatum[] }) {
  return (
    <div className="border-[0.8px] border-hairline bg-card p-4">
      <CardHeader title={title} caption={`${data.length}개 항목`} />
      {data.length === 0 ? (
        <p className="text-[13px] text-ink-muted">데이터가 없습니다.</p>
      ) : (
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
          <div className="w-full sm:w-[55%]">
            <LegendList data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

// 폭에 맞춰 라벨을 자르기 위한 대략적인 문자당 픽셀 폭(12px 세미볼드 기준)
const CHAR_WIDTH = 7.2;

function truncateToWidth(text: string, availableWidth: number): string {
  const maxChars = Math.floor(availableWidth / CHAR_WIDTH);
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1)}…`;
}

function HeatmapCell(props: unknown) {
  const { x, y, width, height, name, value, fill, returnPct, sharePct, index } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
    value: number;
    fill?: string;
    returnPct?: number | null;
    sharePct: number;
    index: number;
  };
  // recharts also invokes content for the synthetic root node, which has no fill/name of its own.
  if (!fill || !name) {
    return <rect x={x} y={y} width={width} height={height} fill="none" />;
  }
  const light = isLightColor(fill);
  const textColor = light ? "#0B0B0B" : "#FFFFFF";
  const haloColor = light ? "rgba(255,255,255,0.85)" : "rgba(11,11,11,0.55)";
  const padding = 8;
  const clipId = `heatmap-cell-clip-${index}`;
  const label = truncateToWidth(name, width - padding * 2);
  const returnLabel =
    returnPct === null || returnPct === undefined
      ? formatKRW(value)
      : `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`;
  const subLabel = `면적 비중 ${sharePct.toFixed(0)}%`;
  const detailLabel = `${subLabel} · ${returnLabel}`;
  const showLabel = width > 40 && height > 22 && label.length > 0;
  const showValue = showLabel && height > 42 && width > 60;
  const textHaloProps = {
    stroke: haloColor,
    strokeWidth: 3,
    strokeLinejoin: "round" as const,
    paintOrder: "stroke" as const,
  };
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: "#FAFAF9", strokeWidth: 2 }} />
      <clipPath id={clipId}>
        <rect x={x} y={y} width={width} height={height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {showLabel && (
          <text x={x + padding} y={y + 18} fontSize={12} fontWeight={700} fill={textColor} {...textHaloProps}>
            {label}
          </text>
        )}
        {showValue && (
          <text x={x + padding} y={y + 34} fontSize={11} fontWeight={600} fill={textColor} {...textHaloProps}>
            {truncateToWidth(detailLabel, width - padding * 2)}
          </text>
        )}
      </g>
    </g>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
      <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: "#D03B3B" }} />
      손실
      <span className="ml-2 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: "#D6D4CB" }} />
      현금성/무손익
      <span className="ml-2 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: "#15803D" }} />
      수익
    </div>
  );
}

function HeatmapCard({ data }: { data: TreemapDatum[] }) {
  return (
    <div className="border-[0.8px] border-hairline bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">자산 항목 히트맵</h2>
          <span className="text-[11px] text-ink-muted">면적 = 금액 비중 · 색상 = 수익률</span>
        </div>
        <HeatmapLegend />
      </div>
      {data.length === 0 ? (
        <p className="text-[13px] text-ink-muted">자산 데이터가 없습니다.</p>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <Treemap data={data} dataKey="value" aspectRatio={4 / 3} stroke="#FAFAF9" content={<HeatmapCell />} />
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function DashboardCharts({
  assetComposition,
  debtComposition,
  treemapData,
  sectorComposition,
}: {
  assetComposition: CategoryDatum[];
  debtComposition: CategoryDatum[];
  treemapData: TreemapDatum[];
  sectorComposition: CategoryDatum[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AllocationCard title="자산 구성" data={assetComposition} />
        <AllocationCard title="부채 구성" data={debtComposition} />
      </div>
      {sectorComposition.length > 0 && <AllocationCard title="섹터별 평가금액" data={sectorComposition} />}
      <HeatmapCard data={treemapData} />
    </div>
  );
}
