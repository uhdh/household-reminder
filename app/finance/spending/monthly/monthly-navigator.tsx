"use client";

import { useRouter } from "next/navigation";
import type { PersonId } from "@/lib/spending-queries";

export function MonthlyNavigator({ month, personFilter }: { month: string; personFilter: "all" | PersonId }) {
  const router = useRouter();

  return (
    <input
      aria-label="조회 월 선택"
      type="month"
      value={month}
      onChange={(event) => {
        const nextMonth = event.currentTarget.value;
        if (!nextMonth) return;
        const params = new URLSearchParams({ month: nextMonth });
        if (personFilter !== "all") params.set("person", personFilter);
        router.push(`/finance/spending/monthly?${params.toString()}`);
      }}
      className="h-8 rounded-r2 border-[0.8px] border-hairline bg-card px-2 text-[14px] font-semibold text-ink outline-none focus:border-stroke-brand"
    />
  );
}
