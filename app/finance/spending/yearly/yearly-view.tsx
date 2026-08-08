"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type YearlyDatum = {
  month: string;
  income: number;
  expense: number;
  fixedExpense: number;
  variableExpense: number;
};

const tooltipStyle = {
  backgroundColor: "#FFFFFF",
  border: "1px solid #E1E0D9",
  borderRadius: 8,
  color: "#0B0B0B",
  fontSize: 12,
};

export function YearlyView({ data, children }: { data: YearlyDatum[]; children: ReactNode }) {
  const [view, setView] = useState<"table" | "chart">("table");
  const fixedTotal = data.reduce((sum, item) => sum + item.fixedExpense, 0);
  const variableTotal = data.reduce((sum, item) => sum + item.variableExpense, 0);
  const expenseTotal = fixedTotal + variableTotal;
  const variableRatio = expenseTotal > 0 ? (variableTotal / expenseTotal) * 100 : 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-bg-neutral-weak p-1" aria-label="연지출 보기 방식">
          {(["table", "chart"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                view === value ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink"
              }`}
            >
              {value === "table" ? "표" : "그래프"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-ink-muted">단위: 만원</span>
      </div>

      {view === "table" ? (
        children
      ) : (
        <div className="space-y-4">
        <div className="border-[0.8px] border-hairline bg-card px-2 py-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-[14px] font-semibold text-ink">월별 수입 · 지출</h2>
            <p className="mt-1 text-[12px] text-ink-muted">월별 흐름을 비교해 지출이 커진 시점을 확인하세요.</p>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${Number(value).toLocaleString("ko-KR")}만원`]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="income" name="수입" fill="var(--seed-color-bg-brand-solid)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="지출" fill="var(--seed-color-bg-critical-solid)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="seed-card p-4 shadow-none">
            <p className="text-[11px] font-semibold text-ink-muted">연간 고정비</p>
            <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">{fixedTotal.toLocaleString("ko-KR")}만원</p>
          </div>
          <div className="seed-card p-4 shadow-none">
            <p className="text-[11px] font-semibold text-ink-muted">연간 변동비</p>
            <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">{variableTotal.toLocaleString("ko-KR")}만원</p>
          </div>
          <div className="seed-card p-4 shadow-none">
            <p className="text-[11px] font-semibold text-ink-muted">변동비 비중</p>
            <p className="mt-1 text-[20px] font-bold tabular-nums text-ink">{variableRatio.toFixed(1)}%</p>
          </div>
        </div>
        <div className="border-[0.8px] border-hairline bg-card px-2 py-4 sm:p-5">
          <div className="mb-4">
            <h2 className="text-[14px] font-semibold text-ink">월별 고정비 · 변동비</h2>
            <p className="mt-1 text-[12px] text-ink-muted">막대 전체는 월 지출이며, 색상별 영역은 지출 구조를 나타냅니다.</p>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${Number(value).toLocaleString("ko-KR")}만원`]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar dataKey="fixedExpense" name="고정비" stackId="expense" fill="var(--seed-color-palette-blue-500)" />
                <Bar dataKey="variableExpense" name="변동비" stackId="expense" fill="var(--seed-color-bg-brand-solid)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </div>
      )}
    </section>
  );
}
