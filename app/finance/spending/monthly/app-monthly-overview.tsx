"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAppExperience } from "@/app/app-experience";
import { formatKRW } from "@/lib/finance-format";

export function MonthlyAnalysis({ children }: { children: ReactNode }) {
  const isApp = useAppExperience();
  const [expanded, setExpanded] = useState(false);
  if (!isApp) return <>{children}</>;
  return (
    <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary className="seed-card mb-4 cursor-pointer p-4 font-semibold">월별 상세 분석 보기</summary>
      {expanded && children}
    </details>
  );
}

export function AppMonthlyOverview({ month, totalExpense, budgetRemaining, recent, readOnly, personFilter = "all" }: {
  month: string;
  totalExpense: number;
  budgetRemaining: number | null;
  recent: { id: string; date: string; description: string; amount: number | null }[];
  readOnly: boolean;
  personFilter?: string;
}) {
  const isApp = useAppExperience();
  if (!isApp) return null;
  const query = new URLSearchParams({ month, ...(personFilter !== "all" ? { person: personFilter } : {}) });
  const detailsHref = `/finance/spending?${query}`;

  return (
    <section className="seed-card mb-4 p-5" aria-label="가계부 빠른 확인">
      <p className="text-sm text-ink-muted">{month.replace("-", "년 ")}월 지출</p>
      <p className="mb-5 mt-1 text-3xl font-extrabold tabular-nums">{formatKRW(totalExpense)}</p>
      {!readOnly && <div className="mb-5 grid grid-cols-2 gap-3">
        <Link href={`${detailsHref}&manual=1#manual-entry`} className="seed-button seed-button-primary min-h-11">내역 입력</Link>
        <Link href="/finance/upload" className="seed-button seed-button-secondary min-h-11">자료 가져오기</Link>
      </div>}
      <p className="text-sm text-ink-muted">{month.replace("-", "년 ")}월 · 가구 전체 예산</p>
      <p className="mt-1 text-xl font-bold">
        {budgetRemaining === null ? "예산을 설정해보세요" : budgetRemaining >= 0 ? `${formatKRW(budgetRemaining)} 남았어요` : `${formatKRW(-budgetRemaining)} 초과했어요`}
      </p>
      {budgetRemaining === null && !readOnly && <Link href="/finance/spending/settings?tab=categories" className="mt-2 inline-block text-sm font-semibold text-fg-brand">예산 설정하기</Link>}
      <div className="mb-2 mt-6 flex items-center justify-between">
        <h2 className="font-bold">최근 내역</h2>
        <Link href={detailsHref} className="py-2 text-sm font-semibold text-fg-brand">전체 보기</Link>
      </div>
      {recent.length ? <ul className="divide-y divide-stroke-neutral-muted">
        {recent.map((transaction) => <li key={transaction.id} className="flex items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{transaction.description}</p>
            <p className="mt-1 text-xs text-ink-muted">{transaction.date.slice(5).replace("-", "/")}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{transaction.amount === null ? "비공개" : `${transaction.amount > 0 ? "+" : ""}${formatKRW(transaction.amount)}`}</span>
        </li>)}
      </ul> : <p className="py-3 text-sm text-ink-muted">이 달에는 기록이 없어요.</p>}
    </section>
  );
}
