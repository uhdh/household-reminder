"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconCalendarLine, IconChevronLeftLine, IconChevronRightLine } from "@karrotmarket/react-monochrome-icon";
import type { PersonId } from "@/lib/spending-queries";

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

export function MonthlyNavigator({
  month,
  personFilter,
  basePath = "/finance/spending/monthly",
  extraParams = {},
}: {
  month: string;
  personFilter: "all" | PersonId;
  basePath?: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();
  const [selectedYear, selectedMonth] = month.split("-").map(Number);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selectedYear);

  const go = (nextYear: number, nextMonth: number) => {
    const params = new URLSearchParams({ month: `${nextYear}-${String(nextMonth).padStart(2, "0")}`, ...extraParams });
    if (personFilter !== "all") params.set("person", personFilter);
    setOpen(false);
    router.push(`${basePath}?${params.toString()}`);
  };

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="조회 월 선택"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setYear(selectedYear);
          setOpen((value) => !value);
        }}
        className="flex h-11 items-center gap-2 rounded-r3 bg-bg-neutral-weak px-4 text-[14px] font-bold text-ink transition-colors hover:bg-bg-neutral-weak-pressed"
      >
        <IconCalendarLine size={18} aria-hidden="true" />
        {selectedYear}년 {selectedMonth}월
      </button>

      {open && (
        <>
          <button type="button" aria-label="월 선택 닫기" tabIndex={-1} onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div
            role="dialog"
            aria-label="월 선택"
            className="absolute left-0 top-[calc(100%+8px)] z-20 w-72 rounded-r4 border border-stroke-neutral-muted bg-bg-layer-floating p-4 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="이전 해"
                onClick={() => setYear((value) => value - 1)}
                className="flex size-10 items-center justify-center rounded-r2 text-ink hover:bg-bg-neutral-weak"
              >
                <IconChevronLeftLine size={18} aria-hidden="true" />
              </button>
              <span className="text-[16px] font-extrabold text-ink">{year}년</span>
              <button
                type="button"
                aria-label="다음 해"
                onClick={() => setYear((value) => value + 1)}
                className="flex size-10 items-center justify-center rounded-r2 text-ink hover:bg-bg-neutral-weak"
              >
                <IconChevronRightLine size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((value) => {
                const active = year === selectedYear && value === selectedMonth;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-current={active ? "date" : undefined}
                    onClick={() => go(year, value)}
                    className={`h-11 rounded-r3 text-[14px] transition-colors ${
                      active ? "bg-bg-brand-solid font-extrabold text-fg-neutral-inverted" : "font-medium text-ink hover:bg-bg-neutral-weak"
                    }`}
                  >
                    {value}월
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
