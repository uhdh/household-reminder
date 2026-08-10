"use client";

import { ResponsiveContainer, Treemap } from "recharts";
import { HEATMAP_GAIN, HEATMAP_LOSS, HEATMAP_NEUTRAL } from "@/lib/finance-format";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";

type CategoryDatum = { name: string; value: number; fill: string };
type TreemapDatum = { name: string; value: number; fill: string; returnPct: number | null; sharePct: number };

function AllocationCard({ title, data }: { title: string; data: CategoryDatum[] }) {
  return <CategoryPie title={title} data={data} />;
}

export function AllocationCharts({
  assetComposition,
  sectorComposition,
}: {
  assetComposition: CategoryDatum[];
  sectorComposition: CategoryDatum[];
}) {
  return (
    <div className={`grid grid-cols-1 gap-3 ${sectorComposition.length > 0 ? "lg:grid-cols-2" : ""}`}>
      <AllocationCard title="자산 구성" data={assetComposition} />
      {sectorComposition.length > 0 && <AllocationCard title="섹터별 평가금액" data={sectorComposition} />}
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
  const { x, y, width, height, name, fill, returnPct, sharePct, index } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
    fill?: string;
    returnPct?: number | null;
    sharePct: number;
    index: number;
  };
  // recharts also invokes content for the synthetic root node, which has no fill/name of its own.
  if (!fill || !name) {
    return <rect x={x} y={y} width={width} height={height} fill="none" />;
  }
  const statusColor =
    returnPct === null || returnPct === undefined || returnPct === 0
      ? HEATMAP_NEUTRAL
      : returnPct > 0
        ? HEATMAP_GAIN
        : HEATMAP_LOSS;
  const padding = 8;
  const clipId = `heatmap-cell-clip-${index}`;
  const label = truncateToWidth(name, width - padding * 2);
  const returnLabel =
    returnPct === null || returnPct === undefined
      ? ""
      : `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(1)}%`;
  const shareLabel = `${sharePct.toFixed(0)}%`;
  const showLabel = width > 32 && height > 18 && label.length > 0;
  const showValue = showLabel && height > 30 && width > 35;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{ fill: "var(--seed-color-bg-neutral-weak)", stroke: "var(--finance-canvas)", strokeWidth: 2 }}
      />
      <title>{`${name} · ${sharePct.toFixed(0)}%${returnLabel ? ` · 수익률 ${returnLabel}` : ""}`}</title>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={width} height={height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={x + 2} y={y + 2} width={Math.max(0, width - 4)} height={4} fill={statusColor} />
        {showLabel && (
          <text
            x={x + padding}
            y={y + 22}
            fontSize={12}
            fontWeight={700}
            stroke="none"
            className="fill-[#0B0B0B] dark:fill-[#F7F7F5]"
          >
            {label}
          </text>
        )}
        {showValue && (
          <text
            x={x + padding}
            y={y + 39}
            fontSize={11}
            fontWeight={600}
            stroke="none"
            className="fill-[#57574F] dark:fill-[#D6D4CB]"
          >
            <tspan>{shareLabel}</tspan>
            {returnLabel && width > 65 && <tspan fill={statusColor}>{` · ${returnLabel}`}</tspan>}
          </text>
        )}
      </g>
    </g>
  );
}

function HeatmapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
      <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: HEATMAP_LOSS }} />
      손실
      <span className="ml-2 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: HEATMAP_NEUTRAL }} />
      현금성/무손익
      <span className="ml-2 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: HEATMAP_GAIN }} />
      수익
    </div>
  );
}

function HeatmapCard({ data }: { data: TreemapDatum[] }) {
  return (
    <div className="seed-card p-4 shadow-none">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">자산 항목 히트맵</h2>
          <span className="text-[11px] text-ink-muted">면적 = 금액 비중 · 상단 띠 = 수익·손실</span>
        </div>
        <HeatmapLegend />
      </div>
      {data.length === 0 ? (
        <p className="text-[13px] text-ink-muted">자산 데이터가 없습니다.</p>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <Treemap
            data={data}
            dataKey="value"
            aspectRatio={4 / 3}
            stroke="var(--finance-canvas)"
            content={<HeatmapCell />}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function DashboardCharts({
  assetComposition,
  treemapData,
  sectorComposition,
}: {
  assetComposition: CategoryDatum[];
  treemapData: TreemapDatum[];
  sectorComposition: CategoryDatum[];
}) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <AllocationCharts assetComposition={assetComposition} sectorComposition={sectorComposition} />
      <HeatmapCard data={treemapData} />
    </div>
  );
}
