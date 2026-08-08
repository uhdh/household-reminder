import type { ReactNode } from "react";

type StatusTone = "brand" | "critical" | "neutral" | "positive" | "warning";

const toneStyles: Record<StatusTone, string> = {
  brand: "bg-bg-brand-weak text-fg-brand",
  critical: "bg-bg-critical-solid text-fg-neutral-inverted",
  neutral: "bg-bg-neutral-weak text-fg-neutral-muted",
  positive: "bg-bg-positive-weak text-fg-positive",
  warning: "bg-bg-warning-weak text-fg-warning",
};

export function StatusBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 t3-bold ${toneStyles[tone]} ${className}`}>
      {children}
    </span>
  );
}

