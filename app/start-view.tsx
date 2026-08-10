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
    title: "입력 대신 업로드 한 번",
    description: "뱅크샐러드 엑셀 파일을 올리면 거래 내역을 읽고 수입·지출과 카테고리를 자동으로 정리합니다.",
  },
  {
    title: "부부 자산을 하나로 공유",
    description: "각자의 자산과 소비 내역을 합쳐 우리집 전체 현황과 남편·아내별 흐름을 함께 확인해요.",
  },
  {
    title: "주식 수익률과 포트폴리오 관리",
    description: "보유 자산의 수익률, 자산 구성, 섹터별 평가금액까지 한 화면에서 살펴볼 수 있어요.",
  },
];

const steps = [
  ["1", "데이터 받기", "뱅크샐러드에서 자산·가계부 엑셀 파일을 내려받아요."],
  ["2", "파일 업로드", "남편과 아내의 파일을 각각 우리집에 올려요."],
  ["3", "자동 정리 확인", "합쳐진 자산·소비·포트폴리오 현황을 바로 확인해요."],
] as const;

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

export async function StartView({ showHomeLink = false }: { showHomeLink?: boolean }) {
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
  const assets = rawAssets.filter((item) =>
    item.side === "asset"
      ? !EXCLUDED_ASSET_CATEGORIES.has(item.category)
      : !EXCLUDED_DEBT_ITEMS.has(`${item.personId}|${item.productName ?? ""}`)
  );
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

  const includedTx = transactions.filter((transaction) => transaction.included);
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

      <section className="rounded-r4 bg-bg-brand-weak px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
        <p className="text-sm font-bold text-fg-brand">효율의 끝판왕, 모든 것이 귀찮은 사람을 위한 자산 관리 시스템</p>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-[-0.03em] text-fg-neutral sm:text-4xl lg:text-5xl">
          자산관리, 가계부
          <br />100% 자동화
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-fg-neutral-muted lg:text-lg lg:leading-8">
          뱅크샐러드 데이터를 업로드하면 거래를 자동 분류하고, 부부의 소비·자산·투자 현황을 우리집 기준으로 하나로 합쳐줍니다.
        </p>
      </section>

      <section className="py-10">
        <p className="text-sm font-bold text-fg-brand">우리집에서 할 수 있는 일</p>
        <h2 className="mt-2 text-2xl font-bold text-fg-neutral">귀찮은 정리는 자동으로, 중요한 판단은 함께</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
          {hasPreviewData && <span className="text-sm text-fg-neutral-muted">현재 업로드된 데이터 기준</span>}
        </div>

        {hasPreviewData ? (
          <div className="mt-6 space-y-6">
            <Link href="/finance" className="block">
              <Card className="overflow-hidden p-5 transition-colors hover:bg-bg-layer-default-pressed sm:p-6">
                <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-fg-neutral">자산 현황</h3><span className="text-sm text-fg-neutral-muted">자산관리에서 자세히 보기 →</span></div>
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
            </Link>

            <Link href={`/finance/spending/monthly?month=${month}`} className="block">
              <Card className="overflow-hidden p-5 transition-colors hover:bg-bg-layer-default-pressed sm:p-6">
                <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-fg-neutral">{month} 월별 지출</h3><span className="text-sm text-fg-neutral-muted">가계부에서 자세히 보기 →</span></div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryCard label="총수입" value={monthlyIncome} format="compactKrw" />
                  <SummaryCard label="총지출" value={monthlyExpense} format="compactKrw" />
                  <SummaryCard label="당월 잔고" value={monthlyBalance} format="compactKrw" />
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
            </Link>
          </div>
        ) : (
          <Card className="mt-6 p-6 text-center shadow-none">
            <p className="font-bold text-fg-neutral">아직 보여드릴 데이터가 없어요</p>
            <p className="mt-2 text-sm text-fg-neutral-muted">뱅크샐러드 파일을 업로드하면 우리집 실제 자산과 지출 현황을 이곳에서 미리 볼 수 있어요.</p>
            <Link href="/finance/upload" className="seed-button seed-button-primary mt-5">파일 업로드하기</Link>
          </Card>
        )}
      </section>

      <section className="border-y border-stroke-neutral-muted py-10">
        <p className="text-sm font-bold text-fg-brand">사용 방법</p>
        <h2 className="mt-2 text-2xl font-bold text-fg-neutral">파일만 올리면 세 단계로 끝나요</h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <li key={number} className="flex gap-3 sm:block">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-sm font-bold text-fg-neutral-inverted">
                {number}
              </span>
              <div className="sm:mt-3">
                <h3 className="font-bold text-fg-neutral">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-fg-neutral-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-10 text-center">
        <p className="mx-auto max-w-2xl text-xl font-bold leading-8 text-fg-neutral">
          저는 게으른 사람이라서, 귀찮은 사람을 위한 서비스를 만들었어요.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-fg-neutral-muted">
          신혼부부 생활을 시작할 때 가장 어려웠던 건 자산 관리였어요. 선배 열 명에게 물어봐도 열 가지 방법이 있었고, 가계부 앱은 일일이 써야 해서 포기하게 됐습니다.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-fg-neutral-muted">
          가계부 양식을 찾으러 다니며 “블로그 댓글 입력”, “비공개 댓글입니다”, “마감되었습니다” 같은 장벽도 많이 봤어요. 그래서 필요한 사람이라면 누구나 무료로 쓸 수 있도록 공개하기로 했습니다.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-fg-neutral-muted">
          엑셀 가계부를 찾다가 직접 만들기 시작했고, 양식을 돈 주고 파는 걸 보고 더 쉽게 쓰도록 웹으로 만들었습니다. 부부가 함께 보고, 함께 관리할 수 있도록요.
        </p>
        <p className="mt-4 text-sm font-semibold text-fg-brand">앞으로도 계속 관리하고, 개발자가 꾸준히 업데이트합니다.</p>
        <Link href="/finance/upload" className="seed-button seed-button-primary mt-6 min-h-12 px-6">
          파일 업로드하기
        </Link>
      </section>
    </AppShell>
  );
}
