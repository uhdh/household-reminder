"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { projectNetWorth, yearsToReach } from "@/lib/projection";

const MILESTONES = [10, 20, 30];
const HORIZON = 30;
const SCENARIOS = [
  { label: "안정형", returnPct: 3 },
  { label: "균형형", returnPct: 5 },
  { label: "공격형", returnPct: 7 },
];

/** 12억 3,400만원 / 5,600만원 / -1,200만원 */
function formatEok(won: number): string {
  const man = Math.round(won / 10_000);
  const sign = man < 0 ? "-" : "";
  const abs = Math.abs(man);
  const eok = Math.floor(abs / 10_000);
  const rest = abs % 10_000;
  if (eok === 0) return `${sign}${rest.toLocaleString("ko-KR")}만원`;
  return `${sign}${eok.toLocaleString("ko-KR")}억${rest ? ` ${rest.toLocaleString("ko-KR")}만` : ""}원`;
}

function axisEok(won: number): string {
  const eok = won / 100_000_000;
  return Math.abs(eok) >= 1 ? `${Number(eok.toFixed(1))}억` : `${Math.round(won / 10_000).toLocaleString("ko-KR")}만`;
}

type Assumptions = { savingMan: number; savingGrowthPct: number; returnPct: number; inflationPct: number; goalEok: number; realView: boolean };

function NumberField({ label, suffix, value, step, onChange, hint }: { label: string; suffix: string; value: number; step: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-[11px] text-ink-muted">{hint}</span>}
      <span className="mt-1.5 flex items-center gap-2 rounded-r2 border border-stroke-neutral-subtle bg-bg-layer-default px-3 focus-within:border-stroke-brand-solid">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="h-10 min-w-0 flex-1 bg-transparent text-right text-[15px] font-bold tabular-nums text-ink outline-none"
        />
        <span className="shrink-0 text-[13px] text-ink-muted">{suffix}</span>
      </span>
    </label>
  );
}

export function PlanView({ netWorth, annualIncome, annualExpense, monthCount }: { netWorth: number; annualIncome: number; annualExpense: number; monthCount: number }) {
  const measuredSaving = annualIncome - annualExpense;
  const defaults: Assumptions = {
    savingMan: Math.max(0, Math.round(measuredSaving / 10_000)),
    savingGrowthPct: 3,
    returnPct: 5,
    inflationPct: 2.5,
    goalEok: 10,
    realView: true,
  };
  const [a, setA] = useState<Assumptions>(defaults);
  const set = <K extends keyof Assumptions>(key: K, value: Assumptions[K]) => setA((prev) => ({ ...prev, [key]: value }));

  const { points, low, high } = useMemo(() => {
    const base = { start: netWorth, annualSaving: a.savingMan * 10_000, savingGrowthPct: a.savingGrowthPct, inflationPct: a.inflationPct, years: HORIZON };
    return {
      points: projectNetWorth({ ...base, returnPct: a.returnPct }),
      low: projectNetWorth({ ...base, returnPct: a.returnPct - 2 }),
      high: projectNetWorth({ ...base, returnPct: a.returnPct + 2 }),
    };
  }, [netWorth, a.savingMan, a.savingGrowthPct, a.inflationPct, a.returnPct]);

  const pick = (p: { nominal: number; real: number }) => (a.realView ? p.real : p.nominal);
  const deflate = (won: number, year: number) => (a.realView ? won / (1 + a.inflationPct / 100) ** year : won);
  const thisYear = new Date().getFullYear();
  const chartData = points.map((p, i) => ({
    label: `${thisYear + p.year}`,
    expected: Math.round(pick(p)),
    principal: Math.round(deflate(p.principal, p.year)),
    range: [Math.round(pick(low[i])), Math.round(pick(high[i]))] as [number, number],
  }));
  const goal = a.goalEok * 100_000_000;
  const goalYear = goal > 0 ? yearsToReach(points, goal) : null;
  const savingRate = annualIncome > 0 ? (measuredSaving / annualIncome) * 100 : null;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">미래 계획</h1>
        <p className="mt-1 text-[14px] text-ink-muted">지금 자산과 1년 저축 흐름으로 10·20·30년 뒤 자산을 그려봐요.</p>
      </div>

      <section className="seed-card mb-4 p-4 shadow-none sm:p-5" aria-label="출발점">
        <div className="grid grid-cols-3 divide-x-[0.8px] divide-hairline">
          {[
            { label: "지금 순자산", value: formatEok(netWorth), tone: "text-ink" },
            { label: "1년 저축", value: formatEok(measuredSaving), tone: measuredSaving < 0 ? "text-fg-critical" : "text-ink" },
            { label: "저축률", value: savingRate === null ? "-" : `${savingRate.toFixed(0)}%`, tone: "text-ink" },
          ].map((s) => (
            <div key={s.label} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-5">
              <p className="text-[12px] text-ink-muted sm:text-[13px]">{s.label}</p>
              <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums sm:text-[22px] ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t-[0.8px] border-hairline pt-2.5 text-[12px] text-ink-muted">
          {monthCount > 0
            ? `최근 ${monthCount}개월 수입 ${formatEok(annualIncome)} - 지출 ${formatEok(annualExpense)}${monthCount < 12 ? "(1년으로 환산)" : ""} 기준이에요. 순자산은 자산관리 화면과 같아요.`
            : "아직 거래 내역이 없어서 연 저축액을 직접 넣어 주세요."}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <section className="seed-card order-2 flex flex-col gap-4 p-5 shadow-none lg:order-1" aria-labelledby="plan-assumptions">
          <h2 id="plan-assumptions" className="text-[16px] font-extrabold text-ink">이렇게 가정할게요</h2>
          <NumberField label="연 저축액" hint="실제 기록에서 가져옴" suffix="만원" step={100} value={a.savingMan} onChange={(v) => set("savingMan", v)} />
          <NumberField label="저축액 증가율" hint="연봉 인상 등" suffix="%/년" step={0.5} value={a.savingGrowthPct} onChange={(v) => set("savingGrowthPct", v)} />
          <div>
            <p className="text-[13px] font-semibold text-ink">투자 성향</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => set("returnPct", s.returnPct)}
                  aria-pressed={a.returnPct === s.returnPct}
                  className={`rounded-r2 px-2 py-2 text-center ${a.returnPct === s.returnPct ? "bg-bg-brand-weak text-fg-brand" : "bg-bg-neutral-weak text-ink-muted hover:text-ink"}`}
                >
                  <span className="block text-[13px] font-bold">{s.label}</span>
                  <span className="block text-[11px]">연 {s.returnPct}%</span>
                </button>
              ))}
            </div>
          </div>
          <NumberField label="기대 수익률" hint="직접 입력" suffix="%/년" step={0.5} value={a.returnPct} onChange={(v) => set("returnPct", v)} />
          <NumberField label="물가상승률" suffix="%/년" step={0.5} value={a.inflationPct} onChange={(v) => set("inflationPct", v)} />
          <NumberField label="목표 자산" hint="지금 돈 가치 기준" suffix="억원" step={1} value={a.goalEok} onChange={(v) => set("goalEok", v)} />
          <button type="button" onClick={() => setA(defaults)} className="self-start text-[12px] font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline">
            처음 값으로 되돌리기
          </button>
        </section>

        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MILESTONES.map((y) => {
              const value = pick(points[y]);
              const principal = deflate(points[y].principal, y);
              return (
                <div key={y} className="seed-card p-5 shadow-none">
                  <p className="text-[13px] font-semibold text-ink-muted">
                    {y}년 뒤 <span className="font-normal">· {thisYear + y}년</span>
                  </p>
                  <p className="mt-1 text-[22px] font-extrabold tabular-nums text-ink">{formatEok(value)}</p>
                  <dl className="mt-2 space-y-0.5 text-[12px]">
                    <div className="flex justify-between gap-2"><dt className="text-ink-muted">넣은 돈</dt><dd className="tabular-nums text-ink">{formatEok(principal)}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-ink-muted">불어난 돈</dt><dd className="font-semibold tabular-nums text-fg-positive">{formatEok(value - principal)}</dd></div>
                  </dl>
                  <p className="mt-2 border-t-[0.8px] border-hairline pt-2 text-[11px] text-ink-muted">
                    수익률 ±2%면 {formatEok(pick(low[y]))} ~ {formatEok(pick(high[y]))}
                  </p>
                </div>
              );
            })}
          </div>

          {goal > 0 && (
            <div className="rounded-r3 bg-bg-brand-weak px-4 py-3 text-[14px] text-ink">
              {goalYear === null ? (
                <>이대로면 30년 안에 목표 <b>{a.goalEok}억</b>에 닿지 못해요. 저축액이나 수익률을 조금 올려 보세요.</>
              ) : goalYear === 0 ? (
                <>이미 목표 <b>{a.goalEok}억</b>을 넘었어요.</>
              ) : (
                <>목표 <b>{a.goalEok}억</b>은 <b>{goalYear}년 뒤({thisYear + goalYear}년)</b>에 닿을 것으로 보여요.</>
              )}
            </div>
          )}

          <section className="seed-card p-5 shadow-none sm:p-6" aria-labelledby="plan-chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-chart" className="text-[16px] font-extrabold text-ink">30년 자산 흐름</h2>
              <div className="inline-flex rounded-r2 bg-bg-neutral-weak p-0.5 text-[12px] font-semibold">
                {[
                  { real: true, label: "지금 돈 가치" },
                  { real: false, label: "그때 금액" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={a.realView === o.real}
                    onClick={() => set("realView", o.real)}
                    className={`rounded-r2 px-2.5 py-1 ${a.realView === o.real ? "bg-bg-layer-default text-ink" : "text-ink-muted"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="label" interval={4} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <YAxis tickFormatter={axisEok} axisLine={false} tickLine={false} width={48} tick={{ fontSize: 11, fill: "var(--finance-ink-muted)" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--seed-color-bg-layer-floating)", border: "1px solid var(--seed-color-stroke-neutral-muted)", borderRadius: 10, fontSize: 12 }}
                  formatter={(value, name) => [Array.isArray(value) ? `${formatEok(Number(value[0]))} ~ ${formatEok(Number(value[1]))}` : formatEok(Number(value)), name]}
                  labelFormatter={(label) => `${label}년`}
                />
                <Area dataKey="range" name="범위(수익률 ±2%)" stroke="none" fill="#2fbf8a" fillOpacity={0.15} isAnimationActive={false} />
                <Area dataKey="expected" name="예상 자산" stroke="#2fbf8a" strokeWidth={2.5} fill="#2fbf8a" fillOpacity={0.12} isAnimationActive={false} />
                <Line dataKey="principal" name="넣은 돈" stroke="var(--finance-ink-muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                {goal > 0 && <ReferenceLine y={goal} stroke="#f0b429" strokeDasharray="6 4" label={{ value: `목표 ${a.goalEok}억`, position: "insideTopLeft", fontSize: 11, fill: "#f0b429" }} />}
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              해마다 연말에 저축을 넣고 전체 자산이 같은 수익률로 불어난다고 단순하게 계산했어요. 세금·수수료와 집·차 같은 큰 지출은 빠져 있어서 실제와 다를 수 있어요.
              {a.realView && " '지금 돈 가치'는 물가상승률만큼 줄여서 보여줘요."}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
