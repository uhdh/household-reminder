import type { ButtonHTMLAttributes, ReactNode } from "react";

type ItemGridProps = { children: ReactNode; className?: string };

type ItemTileProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: string;
  name: string;
  daysRemaining: number;
  percent: number;
  overdue: boolean;
  selectionMode?: boolean;
  selected?: boolean;
};

function dayLabel(daysRemaining: number) {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

function progressColor(percent: number, overdue: boolean) {
  if (overdue || percent >= 100) return "var(--seed-color-bg-critical-solid)";
  if (percent >= 70) return "var(--seed-color-bg-warning-solid)";
  return "var(--seed-color-bg-positive-solid)";
}

export function ItemGrid({ children, className = "" }: ItemGridProps) {
  return (
    <section className={`seed-card p-2 ${className}`.trim()}>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">{children}</ul>
    </section>
  );
}

export function ItemTile({ icon, name, daysRemaining, percent, overdue, selectionMode = false, selected = false, className = "", ...buttonProps }: ItemTileProps) {
  const normalizedPercent = Math.min(100, Math.max(0, percent));

  return (
    <button type="button" className={`relative flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-r3 border border-stroke-neutral-subtle bg-bg-neutral-weak p-2 text-fg-neutral transition-colors hover:bg-bg-neutral-weak-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-brand-solid ${className}`.trim()} {...buttonProps}>
      {selectionMode && (
        <span aria-hidden="true" className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold ${selected ? "border-stroke-brand-solid bg-bg-brand-solid text-fg-neutral-inverted" : "border-stroke-neutral-weak bg-bg-layer-default"}`}>
          {selected ? "✓" : ""}
        </span>
      )}
      {overdue && <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-bg-critical-solid text-xs font-bold text-fg-neutral-inverted">!</span>}
      <span className="text-2xl" aria-hidden="true">{icon}</span>
      <span className="max-w-full truncate text-xs font-semibold">{name}</span>
      <span className="flex w-full items-center gap-1">
        <span className="shrink-0 text-[9px] text-fg-neutral-subtle">{dayLabel(daysRemaining)}</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-neutral-weak-pressed">
          <span className="block h-full rounded-full transition-[width]" style={{ width: `${normalizedPercent}%`, backgroundColor: progressColor(percent, overdue) }} />
        </span>
      </span>
    </button>
  );
}
