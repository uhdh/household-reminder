"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { blendedReturnPct, projectNetWorth, yearsToReach, type ProjectionDebt } from "@/lib/projection";
import { DEFAULT_PLAN_SETTINGS, type AssetClass, type PlanEvent, type PlanSettings } from "@/lib/plan-settings";
import { savePlanSettingsAction } from "./actions";

export type PlanDebt = { key: string; name: string; personLabel: string; balance: number };

const MILESTONES = [10, 20, 30];
const SCENARIOS = [
  { label: "안정형", returnPct: 3 },
  { label: "균형형", returnPct: 5 },
  { label: "공격형", returnPct: 7 },
];
const CLASS_LABELS: Record<AssetClass, string> = { cash: "현금·입출금", deposit: "예금·적금", invest: "투자·연금", other: "기타" };
const EVENT_PRESETS = [
  { label: "내 집 마련", amountMan: -30000 },
  { label: "차 구입", amountMan: -4000 },
  { label: "결혼", amountMan: -5000 },
  { label: "출산·육아", amountMan: -3000 },
  { label: "상속·증여", amountMan: 10000 },
];
const GREEN = "#2fbf8a";
const GOLD = "#f0b429";
const tooltipStyle = { backgroundColor: "var(--seed-color-bg-layer-floating)", border: "1px solid var(--seed-color-stroke-neutral-muted)", borderRadius: 10, fontSize: 12 };
const axisTick = { fontSize: 11, fill: "var(--finance-ink-muted)" };

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

function NumberField({ label, suffix, value, step, onChange, hint, compact }: { label: string; suffix: string; value: number; step: number; onChange: (v: number) => void; hint?: ReactNode; compact?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {hint && <span className="ml-1.5 text-[11px] text-ink-muted">{hint}</span>}
      <span className="mt-1.5 flex items-center gap-2 rounded-r2 border border-stroke-neutral-subtle bg-bg-layer-default px-3 focus-within:border-stroke-brand-solid">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className={`${compact ? "h-9 text-[14px]" : "h-10 text-[15px]"} min-w-0 flex-1 bg-transparent text-right font-bold tabular-nums text-ink outline-none`}
        />
        <span className="shrink-0 text-[12px] text-ink-muted">{suffix}</span>
      </span>
    </label>
  );
}

/** 왼쪽 가정 패널의 접히는 묶음. */
function Group({ title, summary, children, defaultOpen = false }: { title: string; summary?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-t-[0.8px] border-hairline pt-3 first:border-t-0 first:pt-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 [&::-webkit-details-marker]:hidden">
        <span className="text-[15px] font-extrabold text-ink">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="truncate">{summary}</span>
          <span aria-hidden className="transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3.5">{children}</div>
    </details>
  );
}

function Toggle({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-r2 bg-bg-neutral-weak p-0.5 text-[12px] font-semibold">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} className={`rounded-r2 px-2.5 py-1 ${value === o.value ? "bg-bg-layer-default text-ink" : "text-ink-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PlanView({
  grossAssets,
  classWeights,
  debts,
  annualIncome,
  annualExpense,
  monthCount,
  history,
  depositRateHint,
  initialSettings,
  savedAt,
  readOnly,
}: {
  grossAssets: number;
  classWeights: Record<AssetClass, number>;
  debts: PlanDebt[];
  annualIncome: number;
  annualExpense: number;
  monthCount: number;
  history: { month: string; net: number }[];
  depositRateHint: number | null;
  initialSettings: PlanSettings;
  savedAt: string | null;
  readOnly: boolean;
}) {
  const measuredSaving = annualIncome - annualExpense;
  const measuredSavingMan = Math.round(measuredSaving / 10_000);
  const debtTotal = debts.reduce((s, d) => s + d.balance, 0);
  const netWorth = grossAssets - debtTotal;
  const thisYear = new Date().getFullYear();

  const [s, setS] = useState<PlanSettings>(initialSettings);
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initialSettings));
  const [saveMessage, setSaveMessage] = useState<string | null>(savedAt ? `${new Date(savedAt).toLocaleDateString("ko-KR")}에 저장한 계획이에요` : null);
  const [saving, startSaving] = useTransition();
  const [view, setView] = useState<"real" | "nominal">("real");
  const dirty = JSON.stringify(s) !== savedJson;
  const patch = (p: Partial<PlanSettings>) => setS((prev) => ({ ...prev, ...p }));
  const patchRet = (p: Partial<PlanSettings["retirement"]>) => setS((prev) => ({ ...prev, retirement: { ...prev.retirement, ...p } }));
  const loanOf = (key: string) => s.loans[key] ?? { ratePct: 4, monthlyMan: 0, reinvest: true };
  const patchLoan = (key: string, p: Partial<PlanSettings["loans"][string]>) => setS((prev) => ({ ...prev, loans: { ...prev.loans, [key]: { ...loanOf(key), ...p } } }));
  const setEvents = (events: PlanEvent[]) => patch({ events });

  const savingMan = s.savingMan ?? Math.max(0, measuredSavingMan);
  const effectiveReturn = s.returnMode === "single" ? s.returnPct : blendedReturnPct(classWeights, s.classReturns);
  const ret = s.retirement;
  const retireOffset = ret.enabled ? Math.max(0, ret.retireAge - ret.currentAge) : null;
  const horizon = ret.enabled ? Math.min(70, Math.max(30, 95 - ret.currentAge)) : 30;
  const annualSpend = ret.monthlySpendMan * 12 * 10_000;

  const { points, low, high, noRetire } = useMemo(() => {
    const projDebts: ProjectionDebt[] = debts.map((d) => {
      const l = s.loans[d.key] ?? { ratePct: 4, monthlyMan: 0, reinvest: true };
      return { key: d.key, balance: d.balance, ratePct: l.ratePct, monthlyPayment: l.monthlyMan * 10_000, reinvest: l.reinvest };
    });
    const base = {
      start: grossAssets,
      annualSaving: savingMan * 10_000,
      savingGrowthPct: s.savingGrowthPct,
      inflationPct: s.inflationPct,
      years: horizon,
      debts: projDebts,
      events: s.events.map((e) => ({ yearOffset: e.year - thisYear, amount: e.amountMan * 10_000 })),
      retireAfterYear: retireOffset,
      annualSpend,
    };
    return {
      points: projectNetWorth({ ...base, returnPct: effectiveReturn }),
      low: projectNetWorth({ ...base, returnPct: effectiveReturn - 2 }),
      high: projectNetWorth({ ...base, returnPct: effectiveReturn + 2 }),
      noRetire: projectNetWorth({ ...base, returnPct: effectiveReturn, retireAfterYear: null }),
    };
  }, [debts, s, grossAssets, savingMan, horizon, thisYear, retireOffset, annualSpend, effectiveReturn]);

  const pick = (p: { nominal: number; real: number }) => (view === "real" ? p.real : p.nominal);
  const deflate = (won: number, year: number) => (view === "real" ? won / (1 + s.inflationPct / 100) ** year : won);
  const chartData = points.map((p, i) => ({
    label: `${thisYear + p.year}`,
    expected: Math.round(pick(p)),
    principal: Math.round(deflate(p.principal, p.year)),
    range: [Math.round(pick(low[i])), Math.round(pick(high[i]))] as [number, number],
  }));
  const goal = s.goalEok * 100_000_000;
  const goalYear = goal > 0 ? yearsToReach(points, goal) : null;
  const savingRate = annualIncome > 0 ? (measuredSaving / annualIncome) * 100 : null;

  // 은퇴: 필요한 자산 = 연 생활비 ÷ 인출률(지금 돈 가치). 은퇴하지 않고 계속 모을 때 처음 닿는 해.
  const retireNeed = (annualSpend * 100) / ret.withdrawalPct;
  const retireReadyYear = ret.enabled ? yearsToReach(noRetire, retireNeed) : null;
  const depleteYear = ret.enabled && retireOffset !== null ? points.find((p) => p.year > retireOffset && p.nominal < 0)?.year ?? null : null;
  const atRetire = retireOffset !== null ? points[Math.min(retireOffset, points.length - 1)] : null;

  const payoffs = debts.map((d) => ({ ...d, year: points.find((p) => p.paidOff.includes(d.key))?.year ?? null, monthlyMan: loanOf(d.key).monthlyMan }));

  // 실제 vs 계획: 기록이 시작된 달의 순자산에서 같은 가정으로 키운 선과 실제 기록을 비교한다.
  const comparison = history.length >= 2
    ? history.map((h, m) => {
        const r = effectiveReturn / 100;
        const growth = (1 + r) ** (m / 12);
        return { label: h.month.slice(2).replace("-", "."), actual: Math.round(h.net), plan: Math.round(history[0].net * growth + savingMan * 10_000 * (m / 12)) };
      })
    : [];
  const lastCmp = comparison.at(-1);

  function save() {
    const json = JSON.stringify(s);
    startSaving(async () => {
      const result = await savePlanSettingsAction(json);
      if (result.ok) {
        setSavedJson(json);
        setSaveMessage("저장했어요. 함께 쓰는 사람도 같은 계획을 봐요.");
      } else setSaveMessage(result.error);
    });
  }

  const ageAt = (year: number) => (ret.enabled ? ` · ${ret.currentAge + year}세` : "");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">미래 계획</h1>
          <p className="mt-1 text-[14px] text-ink-muted">지금 자산과 저축 흐름에 큰 지출·대출·은퇴까지 넣어 앞으로의 자산을 그려봐요.</p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-3">
            <span role="status" className="text-[12px] text-ink-muted">{dirty ? "저장하지 않은 변경이 있어요" : saveMessage}</span>
            <button type="button" onClick={save} disabled={!dirty || saving} className="rounded-r2 bg-bg-brand-solid px-4 py-2 text-[13px] font-bold text-static-white disabled:opacity-40">
              {saving ? "저장 중…" : "계획 저장"}
            </button>
          </div>
        )}
      </div>

      <section className="seed-card mb-4 p-4 shadow-none sm:p-5" aria-label="출발점">
        <div className="grid grid-cols-3 divide-x-[0.8px] divide-hairline">
          {[
            { label: "지금 순자산", value: formatEok(netWorth), tone: "text-ink" },
            { label: "1년 저축", value: formatEok(measuredSaving), tone: measuredSaving < 0 ? "text-fg-critical" : "text-ink" },
            { label: "저축률", value: savingRate === null ? "-" : `${savingRate.toFixed(0)}%`, tone: "text-ink" },
          ].map((x) => (
            <div key={x.label} className="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-5">
              <p className="text-[12px] text-ink-muted sm:text-[13px]">{x.label}</p>
              <p className={`mt-0.5 text-[15px] font-extrabold tabular-nums sm:text-[22px] ${x.tone}`}>{x.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t-[0.8px] border-hairline pt-2.5 text-[12px] text-ink-muted">
          {monthCount > 0
            ? `최근 ${monthCount}개월 수입 ${formatEok(annualIncome)} - 지출 ${formatEok(annualExpense)}${monthCount < 12 ? "(1년으로 환산)" : ""} 기준이에요. 순자산은 자산 ${formatEok(grossAssets)} - 부채 ${formatEok(debtTotal)}예요.`
            : "아직 거래 내역이 없어서 연 저축액을 직접 넣어 주세요."}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
        <section className="seed-card order-2 flex flex-col gap-3 p-5 shadow-none lg:order-1" aria-label="계획 가정">
          <Group title="저축과 물가" summary={`연 ${savingMan.toLocaleString("ko-KR")}만원`} defaultOpen>
            <NumberField
              label="연 저축액"
              hint={s.savingMan === null ? "실제 기록" : <button type="button" className="underline" onClick={() => patch({ savingMan: null })}>실제 기록({measuredSavingMan.toLocaleString("ko-KR")}만)으로</button>}
              suffix="만원"
              step={100}
              value={savingMan}
              onChange={(v) => patch({ savingMan: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField compact label="저축 증가율" suffix="%/년" step={0.5} value={s.savingGrowthPct} onChange={(v) => patch({ savingGrowthPct: v })} />
              <NumberField compact label="물가상승률" suffix="%/년" step={0.5} value={s.inflationPct} onChange={(v) => patch({ inflationPct: v })} />
            </div>
            <NumberField label="목표 자산" hint="지금 돈 가치" suffix="억원" step={1} value={s.goalEok} onChange={(v) => patch({ goalEok: v })} />
          </Group>

          <Group title="수익률" summary={`연 ${effectiveReturn.toFixed(1)}%`} defaultOpen>
            <Toggle options={[{ value: "single", label: "한 가지로" }, { value: "byClass", label: "자산별로" }]} value={s.returnMode} onChange={(v) => patch({ returnMode: v as PlanSettings["returnMode"] })} />
            {s.returnMode === "single" ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {SCENARIOS.map((x) => (
                    <button key={x.label} type="button" onClick={() => patch({ returnPct: x.returnPct })} aria-pressed={s.returnPct === x.returnPct} className={`rounded-r2 px-2 py-2 text-center ${s.returnPct === x.returnPct ? "bg-bg-brand-weak text-fg-brand" : "bg-bg-neutral-weak text-ink-muted hover:text-ink"}`}>
                      <span className="block text-[13px] font-bold">{x.label}</span>
                      <span className="block text-[11px]">연 {x.returnPct}%</span>
                    </button>
                  ))}
                </div>
                <NumberField compact label="기대 수익률" hint="직접 입력" suffix="%/년" step={0.5} value={s.returnPct} onChange={(v) => patch({ returnPct: v })} />
              </>
            ) : (
              <>
                {(Object.keys(CLASS_LABELS) as AssetClass[]).map((k) => (
                  <NumberField
                    key={k}
                    compact
                    label={CLASS_LABELS[k]}
                    hint={
                      <>
                        {formatEok(classWeights[k])}
                        {k === "deposit" && depositRateHint !== null && depositRateHint !== s.classReturns.deposit && (
                          <button type="button" className="ml-1 underline" onClick={() => patch({ classReturns: { ...s.classReturns, deposit: depositRateHint } })}>
                            입력한 금리 평균 {depositRateHint}%
                          </button>
                        )}
                      </>
                    }
                    suffix="%/년"
                    step={0.5}
                    value={s.classReturns[k]}
                    onChange={(v) => patch({ classReturns: { ...s.classReturns, [k]: v } })}
                  />
                ))}
                <p className="text-[12px] text-ink-muted">지금 자산 비중으로 섞으면 연 {effectiveReturn.toFixed(2)}%예요. 새로 모으는 돈도 같은 비중으로 나눠 넣는다고 봐요.</p>
              </>
            )}
          </Group>

          <Group title="큰 지출·수입" summary={s.events.length ? `${s.events.length}개` : "없음"}>
            {s.events.map((e, idx) => (
              <div key={e.id} className="rounded-r2 bg-bg-neutral-weak p-2.5">
                <div className="flex items-center gap-2">
                  <input value={e.label} placeholder="이름" onChange={(ev) => setEvents(s.events.map((x, i) => (i === idx ? { ...x, label: ev.target.value } : x)))} className="h-8 min-w-0 flex-1 rounded-r2 border border-stroke-neutral-subtle bg-bg-layer-default px-2 text-[13px] text-ink outline-none focus:border-stroke-brand-solid" />
                  <button type="button" aria-label={`${e.label || "이벤트"} 삭제`} onClick={() => setEvents(s.events.filter((_, i) => i !== idx))} className="px-1 text-[13px] text-ink-muted hover:text-fg-critical">✕</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberField compact label="연도" suffix="년" step={1} value={e.year} onChange={(v) => setEvents(s.events.map((x, i) => (i === idx ? { ...x, year: Math.round(v) } : x)))} />
                  <NumberField compact label="금액" hint="-는 지출" suffix="만원" step={100} value={e.amountMan} onChange={(v) => setEvents(s.events.map((x, i) => (i === idx ? { ...x, amountMan: v } : x)))} />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5">
              {EVENT_PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => setEvents([...s.events, { id: `${Date.now()}`, year: thisYear + 3, label: p.label, amountMan: p.amountMan }])} className="rounded-full bg-bg-neutral-weak px-3 py-1.5 text-[12px] font-semibold text-ink-muted hover:text-ink">
                  + {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted">금액은 지금 돈 가치로 넣어요. 그해 물가만큼 키워서 반영해요.</p>
          </Group>

          <Group title="은퇴" summary={ret.enabled ? `${ret.retireAge}세 · 월 ${ret.monthlySpendMan}만원` : "꺼짐"}>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <input type="checkbox" checked={ret.enabled} onChange={(e) => patchRet({ enabled: e.target.checked })} />
              은퇴 계획 넣기
            </label>
            {ret.enabled && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumberField compact label="지금 나이" suffix="세" step={1} value={ret.currentAge} onChange={(v) => patchRet({ currentAge: Math.round(v) })} />
                  <NumberField compact label="은퇴 나이" suffix="세" step={1} value={ret.retireAge} onChange={(v) => patchRet({ retireAge: Math.round(v) })} />
                </div>
                <NumberField label="은퇴 후 월 생활비" hint="지금 돈 가치" suffix="만원" step={10} value={ret.monthlySpendMan} onChange={(v) => patchRet({ monthlySpendMan: v })} />
                <NumberField compact label="안전 인출률" hint="보통 4%" suffix="%/년" step={0.5} value={ret.withdrawalPct} onChange={(v) => patchRet({ withdrawalPct: v })} />
              </>
            )}
          </Group>

          <Group title="대출 상환" summary={debts.length ? `${debts.length}건 · ${formatEok(debtTotal)}` : "없음"}>
            {debts.length === 0 && <p className="text-[12px] text-ink-muted">자산관리에 잡힌 대출이 없어요.</p>}
            {debts.map((d) => {
              const l = loanOf(d.key);
              return (
                <div key={d.key} className="rounded-r2 bg-bg-neutral-weak p-2.5">
                  <p className="flex justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate font-semibold text-ink">{d.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-muted">{d.personLabel} · {formatEok(d.balance)}</span>
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <NumberField compact label="금리" suffix="%" step={0.1} value={l.ratePct} onChange={(v) => patchLoan(d.key, { ratePct: v })} />
                    <NumberField compact label="월 상환" suffix="만원" step={10} value={l.monthlyMan} onChange={(v) => patchLoan(d.key, { monthlyMan: v })} />
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-muted">
                    <input type="checkbox" checked={l.reinvest} onChange={(e) => patchLoan(d.key, { reinvest: e.target.checked })} />
                    다 갚으면 그만큼 더 저축
                  </label>
                </div>
              );
            })}
            {debts.length > 0 && <p className="text-[11px] text-ink-muted">월 상환액은 이미 지출에 잡혀 있다고 봐요. 상환액을 비워 두면 잔액이 그대로 남아요.</p>}
          </Group>

          <button type="button" onClick={() => setS(DEFAULT_PLAN_SETTINGS)} className="self-start pt-1 text-[12px] font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline">
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
                    {y}년 뒤 <span className="font-normal">· {thisYear + y}년{ageAt(y)}</span>
                  </p>
                  <p className={`mt-1 text-[22px] font-extrabold tabular-nums ${value < 0 ? "text-fg-critical" : "text-ink"}`}>{formatEok(value)}</p>
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

          <ul className="flex flex-col gap-2 text-[14px] text-ink">
            {goal > 0 && (
              <li className="rounded-r3 bg-bg-brand-weak px-4 py-3">
                {goalYear === null ? <>이대로면 {horizon}년 안에 목표 <b>{s.goalEok}억</b>에 닿지 못해요.</> : goalYear === 0 ? <>이미 목표 <b>{s.goalEok}억</b>을 넘었어요.</> : <>목표 <b>{s.goalEok}억</b>은 <b>{goalYear}년 뒤({thisYear + goalYear}년{ageAt(goalYear)})</b>에 닿아요.</>}
              </li>
            )}
            {ret.enabled && (
              <li className="rounded-r3 bg-bg-neutral-weak px-4 py-3">
                월 {ret.monthlySpendMan}만원으로 살려면 은퇴 자금 <b>{formatEok(retireNeed)}</b>(지금 돈 가치)이 필요해요.{" "}
                {retireReadyYear === null ? "이대로면 그만큼 모으기 어려워요." : <>계속 모으면 <b>{ret.currentAge + retireReadyYear}세({thisYear + retireReadyYear}년)</b>에 마련돼요.</>}
                {atRetire && <> {ret.retireAge}세 은퇴 때 예상 자산은 <b>{formatEok(atRetire.real)}</b>이고, </>}
                {depleteYear === null ? <>{ret.currentAge + horizon}세까지 자산이 남아요.</> : <><b className="text-fg-critical">{ret.currentAge + depleteYear}세</b>쯤 바닥나요.</>}
              </li>
            )}
            {payoffs.some((p) => p.year !== null) && (
              <li className="rounded-r3 bg-bg-neutral-weak px-4 py-3">
                {payoffs.filter((p) => p.year !== null).map((p) => `${p.name} ${thisYear + p.year!}년`).join(", ")}에 다 갚아요.
              </li>
            )}
          </ul>

          <section className="seed-card p-5 shadow-none sm:p-6" aria-labelledby="plan-chart">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="plan-chart" className="text-[16px] font-extrabold text-ink">{horizon}년 자산 흐름</h2>
              <Toggle options={[{ value: "real", label: "지금 돈 가치" }, { value: "nominal", label: "그때 금액" }]} value={view} onChange={(v) => setView(v as "real" | "nominal")} />
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                <XAxis dataKey="label" interval={4} axisLine={false} tickLine={false} tick={axisTick} />
                <YAxis tickFormatter={axisEok} axisLine={false} tickLine={false} width={48} tick={axisTick} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [Array.isArray(value) ? `${formatEok(Number(value[0]))} ~ ${formatEok(Number(value[1]))}` : formatEok(Number(value)), name]}
                  labelFormatter={(label) => `${label}년`}
                />
                <Area dataKey="range" name="범위(수익률 ±2%)" stroke="none" fill={GREEN} fillOpacity={0.15} isAnimationActive={false} />
                <Area dataKey="expected" name="예상 순자산" stroke={GREEN} strokeWidth={2.5} fill={GREEN} fillOpacity={0.12} isAnimationActive={false} />
                <Line dataKey="principal" name="넣은 돈" stroke="var(--finance-ink-muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                {goal > 0 && <ReferenceLine y={goal} stroke={GOLD} strokeDasharray="6 4" label={{ value: `목표 ${s.goalEok}억`, position: "insideTopLeft", fontSize: 11, fill: GOLD }} />}
                {retireOffset !== null && retireOffset <= horizon && <ReferenceLine x={`${thisYear + retireOffset}`} stroke="var(--finance-ink-muted)" label={{ value: "은퇴", position: "insideTopRight", fontSize: 11, fill: "var(--finance-ink-muted)" }} />}
                {s.events.map((e) => (
                  <ReferenceLine key={e.id} x={`${e.year}`} stroke={e.amountMan < 0 ? "#f2783c" : GREEN} strokeOpacity={0.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-2 text-[11px] leading-5 text-ink-muted">
              해마다 연말에 저축을 넣고 자산이 같은 수익률로 불어난다고 단순하게 계산했어요. 세금·수수료는 빠져 있어요. 세로선은 큰 지출(주황)·수입(초록)과 은퇴 시점이에요.
            </p>
          </section>

          <section className="seed-card p-5 shadow-none sm:p-6" aria-labelledby="plan-actual">
            <h2 id="plan-actual" className="text-[16px] font-extrabold text-ink">계획대로 가고 있나요?</h2>
            {comparison.length === 0 ? (
              <p className="mt-2 text-[13px] text-ink-muted">매달 파일을 올리면 실제 순자산이 쌓여서 계획과 나란히 보여드려요.</p>
            ) : (
              <>
                {lastCmp && (
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {history[0].month} 기록부터 같은 가정으로 키운 선과 비교하면, 지금{" "}
                    <b className={lastCmp.actual >= lastCmp.plan ? "text-fg-positive" : "text-fg-critical"}>
                      {formatEok(Math.abs(lastCmp.actual - lastCmp.plan))} {lastCmp.actual >= lastCmp.plan ? "앞서" : "뒤처져"}
                    </b>{" "}
                    있어요.
                  </p>
                )}
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={comparison} margin={{ top: 12, right: 20, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--finance-hairline2)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={axisTick} />
                    <YAxis tickFormatter={axisEok} axisLine={false} tickLine={false} width={48} tick={axisTick} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => [formatEok(Number(value)), name]} />
                    <Line dataKey="plan" name="계획" stroke="var(--finance-ink-muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line dataKey="actual" name="실제" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </section>

          <section className="seed-card overflow-x-auto p-5 shadow-none sm:p-6" aria-labelledby="plan-table">
            <h2 id="plan-table" className="mb-2 text-[16px] font-extrabold text-ink">5년마다 보기</h2>
            <table className="w-full whitespace-nowrap text-[13px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline text-left text-[11px] text-ink-muted">
                  <th className="py-2 pr-3 font-semibold">연도</th>
                  <th className="py-2 pr-3 text-right font-semibold">순자산{view === "real" ? "(지금 가치)" : ""}</th>
                  <th className="py-2 pr-3 text-right font-semibold">넣은 돈</th>
                  <th className="py-2 text-right font-semibold">남은 대출</th>
                </tr>
              </thead>
              <tbody>
                {points.filter((p) => p.year > 0 && p.year % 5 === 0).map((p) => (
                  <tr key={p.year} className="border-b-[0.8px] border-hairline2 last:border-0">
                    <td className="py-2 pr-3 text-ink">{thisYear + p.year}년 <span className="text-ink-muted">({p.year}년 뒤{ageAt(p.year)})</span></td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${pick(p) < 0 ? "text-fg-critical" : "text-ink"}`}>{formatEok(pick(p))}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-ink-muted">{formatEok(deflate(p.principal, p.year))}</td>
                    <td className="py-2 text-right tabular-nums text-ink-muted">{p.debt > 0 ? formatEok(p.debt) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
