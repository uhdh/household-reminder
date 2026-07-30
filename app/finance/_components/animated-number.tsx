"use client";

import { useEffect, useRef, useState } from "react";
import { formatKRW } from "@/lib/finance-format";

type NumberFormat = "krw" | "signedKrw" | "signedPct";

function formatValue(n: number, format: NumberFormat): string {
  switch (format) {
    case "signedKrw":
      return `${n >= 0 ? "+" : ""}${formatKRW(n)}`;
    case "signedPct":
      return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
    default:
      return formatKRW(n);
  }
}

export function AnimatedNumber({
  value,
  format = "krw",
}: {
  value: number;
  format?: NumberFormat;
}) {
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevValue.current = value;
      return;
    }
    const start = prevValue.current;
    const end = value;
    const duration = 600;
    const startTime = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (end - start) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevValue.current = end;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="tabular-nums">{formatValue(display, format)}</span>;
}
