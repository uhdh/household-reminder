import Link from "next/link";
import { AppShell } from "@/components/ui";
import { formatKRW } from "@/lib/finance-format";
import type { PersonId } from "@/lib/spending-queries";
import { SummaryCard } from "./summary-card";
import { AllocationCharts } from "./charts";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";
import { YearlyView } from "@/app/finance/spending/yearly/yearly-view";
import { MonthlyNavigator } from "@/app/finance/spending/monthly/monthly-navigator";

type PersonFilterValue = "all" | PersonId;

const PERSON_SHARE: Record<PersonFilterValue, number> = { all: 1, husband: 0.47, wife: 0.53 };
const DISPLAY_NAMES = new Map<string, string>([["husband", "남편"], ["wife", "아내"]]);
const COLORS = ["#2E7DD7", "#F36B2A", "#17A875", "#F2A900", "#DD6B9A", "#008A12"];

function amountFor(value: number, personFilter: PersonFilterValue): number {
  return Math.round(value * PERSON_SHARE[personFilter]);
}

function DemoBanner({ title }: { title: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[13px] font-bold text-fg-brand">로그인 없이 둘러보기</p>
        <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h1>
      </div>
      <p className="rounded-r3 border border-stroke-brand-weak bg-bg-brand-weak px-4 py-2.5 text-[13px] font-medium text-fg-neutral">샘플 데이터이며, 로그인하면 내 데이터로 전환됩니다.</p>
    </div>
  );
}

function DemoPersonFilter({ pathname, selected }: { pathname: string; selected: PersonFilterValue }) {
  return (
    <div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1" aria-label="사람별 샘플 필터">
      {(["all", "husband", "wife"] as const).map((person) => (
        <Link
          key={person}
          href={person === "all" ? pathname : `${pathname}?person=${person}`}
          aria-current={selected === person ? "page" : undefined}
          className={`flex h-9 items-center rounded-r2 px-4 text-[14px] ${selected === person ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-ink-muted hover:text-ink"}`}
        >
          {person === "all" ? "전체" : person === "husband" ? "남편" : "아내"}
        </Link>
      ))}
    </div>
  );
}

const assetCompositionBase = [
  { name: "투자성 자산", value: 168_000_000, fill: COLORS[0] },
  { name: "예적금", value: 50_000_000, fill: COLORS[1] },
  { name: "현금", value: 20_000_000, fill: COLORS[2] },
  { name: "연금 자산", value: 16_000_000, fill: COLORS[3] },
];

const sectorCompositionBase = [
  { name: "반도체", value: 50_000_000, fill: COLORS[0] },
  { name: "미국 지수", value: 45_000_000, fill: COLORS[1] },
  { name: "달러·배당주", value: 30_000_000, fill: COLORS[2] },
  { name: "미국 빅테크", value: 25_000_000, fill: COLORS[3] },
  { name: "국내 주식·ETF", value: 13_000_000, fill: COLORS[4] },
  { name: "기타", value: 5_000_000, fill: COLORS[5] },
];

export function DemoFinanceDashboard({ personFilter }: { personFilter: PersonFilterValue }) {
  const assetComposition = assetCompositionBase.map((item) => ({ ...item, value: amountFor(item.value, personFilter) }));
  const sectorComposition = sectorCompositionBase.map((item) => ({ ...item, value: amountFor(item.value, personFilter) }));
  const totalAsset = amountFor(254_000_000, personFilter);
  const totalDebt = amountFor(34_000_000, personFilter);
  return (
    <AppShell>
      <DemoBanner title="자산관리 샘플" />
      <div className="mb-3 flex justify-end"><DemoPersonFilter pathname="/finance" selected={personFilter} /></div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <SummaryCard variant="feature" className="col-span-2 lg:col-span-1" label="순자산" value={totalAsset - totalDebt} format="manwon" />
        <SummaryCard label="총자산" value={totalAsset} format="manwon" />
        <SummaryCard label="총부채" value={totalDebt} format="manwon" />
      </div>
      {personFilter === "all" && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4">
          <SummaryCard label="남편 순자산" value={100_000_000} format="manwon" />
          <SummaryCard label="아내 순자산" value={120_000_000} format="manwon" />
        </div>
      )}
      <div className="mt-3"><AllocationCharts assetComposition={assetComposition} sectorComposition={sectorComposition} /></div>
    </AppShell>
  );
}

const fixedCategories = [
  { name: "대출원리금", value: 900_000, fill: COLORS[0] },
  { name: "세금", value: 250_000, fill: COLORS[1] },
  { name: "보험", value: 150_000, fill: COLORS[2] },
  { name: "통신", value: 100_000, fill: COLORS[3] },
  { name: "교통", value: 100_000, fill: COLORS[4] },
];

const variableCategories = [
  { name: "생필품", value: 600_000, fill: COLORS[0] },
  { name: "기타", value: 500_000, fill: COLORS[1] },
  { name: "식비", value: 550_000, fill: COLORS[2] },
  { name: "주거/통신", value: 300_000, fill: COLORS[3] },
  { name: "자동차", value: 150_000, fill: COLORS[4] },
];

export function DemoMonthlySpending({ personFilter, month }: { personFilter: PersonFilterValue; month: string }) {
  const income = amountFor(6_000_000, personFilter);
  const expense = amountFor(3_600_000, personFilter);
  const fixed = fixedCategories.map((item) => ({ ...item, value: amountFor(item.value, personFilter) }));
  const variable = variableCategories.map((item) => ({ ...item, value: amountFor(item.value, personFilter) }));
  return (
    <AppShell>
      <DemoBanner title="월별지출 샘플" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <MonthlyNavigator month={month} personFilter={personFilter} />
        <DemoPersonFilter pathname="/finance/spending/monthly" selected={personFilter} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="총수입" value={income} format="manwon" />
        <SummaryCard label="총지출" value={expense} format="manwon" />
        <SummaryCard label="당월 저축" value={income - expense} format="manwon" />
        <SummaryCard label="저축률" value={40} format="signedPct" />
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <CategoryPie title="고정비" data={fixed} amountFormat="manwon" />
        <CategoryPie title="변동비" data={variable} amountFormat="manwon" />
      </div>
    </AppShell>
  );
}

const sampleTransactions = [
  { date: "07-31", flow: "입금", person: "husband", target: "남편", category: "월급", method: "급여통장", memo: "7월 급여", amount: 3_500_000 },
  { date: "07-31", flow: "지출", person: "husband", target: "우리", category: "식비", method: "체크카드", memo: "주말 장보기", amount: 80_000 },
  { date: "07-30", flow: "지출", person: "wife", target: "아내", category: "생필품", method: "신용카드", memo: "생활용품", amount: 50_000 },
  { date: "07-29", flow: "지출", person: "wife", target: "우리", category: "주거/통신", method: "자동이체", memo: "관리비", amount: 250_000 },
  { date: "07-28", flow: "지출", person: "husband", target: "남편", category: "교통", method: "체크카드", memo: "대중교통", amount: 20_000 },
];

export function DemoTransactionList({ personFilter }: { personFilter: PersonFilterValue }) {
  const rows = sampleTransactions.filter((row) => personFilter === "all" || row.person === personFilter);
  return (
    <AppShell>
      <DemoBanner title="세부 내역 샘플" />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-r3 bg-bg-neutral-weak px-4 py-2.5 text-[13px] font-medium text-ink-muted">샘플 내역은 수정되지 않아요</span>
          <a
            href={`/api/finance/spending/export?month=2026-07${personFilter !== "all" ? `&person=${personFilter}` : ""}`}
            download
            className="seed-button seed-button-secondary inline-flex min-h-11 items-center gap-1.5 px-4 py-2 text-[14px]"
            title="샘플 세부 내역을 엑셀 파일로 다운로드합니다"
          >
            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            엑셀 다운로드
          </a>
        </div>
        <DemoPersonFilter pathname="/finance/spending" selected={personFilter} />
      </div>
      <div className="seed-card overflow-x-auto shadow-none">
        <table className="block w-full text-[14px] md:table md:min-w-[760px]">
          <thead className="hidden md:table-header-group"><tr className="border-b border-stroke-neutral-muted text-left text-[13px] text-ink-muted"><th className="px-3 py-3">날짜</th><th className="px-3 py-3">구분</th><th className="px-3 py-3">결제한 사람</th><th className="px-3 py-3">사용 대상</th><th className="px-3 py-3">카테고리</th><th className="px-3 py-3">결제수단</th><th className="px-3 py-3">메모</th><th className="px-3 py-3 text-right">금액</th></tr></thead>
          <tbody className="block md:table-row-group">
            {rows.map((row, index) => (
              <tr key={`${row.date}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-stroke-neutral-muted/60 p-4 last:border-0 md:table-row md:p-0">
                <td className="col-start-1 row-start-1 text-[13px] text-ink-muted md:table-cell md:px-3 md:py-3.5 md:text-[14px]">{row.date}</td>
                <td className={`col-start-1 row-start-2 font-semibold md:table-cell md:px-3 md:py-3.5 ${row.flow === "입금" ? "text-fg-positive" : "text-ink"}`}>{row.flow}</td>
                <td className="hidden md:table-cell md:px-3 md:py-3.5">{DISPLAY_NAMES.get(row.person)}</td>
                <td className="hidden md:table-cell md:px-3 md:py-3.5">{row.target}</td>
                <td className="col-start-1 row-start-3 md:table-cell md:px-3 md:py-3.5"><span className="rounded-r2 bg-bg-neutral-weak px-2.5 py-1 text-[13px] font-bold text-ink">{row.category}</span></td>
                <td className="col-span-2 col-start-1 row-start-4 text-[13px] text-ink-muted md:table-cell md:px-3 md:py-3.5 md:text-[14px]"><span className="md:hidden">{DISPLAY_NAMES.get(row.person)} → {row.target} · </span>{row.method}</td>
                <td className="col-span-2 col-start-1 row-start-5 text-ink-muted md:table-cell md:px-3 md:py-3.5">{row.memo}</td>
                <td className="col-start-2 row-start-1 row-span-2 text-right text-[17px] font-extrabold tabular-nums md:table-cell md:px-3 md:py-3.5 md:text-[14px] md:font-semibold">{formatKRW(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

const yearlyBase = [
  ["1월", 600, 380, 150, 230], ["2월", 900, 400, 150, 250], ["3월", 600, 350, 150, 200],
  ["4월", 600, 360, 150, 210], ["5월", 600, 370, 150, 220], ["6월", 600, 340, 150, 190],
  ["7월", 600, 360, 150, 210], ["8월", 0, 0, 0, 0], ["9월", 0, 0, 0, 0],
  ["10월", 0, 0, 0, 0], ["11월", 0, 0, 0, 0], ["12월", 0, 0, 0, 0],
] as const;

const fixedSeries = [
  { name: "대출원리금", dataKey: "fixed:loan", sourceNames: ["대출원리금"] },
  { name: "보험·통신", dataKey: "fixed:living", sourceNames: ["보험", "통신"] },
];
const variableSeries = [
  { name: "식비", dataKey: "variable:food", sourceNames: ["식비"] },
  { name: "생필품", dataKey: "variable:supplies", sourceNames: ["생필품"] },
  { name: "기타", dataKey: "variable:other", sourceNames: ["기타"] },
];

export function DemoYearlySpending({ personFilter }: { personFilter: PersonFilterValue }) {
  const scale = PERSON_SHARE[personFilter];
  const data = yearlyBase.map(([month, income, expense, fixedExpense, variableExpense]) => ({
    month,
    income: Math.round(income * scale),
    expense: Math.round(expense * scale),
    fixedExpense: Math.round(fixedExpense * scale),
    variableExpense: Math.round(variableExpense * scale),
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : null,
    "fixed:loan": Math.round(fixedExpense * 0.78 * scale),
    "fixed:living": Math.round(fixedExpense * 0.22 * scale),
    "variable:food": Math.round(variableExpense * 0.42 * scale),
    "variable:supplies": Math.round(variableExpense * 0.34 * scale),
    "variable:other": Math.round(variableExpense * 0.24 * scale),
  }));
  return (
    <AppShell>
      <DemoBanner title="연간 내역 샘플" />
      <div className="mb-3 flex justify-end"><DemoPersonFilter pathname="/finance/spending/yearly" selected={personFilter} /></div>
      <YearlyView data={data} fixedCategories={fixedSeries} variableCategories={variableSeries} annualCategory={null}>
        <div className="seed-card p-5 text-sm text-ink-muted shadow-none sm:p-7">샘플 연간 내역은 그래프로 먼저 보여드려요.</div>
      </YearlyView>
    </AppShell>
  );
}
