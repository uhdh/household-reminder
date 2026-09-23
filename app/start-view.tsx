import Link from "next/link";
import { IconArrowUpBracketDownLine, IconLinechartUpXaxisLine, IconPerson2Line } from "@karrotmarket/react-monochrome-icon";
import { eq, inArray } from "drizzle-orm";
import { AppShell, Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { assetItems, budgetCategories, uploads } from "@/lib/finance-db";
import { CATEGORY_PALETTE, formatManwon, toNumber } from "@/lib/finance-format";
import { classifyInvestmentSector } from "@/lib/finance-parse/investment-sector";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";
import { countsInTotals, flowLabel, getActiveTransactions, latestMonth, monthKeyOf, toNum } from "@/lib/spending-queries";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { AllocationCharts } from "@/app/finance/_components/charts";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";
import { BrandHero } from "@/app/brand-hero";

const benefits = [
  { Icon: IconArrowUpBracketDownLine, title: "한 번만 올리면", description: "정리는 자동" },
  { Icon: IconPerson2Line, title: "각자 올리면", description: "한 화면에 합쳐서" },
  { Icon: IconLinechartUpXaxisLine, title: "소비부터 투자까지", description: "한눈에 확인" },
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
    <section className="seed-card p-5 shadow-none sm:p-7">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-[18px] font-extrabold text-ink">{title}</h2>
        <span className="text-[17px] font-bold tabular-nums text-ink">{formatManwon(total)}</span>
      </div>
      <div className="mb-4 flex h-3 gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
        {items.map((item, index) => <span key={`${item.label}-${index}`} className={`rounded-full ${item.color}`} style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }} />)}
      </div>
      <ul className="flex flex-wrap justify-between gap-x-6 gap-y-2">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2 text-[14px]">
            <span className={`h-2.5 w-2.5 rounded-[3px] ${item.color}`} aria-hidden="true" />
            <span className="text-ink">{item.label}</span>
            <span className="font-bold tabular-nums text-ink">{formatManwon(item.value)}</span>
            <span className="tabular-nums text-ink-muted">{total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function StartView({ showHomeLink = false, personFilter = "all" }: { showHomeLink?: boolean; personFilter?: "all" | "husband" | "wife" }) {
  const db = getDb();
  // 로그인하지 않은 방문자에게는 실제 가계부 데이터를 조회하지 않는다(빈 미리보기).
  const demo = await isFinanceDemoMode();
  const [activeUploads, { transactions }, budgetRows] = demo
    ? [[], { transactions: [] }, []]
    : await Promise.all([
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

  const includedTx = transactions.filter((transaction) => countsInTotals(transaction) && (personFilter === "all" || transaction.personId === personFilter));
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

      <BrandHero />

      <section className="py-6 sm:py-8" aria-label="가계부탁의 주요 기능">
        <div className="grid gap-3 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-7 shadow-none">
              <span className="flex size-14 items-center justify-center rounded-r3 bg-bg-brand-weak text-fg-brand" aria-hidden="true">
                <benefit.Icon size={28} />
              </span>
              <h3 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em] text-fg-neutral">{benefit.title}</h3>
              <p className="mt-1 text-base text-fg-neutral-muted">{benefit.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-stroke-neutral-muted py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-fg-brand">가계부탁이 만든 결과</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-fg-neutral">입력은 한 번, 이후에는 확인만 하세요</h2>
          </div>
        </div>

        {hasPreviewData ? (
          <div className="mt-6 space-y-6">
            <Card className="overflow-hidden p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-fg-neutral">자산 현황(샘플)</h3><div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1">{(["all", "husband", "wife"] as const).map((person) => <Link key={person} href={person === "all" ? "/" : `/?person=${person}`} className={`flex h-9 items-center rounded-r2 px-4 text-[14px] ${personFilter === person ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-fg-neutral-muted hover:text-fg-neutral"}`}>{person === "all" ? "전체" : person === "husband" ? "남편" : "아내"}</Link>)}</div></div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                  <SummaryCard variant="feature" className="col-span-2 lg:col-span-4" label="순자산" value={totalAsset - totalDebt} format="manwon" breakdown={[{ label: "자산", value: totalAsset }]} />
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
                <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-fg-neutral">월별 지출(샘플)</h3><div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1">{(["all", "husband", "wife"] as const).map((person) => <Link key={person} href={person === "all" ? "/" : `/?person=${person}`} className={`flex h-9 items-center rounded-r2 px-4 text-[14px] ${personFilter === person ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-fg-neutral-muted hover:text-fg-neutral"}`}>{person === "all" ? "전체" : person === "husband" ? "남편" : "아내"}</Link>)}</div></div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
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
            <p className="mt-2 text-sm text-fg-neutral-muted">뱅크샐러드 파일을 업로드하면 가계부탁이 자산과 지출 현황을 자동으로 정리해요.</p>
            <Link href="/finance/upload" className="seed-button seed-button-primary mt-5">파일 업로드하기</Link>
          </Card>
        )}
      </section>

    </AppShell>
  );
}
