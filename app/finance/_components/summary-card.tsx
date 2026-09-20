import { formatKRW, formatManwon } from "@/lib/finance-format";
import { AnimatedNumber } from "./animated-number";

export function SummaryCard({
  label,
  value,
  breakdown = [],
  format = "krw",
  variant = "hero",
  className = "",
}: {
  label: string;
  value: number;
  breakdown?: { label: string; value: number }[];
  format?: "krw" | "compactKrw" | "manwon" | "signedPct";
  variant?: "feature" | "hero" | "detail";
  className?: string;
}) {
  const isFeature = variant === "feature";
  const isHero = variant === "hero";
  const breakdownText = breakdown
    .map((b) => `${b.label} ${format === "signedPct" ? `${b.value.toFixed(1)}%` : format === "manwon" ? formatManwon(b.value) : formatKRW(b.value)}`)
    .join(" · ");

  return (
    <div className={`seed-card shadow-none ${isFeature ? "flex flex-col justify-center px-6 py-6 sm:px-8 sm:py-8" : "px-5 py-4"} ${className}`}>
      <p className={isFeature ? "mb-2 text-[15px] font-medium text-ink-muted" : "mb-1.5 text-[13px] font-medium text-ink-muted"}>{label}</p>
      <p
        title={format === "signedPct" ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : format === "manwon" ? formatManwon(value) : formatKRW(value)}
        className={
          isFeature
            ? "text-[36px] font-extrabold leading-tight tracking-[-0.03em] tabular-nums text-ink sm:text-[46px]"
            : isHero
              ? "whitespace-nowrap text-[19px] font-extrabold tracking-[-0.02em] tabular-nums text-ink min-[420px]:text-[24px] sm:text-[28px]"
              : "text-[14px] font-semibold tabular-nums text-ink-muted"
        }
      >
        <AnimatedNumber value={value} format={format} />
      </p>
      {breakdown.length > 0 && (
        <p className={isFeature ? "mt-2 text-[14px] text-ink-muted" : isHero ? "mt-1 text-[12px] text-ink-muted" : "mt-0.5 text-[10px] text-ink-muted"}>
          {breakdownText}
        </p>
      )}
    </div>
  );
}
