import { formatKRW } from "@/lib/finance-format";
import { AnimatedNumber } from "./animated-number";

export function SummaryCard({
  label,
  value,
  breakdown = [],
  format = "krw",
  variant = "hero",
}: {
  label: string;
  value: number;
  breakdown?: { label: string; value: number }[];
  format?: "krw" | "compactKrw" | "signedPct";
  variant?: "hero" | "detail";
}) {
  const isHero = variant === "hero";
  const breakdownText = breakdown
    .map((b) => `${b.label} ${format === "signedPct" ? `${b.value.toFixed(1)}%` : formatKRW(b.value)}`)
    .join(" · ");

  return (
    <div className="seed-card px-4 py-3 shadow-none">
      <p className="mb-1 text-[12px] font-semibold text-ink-muted">{label}</p>
      <p
        title={format === "signedPct" ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : formatKRW(value)}
        className={
          isHero
            ? "text-[22px] font-bold tabular-nums text-ink sm:text-[24px]"
            : "text-[14px] font-semibold tabular-nums text-ink-muted"
        }
      >
        <AnimatedNumber value={value} format={format} />
      </p>
      {breakdown.length > 0 && (
        <p className={isHero ? "mt-1 text-[11px] text-ink-muted" : "mt-0.5 text-[10px] text-ink-muted"}>
          {breakdownText}
        </p>
      )}
    </div>
  );
}
