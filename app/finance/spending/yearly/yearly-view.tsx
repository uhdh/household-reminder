"use client";

import { useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type YearlyDatum = {
  month: string;
  income: number;
  expense: number;
  fixedExpense: number;
  variableExpense: number;
  savingsRate: number | null;
  [key: string]: string | number | null;
};

type CategorySeries = { name: string; dataKey: string; sourceNames: string[] };

const CATEGORY_COLORS = [
  "#2E7DD7", "#F36B2A", "#17A875", "#F2A900", "#DD6B9A", "#7357D6", "#0284C7", "#A16207",
];

const formatManwonLabel = (value: unknown) => {
  const amount = Number(value);
  return amount > 0 ? `${amount.toLocaleString("ko-KR")}만` : "";
};

/** 스택 안에 넣기엔 너무 작은 값은 겹쳐 보여서 라벨을 생략한다. */
const formatInsideLabel = (value: unknown) => {
  const amount = Number(value);
  return amount >= 10 ? `${amount.toLocaleString("ko-KR")}` : "";
};

/** 범례를 막대 쌓기 순서(=색상 배정 순서)와 똑같이 정렬해서, 그래프 색과 범례 순서가 어긋나지 않게 한다. */
function legendItemSorter(series: CategorySeries[]) {
  const order = new Map(series.map((category, index) => [category.dataKey, index]));
  return (item: { dataKey?: unknown }) => order.get(item.dataKey as string) ?? series.length;
}

const formatRateLabel = (value: unknown) => {
  const rate = Number(value);
  return Number.isFinite(rate) ? `${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%` : "";
};

const tooltipStyle = {
  backgroundColor: "var(--seed-color-bg-layer-floating)",
  border: "1px solid var(--seed-color-stroke-neutral-muted)",
  borderRadius: 10,
  color: "var(--seed-color-fg-neutral)",
  fontSize: 12,
};

export function YearlyView({
  data,
  fixedCategories,
  variableCategories,
  annualCategory,
  children,
}: {
  data: YearlyDatum[];
  fixedCategories: CategorySeries[];
  variableCategories: CategorySeries[];
  annualCategory: { name: string; values: number[] } | null;
  children: ReactNode;
}) {
  const [view, setView] = useState<"table" | "chart">("chart");
  const fixedTotal = data.reduce((sum, item) => sum + item.fixedExpense, 0);
  const variableTotal = data.reduce((sum, item) => sum + item.variableExpense, 0);
  const expenseTotal = fixedTotal + variableTotal;
  const variableRatio = expenseTotal > 0 ? (variableTotal / expenseTotal) * 100 : 0;
  const incomeTotal = data.reduce((sum, item) => sum + item.income, 0);
  const savingsRate = incomeTotal > 0 ? ((incomeTotal - expenseTotal) / incomeTotal) * 100 : 0;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-bg-neutral-weak p-1" aria-label="연간 내역 보기 방식">
          {(["chart", "table"] as const).map((value) => (
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
        <div className="seed-card px-3 py-5 shadow-none sm:p-7">
          <div className="mb-4">
            <h2 className="text-[18px] font-extrabold text-ink">월별 수입 · 지출</h2>
            <p className="mt-1 text-[12px] text-ink-muted">월별 흐름을 비교해 지출이 커진 시점을 확인하세요.</p>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 30, right: 18, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis yAxisId="amount" axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis yAxisId="rate" orientation="right" axisLine={false} tickLine={false} width={42} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [String(name) === "저축률" ? `${Number(value).toFixed(1)}%` : `${Number(value).toLocaleString("ko-KR")}만원`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Bar yAxisId="amount" dataKey="income" name="수입" fill="var(--seed-color-bg-informative-solid)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="income" position="top" formatter={formatManwonLabel} className="fill-ink-muted" fontSize={10} />
                </Bar>
                <Bar yAxisId="amount" dataKey="expense" name="지출" fill="var(--seed-color-bg-brand-solid)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="expense" position="top" formatter={formatManwonLabel} className="fill-fg-brand" fontSize={10} />
                </Bar>
                <Line yAxisId="rate" type="monotone" dataKey="savingsRate" name="저축률" stroke="var(--seed-color-fg-positive)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--seed-color-fg-positive)" }} activeDot={{ r: 5 }} label={{ position: "top", offset: 14, formatter: formatRateLabel, fill: "var(--seed-color-fg-positive)", fontSize: 10 }} connectNulls />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="seed-card p-5 shadow-none">
            <p className="text-[13px] font-medium text-ink-muted">연간 고정비</p>
            <p className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] tabular-nums text-ink">{fixedTotal.toLocaleString("ko-KR")}만원</p>
          </div>
          <div className="seed-card p-5 shadow-none">
            <p className="text-[13px] font-medium text-ink-muted">연간 변동비</p>
            <p className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] tabular-nums text-ink">{variableTotal.toLocaleString("ko-KR")}만원</p>
          </div>
          <div className="seed-card p-5 shadow-none">
            <p className="text-[11px] font-semibold text-ink-muted">변동비 비중</p>
            <p className="mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] tabular-nums text-ink">{variableRatio.toFixed(1)}%</p>
          </div>
          <div className="seed-card p-5 shadow-none">
            <p className="text-[13px] font-medium text-ink-muted">연간 저축률</p>
            <p className={`mt-1.5 text-[26px] font-extrabold tracking-[-0.02em] tabular-nums ${savingsRate >= 0 ? "text-fg-positive" : "text-fg-critical"}`}>
              {savingsRate >= 0 ? "+" : ""}{savingsRate.toFixed(1)}%
            </p>
          </div>
        </div>
        <div className="seed-card px-3 py-5 shadow-none sm:p-7">
          <div className="mb-4">
            <h2 className="text-[18px] font-extrabold text-ink">월별 고정비 카테고리</h2>
            <p className="mt-1 text-[12px] text-ink-muted">월별 고정비를 카테고리별로 비교합니다.</p>
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
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} itemSorter={legendItemSorter(fixedCategories)} />
                {fixedCategories.map((category, index) => (
                  <Bar key={category.dataKey} dataKey={category.dataKey} name={category.name} stackId="fixed" fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} radius={index === fixedCategories.length - 1 ? [4, 4, 0, 0] : undefined}>
                    <LabelList dataKey={category.dataKey} position="inside" formatter={formatInsideLabel} fill="#fff" fontSize={10} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="seed-card px-3 py-5 shadow-none sm:p-7">
          <div className="mb-4">
            <h2 className="text-[18px] font-extrabold text-ink">월별 변동비 카테고리</h2>
            <p className="mt-1 text-[12px] text-ink-muted">월별 변동비를 카테고리별로 비교합니다.</p>
          </div>
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis axisLine={false} tickLine={false} width={52} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toLocaleString("ko-KR")}만원`]} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} itemSorter={legendItemSorter(variableCategories)} />
                {variableCategories.map((category, index) => (
                  <Bar key={category.dataKey} dataKey={category.dataKey} name={category.name} stackId="variable" fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} radius={index === variableCategories.length - 1 ? [4, 4, 0, 0] : undefined}>
                    <LabelList dataKey={category.dataKey} position="inside" formatter={formatInsideLabel} fill="#fff" fontSize={10} />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        {annualCategory && (
          <div className="overflow-x-auto seed-card px-3 py-5 shadow-none sm:p-7">
            <div className="mb-3">
              <h2 className="text-[14px] font-semibold text-ink">{annualCategory.name}</h2>
              <p className="mt-1 text-[12px] text-ink-muted">한 달에 몰려서 매달 비교를 방해하기 때문에 그래프에서 빼고 표로만 보여줍니다.</p>
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline2 text-left text-ink-muted">
                  <th className="whitespace-nowrap py-1.5 pr-3 text-[11px] font-semibold">합계</th>
                  {data.map((d) => (
                    <th key={d.month} className="whitespace-nowrap px-2 py-1.5 text-right text-[11px] font-semibold">{d.month}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="whitespace-nowrap py-1.5 pr-3 font-semibold tabular-nums text-ink">
                    {annualCategory.values.reduce((sum, v) => sum + v, 0).toLocaleString("ko-KR")}만원
                  </td>
                  {annualCategory.values.map((v, i) => (
                    <td key={i} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-ink-muted">
                      {v > 0 ? `${v.toLocaleString("ko-KR")}만` : "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        </div>
      )}
    </section>
  );
}
