import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { AppShell, Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { assetItems, budgetCategories, uploads } from "@/lib/finance-db";
import { CATEGORY_PALETTE, formatManwon, toNumber } from "@/lib/finance-format";
import { classifyInvestmentSector } from "@/lib/finance-parse/investment-sector";
import { flowLabel, getActiveTransactions, latestMonth, monthKeyOf, toNum } from "@/lib/spending-queries";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { AllocationCharts } from "@/app/finance/_components/charts";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";

const benefits = [
  {
    title: "수기 작성 없이 자동화",
    description: "멋진 자산 현황, 가계부가 알아서 만들어져요.",
  },
  {
    title: "부부 자산을 하나로 통합",
    description: "각자의 자산과 소비를 합쳐 우리집 현황과 각자 흐름을 함께 확인합니다.",
  },
  {
    title: "주식 수익률과 포트폴리오 관리",
    description: "보유 자산의 수익률, 자산 구성, 섹터별 평가금액까지 한 화면에서 살펴볼 수 있어요.",
  },
];

const EXCLUDED_ASSET_CATEGORIES = new Set(["부동산", "동산", "전자금융 자산", "보험 자산"]);
const EXCLUDED_DEBT_ITEMS = new Set(["husband|분양주택입주잔금대출"]);
const ASSET_CATEGORY_OVERRIDES: Record<string, string> = {
  "자유입출금 자산": "현금",
  "현금 자산": "현금",
  "저축성 자산": "예적금",
};

type ChartSlice = { label: string; value: number; color: string };

function chartSlices(totals: Map<string, number>, limit = 5): ChartSlice[] {
  const entries = Array.from(totals.entries()).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const leading = entries.slice(0, limit);
  const rest = entries.slice(limit).reduce((sum, [, value]) => sum + value, 0);
  if (rest > 0) leading.push(["기타", rest]);
  return leading.map(([label, value], index) => ({ label, value, color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] }));
}

function CompositionCard({ title, items }: { title: string; items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="seed-card p-4 shadow-none">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
        <span className="text-[12px] tabular-nums text-ink-muted">{formatManwon(total)}</span>
      </div>
      <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-bg-neutral-weak" aria-hidden="true">
        {items.map((item) => <span key={item.label} className={item.color} style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />)}
      </div>
      <ul className="space-y-3">
        {items.map((item) => <li key={item.label} className="flex items-center gap-2 text-[12px]"><span className={`h-2.5 w-2.5 rounded-full ${item.color}`} /><span className="flex-1 text-ink-muted">{item.label}</span><span className="font-semibold tabular-nums text-ink">{formatManwon(item.value)}</span><span className="w-10 text-right tabular-nums text-ink-muted">{total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%</span></li>)}
      </ul>
    </section>
  );
}

export async function StartView({ showHomeLink = false, personFilter = "all" }: { showHomeLink?: boolean; personFilter?: "all" | "husband" | "wife" }) {
  const db = getDb();
  const [activeUploads, { transactions }, budgetRows] = await Promise.all([
    db.select().from(uploads).where(eq(uploads.isActive, true)),
    getActiveTransactions(),
    db.select().from(budgetCategories),
  ]);
  const activeUploadIds = activeUploads.map((upload) => upload.id);
  const rawAssets = activeUploadIds.length
    ? await db.select().from(assetItems).where(inArray(assetItems.uploadId, activeUploadIds))
    : [];
  const allAssets = rawAssets.filter((item) =>
    item.side === "asset"
      ? !EXCLUDED_ASSET_CATEGORIES.has(item.category)
      : !EXCLUDED_DEBT_ITEMS.has(`${item.personId}|${item.productName ?? ""}`)
  );
  const assets = personFilter === "all" ? allAssets : allAssets.filter((item) => item.personId === personFilter);
  const totalAsset = assets.filter((item) => item.side === "asset").reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalDebt = assets.filter((item) => item.side === "debt").reduce((sum, item) => sum + toNumber(item.amount), 0);
  const netByPerson = new Map<string, number>();
  const assetTotals = new Map<string, number>();
  const sectorTotals = new Map<string, number>();
  for (const item of assets) {
    const amount = toNumber(item.amount);
    netByPerson.set(item.personId, (netByPerson.get(item.personId) ?? 0) + (item.side === "asset" ? amount : -amount));
    if (item.side !== "asset") continue;
    const category = ASSET_CATEGORY_OVERRIDES[item.category] ?? item.category;
    assetTotals.set(category, (assetTotals.get(category) ?? 0) + amount);
    if (item.costBasis !== null) {
      const sector = item.sector ?? classifyInvestmentSector(item.productName ?? item.category);
      sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + amount);
    }
  }
  const assetSlices = chartSlices(assetTotals);
  const sectorSlices = chartSlices(sectorTotals);

  const includedTx = transactions.filter((transaction) => transaction.included && (personFilter === "all" || transaction.personId === personFilter));
  const month = latestMonth(includedTx);
  const monthTx = includedTx.filter((transaction) => monthKeyOf(transaction.txnDate) === month && flowLabel(transaction) === "지출");
  const monthlyExpense = monthTx.reduce((sum, transaction) => sum + Math.abs(toNum(transaction.amount)), 0);
  const categoryTotals = new Map<string, number>();
  for (const transaction of monthTx) {
    const category = transaction.stdCategory ?? "미분류";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + Math.abs(toNum(transaction.amount)));
  }
  const budgetByName = new Map(budgetRows.map((row) => [row.name, row]));
  const kindOf = (category: string | null, flow: "입금" | "지출") => budgetByName.get(category ?? "")?.kind ?? (flow === "입금" ? "변동수입" : "변동비");
  const monthlyIncome = includedTx
    .filter((transaction) => monthKeyOf(transaction.txnDate) === month && flowLabel(transaction) === "입금")
    .reduce((sum, transaction) => sum + Math.abs(toNum(transaction.amount)), 0);
  let fixedIncome = 0;
  let variableIncome = 0;
  let fixedExpense = 0;
  let variableExpense = 0;
  const fixedCategoryTotals = new Map<string, number>();
  const variableCategoryTotals = new Map<string, number>();
  for (const transaction of includedTx.filter((item) => monthKeyOf(item.txnDate) === month)) {
    const flow = flowLabel(transaction);
    const amount = Math.abs(toNum(transaction.amount));
    const kind = kindOf(transaction.stdCategory, flow);
    if (flow === "입금") {
      if (kind === "고정수입") fixedIncome += amount;
      else variableIncome += amount;
      continue;
    }
    const category = transaction.stdCategory ?? "미분류";
    if (kind === "고정비") {
      fixedExpense += amount;
      fixedCategoryTotals.set(category, (fixedCategoryTotals.get(category) ?? 0) + amount);
    } else {
      variableExpense += amount;
      variableCategoryTotals.set(category, (variableCategoryTotals.get(category) ?? 0) + amount);
    }
  }
  const fixedSlices = chartSlices(fixedCategoryTotals);
  const variableSlices = chartSlices(variableCategoryTotals);
  const monthlyBalance = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? (monthlyBalance / monthlyIncome) * 100 : 0;

  const hasPreviewData = totalAsset > 0 || monthlyExpense > 0;

  return (
    <AppShell size="wide" className="font-sans">
      {showHomeLink && (
        <Link href="/" className="mb-6 text-sm font-semibold text-fg-neutral-muted hover:text-fg-neutral">
          ← 홈으로
        </Link>
      )}

      <section className="px-5 py-8 text-left sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <p className="text-sm font-bold text-fg-brand">효율의 끝판왕, 모든 것이 귀찮은 사람을 위한 자산 관리 시스템</p>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-[-0.03em] text-fg-neutral sm:text-4xl lg:text-5xl">
          자산관리, 가계부 100% 자동화
        </h1>
      </section>

      <section className="py-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-5 shadow-none">
              <h3 className="text-base font-bold text-fg-neutral">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-neutral-muted">{benefit.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-stroke-neutral-muted py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-fg-brand">우리집 실제 미리보기</p>
            <h2 className="mt-2 text-2xl font-bold text-fg-neutral">업로드하면 이렇게 한눈에 보여요</h2>
          </div>
        </div>

        {hasPreviewData ? (
          <div className="mt-6 space-y-6">
            <Card className="overflow-hidden p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-fg-neutral">자산 현황(샘플)</h3><div className="inline-flex rounded-r2 bg-bg-neutral-weak p-1 text-[12px] font-semibold">{(["all", "husband", "wife"] as const).map((person) => <Link key={person} href={person === "all" ? "/" : `/?person=${person}`} className={`rounded-r2 px-3 py-1.5 ${personFilter === person ? "bg-bg-brand-solid text-fg-neutral-inverted" : "text-fg-neutral-muted hover:text-fg-neutral"}`}>{person === "all" ? "전체" : person === "husband" ? "남편" : "아내"}</Link>)}</div></div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                  <SummaryCard label="순자산" value={totalAsset - totalDebt} format="manwon" breakdown={[{ label: "자산", value: totalAsset }]} />
                  <SummaryCard label="총자산" value={totalAsset} format="manwon" />
                  <SummaryCard label="총부채" value={totalDebt} format="manwon" />
                  <SummaryCard label="남편 순자산" value={netByPerson.get("husband") ?? 0} format="manwon" />
                  <SummaryCard label="아내 순자산" value={netByPerson.get("wife") ?? 0} format="manwon" />
                </div>
                <div className="mt-3">
                  <AllocationCharts assetComposition={assetSlices.map((slice) => ({ name: slice.label, value: slice.value, fill: slice.color }))} sectorComposition={sectorSlices.map((slice) => ({ name: slice.label, value: slice.value, fill: slice.color }))} />
                </div>
            </Card>

            <Card className="overflow-hidden p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold text-fg-neutral">월별 지출(샘플)</h3><div className="inline-flex rounded-r2 bg-bg-neutral-weak p-1 text-[12px] font-semibold">{(["all", "husband", "wife"] as const).map((person) => <Link key={person} href={person === "all" ? "/" : `/?person=${person}`} className={`rounded-r2 px-3 py-1.5 ${personFilter === person ? "bg-bg-brand-solid text-fg-neutral-inverted" : "text-fg-neutral-muted hover:text-fg-neutral"}`}>{person === "all" ? "전체" : person === "husband" ? "남편" : "아내"}</Link>)}</div></div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard label="총수입" value={monthlyIncome} format="compactKrw" />
                  <SummaryCard label="총지출" value={monthlyExpense} format="compactKrw" />
                  <SummaryCard label="당월 저축" value={monthlyBalance} format="compactKrw" />
                  <SummaryCard label="저축률" value={savingsRate} format="signedPct" />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <CompositionCard title="수입 구성" items={[{ label: "고정수입", value: fixedIncome, color: "bg-bg-brand-solid" }, { label: "변동수입", value: variableIncome, color: "bg-bg-positive-solid" }]} />
                  <CompositionCard title="지출 구성" items={[{ label: "고정비", value: fixedExpense, color: "bg-bg-informative-solid" }, { label: "변동비", value: variableExpense, color: "bg-bg-warning-solid" }]} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CategoryPie title="고정비" data={fixedSlices.map((slice) => ({ name: slice.label, value: slice.value, fill: slice.color }))} />
                  <CategoryPie title="변동비" data={variableSlices.map((slice) => ({ name: slice.label, value: slice.value, fill: slice.color }))} />
                </div>
            </Card>
          </div>
        ) : (
          <Card className="mt-6 p-6 text-center shadow-none">
            <p className="font-bold text-fg-neutral">아직 보여드릴 데이터가 없어요</p>
            <p className="mt-2 text-sm text-fg-neutral-muted">뱅크샐러드 파일을 업로드하면 우리집 실제 자산과 지출 현황을 이곳에서 미리 볼 수 있어요.</p>
            <Link href="/finance/upload" className="seed-button seed-button-primary mt-5">파일 업로드하기</Link>
          </Card>
        )}
      </section>

    </AppShell>
  );
}
