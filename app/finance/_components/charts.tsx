"use client";

import { useState } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { HEATMAP_GAIN, HEATMAP_LOSS, HEATMAP_NEUTRAL, formatManwon, formatSignedPct, isLightColor } from "@/lib/finance-format";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";

type CategoryDatum = { name: string; value: number; fill: string };
type TreemapDatum = { name: string; value: number; fill: string; returnPct: number | null; sharePct: number };
/** 히트맵에서 한 칸으로 묶은 현금·예적금의 계좌 한 줄. */
export type CashAccount = {
  key: string;
  personId: string;
  personLabel: string;
  productName: string;
  category: string;
  amount: number;
  ratePct: number | null;
};

function AllocationCard({ title, data }: { title: string; data: CategoryDatum[] }) {
  return <CategoryPie title={title} data={data} amountFormat="manwon" />;
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

// recharts가 칸 좌표·데이터를 덧붙여 복제하므로, 직접 넘기는 건 선택 콜백뿐이다.
function HeatmapCell(props: { onSelect?: (name: string) => void; selectable?: Set<string> }) {
  const { x, y, width, height, name, fill, returnPct, sharePct, index, onSelect, selectable } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    name?: string;
    fill?: string;
    returnPct?: number | null;
    sharePct: number;
    index: number;
    onSelect?: (name: string) => void;
    selectable?: Set<string>;
  };
  // recharts also invokes content for the synthetic root node, which has no fill/name of its own.
  if (!fill || !name) {
    return <rect x={x} y={y} width={width} height={height} fill="none" />;
  }
  const textColor = isLightColor(fill) ? "#0B0B0B" : "#F7F7F5";
  const subTextColor = isLightColor(fill) ? "rgba(11,11,11,0.72)" : "rgba(247,247,245,0.82)";
  const padding = 8;
  const clipId = `heatmap-cell-clip-${index}`;
  const label = truncateToWidth(name, width - padding * 2);
  const returnLabel = returnPct === null || returnPct === undefined ? "" : formatSignedPct(returnPct);
  const shareLabel = `${sharePct.toFixed(0)}%`;
  const showLabel = width > 32 && height > 18 && label.length > 0;
  const showValue = showLabel && height > 30 && width > 35;
  const handleSelect = onSelect && selectable?.has(name) ? () => onSelect(name) : undefined;
  return (
    <g onClick={handleSelect} style={handleSelect ? { cursor: "pointer" } : undefined}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={10}
        style={{ fill, stroke: "var(--seed-color-bg-layer-default)", strokeWidth: 3 }}
      />
      <title>{`${name} · ${sharePct.toFixed(0)}%${returnLabel ? ` · 수익률 ${returnLabel}` : ""}`}</title>
      <clipPath id={clipId}>
        <rect x={x} y={y} width={width} height={height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {showLabel && (
          <text x={x + padding} y={y + 20} fontSize={12} fontWeight={700} stroke="none" fill={textColor}>
            {label}
          </text>
        )}
        {showValue && (
          <text x={x + padding} y={y + 37} fontSize={11} fontWeight={600} stroke="none" fill={subTextColor}>
            <tspan>{shareLabel}</tspan>
            {returnLabel && width > 65 && <tspan>{` · ${returnLabel}`}</tspan>}
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

function HeatmapCard({ data, cashAccounts }: { data: TreemapDatum[]; cashAccounts: CashAccount[] }) {
  // 묶음 칸(현금·예적금)을 누르면 아래에 계좌 목록을 펼친다. 같은 칸을 다시 누르면 접는다.
  const [selected, setSelected] = useState<string | null>(null);
  const groups = new Map<string, CashAccount[]>();
  for (const account of cashAccounts) groups.set(account.category, [...(groups.get(account.category) ?? []), account]);
  const selectable = new Set(groups.keys());
  const toggle = (name: string) => setSelected((current) => (current === name ? null : name));
  const selectedAccounts = selected ? groups.get(selected) ?? [] : [];
  return (
    <div className="seed-card p-5 shadow-none sm:p-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div>
          <h2 className="text-[18px] font-extrabold text-ink">자산 항목 히트맵</h2>
          <span className="text-[13px] text-ink-muted">큰 칸일수록 비중이 크고, 색으로 수익·손실을 보여줘요</span>
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
            content={<HeatmapCell onSelect={toggle} selectable={selectable} />}
            isAnimationActive={false}
          />
        </ResponsiveContainer>
      )}
      {groups.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from(groups.entries()).map(([name, accounts]) => (
            <button
              key={name}
              type="button"
              aria-expanded={selected === name}
              onClick={() => toggle(name)}
              className={`rounded-r2 px-3 py-1.5 text-[12px] font-semibold ${selected === name ? "bg-bg-brand-weak text-fg-brand" : "bg-bg-neutral-weak text-ink-muted hover:text-ink"}`}
            >
              {name} 계좌 {accounts.length}개 {selected === name ? "접기" : "보기"}
            </button>
          ))}
        </div>
      )}
      {selected && selectedAccounts.length > 0 && (
        <ul className="mt-3 divide-y divide-hairline2 rounded-r3 bg-bg-neutral-weak px-4 text-[13px]">
          {selectedAccounts.map((account) => (
            <li key={account.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate text-ink">
                <span className="mr-2 font-semibold text-ink-muted">{account.personLabel}</span>
                {account.productName}
              </span>
              <span className="shrink-0 font-bold tabular-nums text-ink">
                {formatManwon(account.amount)}
                {account.ratePct !== null && <span className="ml-1.5 text-[11px] font-medium text-ink-muted">연 {account.ratePct}%</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardCharts({
  assetComposition,
  treemapData,
  sectorComposition,
  cashAccounts = [],
}: {
  assetComposition: CategoryDatum[];
  treemapData: TreemapDatum[];
  sectorComposition: CategoryDatum[];
  cashAccounts?: CashAccount[];
}) {
  return (
    <div className="mt-3 flex flex-col gap-3">
      <AllocationCharts assetComposition={assetComposition} sectorComposition={sectorComposition} />
      <HeatmapCard data={treemapData} cashAccounts={cashAccounts} />
    </div>
  );
}
