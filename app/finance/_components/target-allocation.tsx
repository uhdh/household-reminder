import { formatKRW } from "@/lib/finance-format";
import { updateAllocationTargetsAction } from "./allocation-actions";

type AllocationRow = {
  category: string;
  fill: string;
  currentPct: number;
  targetPct: number;
};

function AllocationTargetRow({ row, totalAsset }: { row: AllocationRow; totalAsset: number }) {
  const deltaPct = row.currentPct - row.targetPct;
  const rebalanceAmount = (totalAsset * (row.targetPct - row.currentPct)) / 100;
  const barPct = Math.min(100, Math.max(0, row.currentPct));
  const tickPct = Math.min(99, Math.max(0, row.targetPct));

  return (
    <div className="border-b-[0.8px] border-hairline py-2.5 last:border-0">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink">
          <span className="h-2 w-2 shrink-0" style={{ backgroundColor: row.fill }} />
          <span className="truncate">{row.category}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-ink-muted">
          {row.currentPct.toFixed(0)}%<span>/</span>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            name={`target:${row.category}`}
            defaultValue={row.targetPct.toFixed(1)}
            className="w-14 border border-hairline2 bg-canvas px-1 py-0.5 text-right text-ink outline-none focus:border-legend1"
          />
          <span>%</span>
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden bg-hairline">
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${barPct}%`, backgroundColor: row.fill }}
        />
        <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${tickPct}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-ink-muted">
        <span>
          {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(1)}%p
        </span>
        <span className="text-ink">
          {rebalanceAmount >= 0 ? "▲" : "▼"} {formatKRW(Math.abs(rebalanceAmount))}
        </span>
      </div>
    </div>
  );
}

export function TargetAllocationCard({
  rows,
  totalAsset,
  personFilter,
}: {
  rows: AllocationRow[];
  totalAsset: number;
  personFilter: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="border-[0.8px] border-hairline bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">목표 배분 · 리밸런싱</h2>
        <span className="text-[11px] text-ink-muted">현재% / 목표%</span>
      </div>
      <p className="mb-2 text-[11px] text-ink-muted">
        막대 = 현재 비중, 눈금 = 목표 비중. 목표 %를 수정하고 저장하면 리밸런싱에 필요한 금액이 계산됩니다.
      </p>
      <form action={updateAllocationTargetsAction}>
        <input type="hidden" name="person" value={personFilter} />
        <div>
          {rows.map((row) => (
            <AllocationTargetRow key={row.category} row={row} totalAsset={totalAsset} />
          ))}
        </div>
        <button
          type="submit"
          className="mt-3 w-full bg-legend1 px-3 py-2 text-[12px] font-medium text-canvas transition-opacity hover:opacity-90 sm:w-auto"
        >
          목표 저장
        </button>
      </form>
    </div>
  );
}
