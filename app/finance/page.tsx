import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { allocationTargets, assetItems, uploads } from "@/lib/finance-db";
import { classifyInvestmentSector } from "@/lib/finance-parse/investment-sector";
import { buildCategoryColorMap, formatManwon, formatSignedPct, heatmapReturnColor, toNumber } from "@/lib/finance-format";
import { AnimatedNumber } from "./_components/animated-number";
import { SummaryCard } from "./_components/summary-card";
import { DashboardCharts } from "./_components/charts";
import { TargetAllocationCard } from "./_components/target-allocation";
import { normalizeInvestmentProductName } from "@/lib/finance-parse/investment-utils";
import { AppShell } from "@/components/ui";
import { FinanceEmptyState } from "./_components/empty-state";
import { DemoFinanceDashboard } from "./_components/demo-pages";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";
import { requireHouseholdOrOnboard } from "@/lib/require-household";
import { getHouseholdPeople, isPersonId, type PersonId } from "@/lib/spending-queries";

export const dynamic = "force-dynamic";

// 부동산/차량, 전자금융/보험 자산은 순자산 계산 및 분류에서 제외하기로 함
const EXCLUDED_ASSET_CATEGORIES = new Set(["부동산", "동산", "전자금융 자산", "보험 자산"]);
// 기존 우리집 한정 예외 규칙(특정 대출 상품). 새 가구에는 해당 personId/상품명 조합이 없어 그냥 무시된다.
const EXCLUDED_DEBT_ITEMS = [{ personId: "husband", productName: "분양주택입주잔금대출" }];

// 뱅크샐러드 원본 카테고리를 대시보드 표시용으로 재분류: 입출금 통장은 현금, 예적금 통장은 예적금으로 묶는다
const CATEGORY_DISPLAY_OVERRIDES: Record<string, string> = {
  "자유입출금 자산": "현금",
  "현금 자산": "현금",
  "저축성 자산": "예적금",
};
function displayAssetCategory(category: string) {
  return CATEGORY_DISPLAY_OVERRIDES[category] ?? category;
}

function isCashLikeAsset(item: { category: string; productName: string | null; sector?: string | null }) {
  const category = displayAssetCategory(item.category);
  if (category === "현금" || item.sector === "현금성") return true;

  const productName = item.productName ?? "";
  return /(CMA|MMF|입출금|보통예금|요구불|파킹통장)/i.test(productName);
}

function isExcludedItem(item: { side: string; personId: string; category: string; productName: string | null }) {
  if (item.side === "asset") return EXCLUDED_ASSET_CATEGORIES.has(item.category);
  return EXCLUDED_DEBT_ITEMS.some((e) => e.personId === item.personId && e.productName === item.productName);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const { person } = await searchParams;

  if (await isFinanceDemoMode()) {
    const personFilter: "all" | PersonId = person === "husband" || person === "wife" ? person : "all";
    return <DemoFinanceDashboard personFilter={personFilter} />;
  }

  const { householdId } = await requireHouseholdOrOnboard();
  const db = getDb();

  const [activeUploads, allocationTargetRows, householdPeople] = await Promise.all([
    db.select().from(uploads).where(and(eq(uploads.householdId, householdId), eq(uploads.isActive, true))),
    db.select().from(allocationTargets).where(eq(allocationTargets.householdId, householdId)),
    getHouseholdPeople(householdId),
  ]);
  const personIds = householdPeople.map((p) => p.id);
  const personFilter: "all" | PersonId = isPersonId(person, personIds) ? person : "all";

  if (activeUploads.length === 0) {
    redirect("/finance/upload");
  }

  const targetPctByCategory = new Map(
    allocationTargetRows.map((r) => [r.category, toNumber(r.targetPct)])
  );

  const activeUploadIds = activeUploads.map((u) => u.id);
  const peopleWithData = new Set(activeUploads.map((u) => u.personId));
  const displayNameByPerson = new Map<string, string>(householdPeople.map((p) => [p.id, p.displayName]));

  const rawAssets = activeUploadIds.length
    ? await db.select().from(assetItems).where(and(eq(assetItems.householdId, householdId), inArray(assetItems.uploadId, activeUploadIds)))
    : [];

  const assets = rawAssets.filter((item) => !isExcludedItem(item));

  const summary = householdPeople.map(({ id: personId }) => {
    const items = assets.filter((a) => a.personId === personId);
    const totalAsset = items
      .filter((i) => i.side === "asset")
      .reduce((s, i) => s + toNumber(i.amount), 0);
    const totalDebt = items
      .filter((i) => i.side === "debt")
      .reduce((s, i) => s + toNumber(i.amount), 0);
    return {
      personId,
      label: displayNameByPerson.get(personId) ?? personId,
      hasData: peopleWithData.has(personId),
      totalAsset,
      totalDebt,
      net: totalAsset - totalDebt,
    };
  });

  const filteredAssets = personFilter === "all" ? assets : assets.filter((a) => a.personId === personFilter);

  const totalAsset = filteredAssets
    .filter((i) => i.side === "asset")
    .reduce((s, i) => s + toNumber(i.amount), 0);
  const totalDebt = filteredAssets
    .filter((i) => i.side === "debt")
    .reduce((s, i) => s + toNumber(i.amount), 0);
  const totalNet = totalAsset - totalDebt;

  const assetCategoryTotals = new Map<string, number>();
  for (const item of filteredAssets) {
    if (item.side !== "asset") continue;
    const amt = toNumber(item.amount);
    const cat = isCashLikeAsset(item) ? "현금" : displayAssetCategory(item.category);
    assetCategoryTotals.set(cat, (assetCategoryTotals.get(cat) ?? 0) + amt);
  }
  const assetCategoryOrder = Array.from(assetCategoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const colorByCategory = buildCategoryColorMap(assetCategoryOrder);

  const assetComposition = assetCategoryOrder.map((name) => ({
    name,
    value: assetCategoryTotals.get(name) ?? 0,
    fill: colorByCategory[name],
  }));

  const allocationRows = assetCategoryOrder.map((name) => {
    const currentPct = totalAsset > 0 ? ((assetCategoryTotals.get(name) ?? 0) / totalAsset) * 100 : 0;
    return {
      category: name,
      fill: colorByCategory[name],
      currentPct,
      targetPct: targetPctByCategory.get(name) ?? currentPct,
    };
  });

  const TREEMAP_MAX_ITEMS = 20;
  // 현금/예적금 계좌는 계좌별로 쪼개지 않고 카테고리 단위로 합산해서 히트맵 한 칸으로 보여준다
  const TREEMAP_AGGREGATED_CATEGORIES = new Set(["현금", "예적금"]);
  const treemapAggregatedTotals = new Map<string, number>();
  const treemapDetailItems: { name: string; value: number; fill: string; returnPct: number | null; sharePct: number }[] = [];
  const treemapByProduct = new Map<string, { name: string; value: number; costBasis: number | null }>();
  for (const item of filteredAssets) {
    if (item.side !== "asset") continue;
    const amt = toNumber(item.amount);
    if (amt <= 0) continue;
    const cat = isCashLikeAsset(item) ? "현금" : displayAssetCategory(item.category);
    if (TREEMAP_AGGREGATED_CATEGORIES.has(cat)) {
      treemapAggregatedTotals.set(cat, (treemapAggregatedTotals.get(cat) ?? 0) + amt);
    } else {
      const costBasis = item.costBasis !== null ? toNumber(item.costBasis) : null;
      const rawName = item.productName || item.category;
      const key = normalizeInvestmentProductName(rawName);
      const existing = treemapByProduct.get(key);
      treemapByProduct.set(key, {
        name: existing?.name ?? rawName,
        value: (existing?.value ?? 0) + amt,
        costBasis:
          existing?.costBasis !== null && existing?.costBasis !== undefined && costBasis !== null
            ? existing.costBasis + costBasis
            : existing?.costBasis ?? costBasis,
      });
    }
  }
  for (const item of treemapByProduct.values()) {
    const returnPct = item.costBasis !== null && item.costBasis !== 0 ? ((item.value - item.costBasis) / item.costBasis) * 100 : null;
    treemapDetailItems.push({
      name: item.name,
      value: item.value,
      fill: heatmapReturnColor(returnPct),
      returnPct,
      sharePct: totalAsset > 0 ? (item.value / totalAsset) * 100 : 0,
    });
  }
  const rawTreemapItems = [
    ...Array.from(treemapAggregatedTotals.entries()).map(([name, value]) => ({
      name,
      value,
      fill: heatmapReturnColor(null),
      returnPct: null as number | null,
      sharePct: totalAsset > 0 ? (value / totalAsset) * 100 : 0,
    })),
    ...treemapDetailItems,
  ].sort((a, b) => b.value - a.value);

  const treemapData =
    rawTreemapItems.length > TREEMAP_MAX_ITEMS
      ? [
          ...rawTreemapItems.slice(0, TREEMAP_MAX_ITEMS),
          {
            name: `기타 ${rawTreemapItems.length - TREEMAP_MAX_ITEMS}건`,
            value: rawTreemapItems.slice(TREEMAP_MAX_ITEMS).reduce((s, i) => s + i.value, 0),
            fill: heatmapReturnColor(null),
            returnPct: null as number | null,
            sharePct: totalAsset > 0 ? (rawTreemapItems.slice(TREEMAP_MAX_ITEMS).reduce((s, i) => s + i.value, 0) / totalAsset) * 100 : 0,
          },
        ]
      : rawTreemapItems;

  const investmentByProduct = new Map<string, { id: string; productName: string; personLabel: string; sector: string | null; costBasis: number; value: number }>();
  for (const item of filteredAssets.filter((item) => item.side === "asset" && item.costBasis !== null)) {
    const costBasis = toNumber(item.costBasis!);
    const value = toNumber(item.amount);
    const productName = item.productName ?? item.category;
    const productKey = normalizeInvestmentProductName(productName);
    const existing = investmentByProduct.get(productKey);
    investmentByProduct.set(productKey, {
      id: existing?.id ?? item.id,
      productName,
      personLabel: existing ? "공동" : (displayNameByPerson.get(item.personId) ?? item.personId),
      sector: existing?.sector ?? item.sector ?? classifyInvestmentSector(productName),
      costBasis: (existing?.costBasis ?? 0) + costBasis,
      value: (existing?.value ?? 0) + value,
    });
  }
  const investmentItems = Array.from(investmentByProduct.values()).map((item) => {
      const gain = item.value - item.costBasis;
      return {
        id: item.id,
        productName: item.productName,
        personLabel: item.personLabel,
        sector: item.sector,
        costBasis: item.costBasis,
        value: item.value,
        gain,
        gainPct: item.costBasis !== 0 ? (gain / item.costBasis) * 100 : 0,
      };
    })
    .sort((a, b) => b.value - a.value);

  const investmentTotals = investmentItems.reduce(
    (acc, i) => ({ costBasis: acc.costBasis + i.costBasis, value: acc.value + i.value }),
    { costBasis: 0, value: 0 }
  );
  const investmentTotalGain = investmentTotals.value - investmentTotals.costBasis;
  const investmentTotalGainPct =
    investmentTotals.costBasis !== 0 ? (investmentTotalGain / investmentTotals.costBasis) * 100 : 0;

  const sectorTotals = new Map<string, number>();
  for (const item of investmentItems) {
    if (!item.sector) continue;
    sectorTotals.set(item.sector, (sectorTotals.get(item.sector) ?? 0) + item.value);
  }
  const sectorOrder = Array.from(sectorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const colorBySector = buildCategoryColorMap(sectorOrder);
  const sectorComposition = sectorOrder.map((name) => ({
    name,
    value: sectorTotals.get(name) ?? 0,
    fill: colorBySector[name],
  }));

  const hasAnyData = activeUploads.length > 0;

  return (
    <AppShell size="wide" className="font-office text-ink">
        {hasAnyData && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <PersonFilterTabs current={personFilter} people={householdPeople.map((p) => ({ id: p.id, label: displayNameByPerson.get(p.id) ?? p.displayName }))} />
            <span className="text-[11px] text-ink-muted">단위: 만원</span>
          </div>
        )}

        {!hasAnyData ? (
          <FinanceEmptyState secondaryHref="/finance/spending#manual-entry" secondaryLabel="직접 입력하기" />
        ) : (
          <>
            <HeroRow
              personFilter={personFilter}
              summary={summary}
              totalAsset={totalAsset}
              totalDebt={totalDebt}
              totalNet={totalNet}
            />

            <DashboardCharts
              assetComposition={assetComposition}
              treemapData={treemapData}
              sectorComposition={sectorComposition}
            />

            <div className="mt-4">
              <TargetAllocationCard rows={allocationRows} totalAsset={totalAsset} personFilter={personFilter} />
            </div>

            {investmentItems.length > 0 && (
              <InvestmentPnlCard
                items={investmentItems}
                totals={investmentTotals}
                totalGain={investmentTotalGain}
                totalGainPct={investmentTotalGainPct}
              />
            )}
          </>
        )}
    </AppShell>
  );
}

function HeroRow({
  personFilter,
  summary,
  totalAsset,
  totalDebt,
  totalNet,
}: {
  personFilter: "all" | PersonId;
  summary: { personId: PersonId; label: string; hasData: boolean; totalAsset: number; totalDebt: number; net: number }[];
  totalAsset: number;
  totalDebt: number;
  totalNet: number;
}) {
  if (personFilter !== "all") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <SummaryCard variant="feature" className="col-span-2 lg:col-span-1" label="순자산" value={totalNet} format="manwon" />
        <SummaryCard label="총자산" value={totalAsset} format="manwon" />
        <SummaryCard label="총부채" value={totalDebt} format="manwon" />
      </div>
    );
  }

  // 기존 우리집(정확히 2인)은 화면을 그대로 유지한다. 1인/3인 이상은 일반 레이아웃으로 대응.
  if (summary.length === 2) {
    const [first, second] = summary;
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1.4fr_1fr_1fr]">
        <SummaryCard variant="feature" className="col-span-2 lg:col-span-1" label="우리집 자산" value={totalNet} format="manwon" breakdown={[{ label: "자산", value: totalAsset }, { label: "부채", value: totalDebt }]} />
        <SummaryCard label={`${first.label} 순자산`} value={first.net} format="manwon" />
        <SummaryCard label={`${second.label} 순자산`} value={second.net} format="manwon" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <SummaryCard
        variant="feature"
        className="col-span-2"
        label="우리집 자산"
        value={totalNet}
        format="manwon"
        breakdown={[{ label: "자산", value: totalAsset }, { label: "부채", value: totalDebt }]}
      />
      {summary.map((s) => (
        <SummaryCard key={s.personId} label={`${s.label} 순자산`} value={s.net} format="manwon" />
      ))}
    </div>
  );
}

function PersonFilterTabs({ current, people }: { current: "all" | PersonId; people: { id: string; label: string }[] }) {
  // 1인 가구는 필터를 보여줄 이유가 없다(늘 "전체"와 같은 결과).
  if (people.length <= 1) return null;

  const tabs: { key: "all" | PersonId; label: string }[] = [{ key: "all", label: "전체" }, ...people.map((p) => ({ key: p.id, label: p.label }))];
  return (
    <div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1">
      {tabs.map((tab) => {
        const active = tab.key === current;
        const href = tab.key === "all" ? "/finance" : `/finance?person=${tab.key}`;
        return (
          <Link
            key={tab.key}
            href={href}
            className={`flex h-9 items-center gap-1.5 rounded-r2 px-4 text-[14px] transition-colors ${
              active ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-ink-muted hover:text-ink"
            }`}
          >
            {/* 기존 우리집(husband/wife)은 점 색깔을 그대로 유지, 새 가구 구성원은 점 없이 */}
            {tab.key === "husband" && <span className="h-1.5 w-1.5 rounded-full bg-husband" />}
            {tab.key === "wife" && <span className="h-1.5 w-1.5 rounded-full bg-wife" />}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

type InvestmentItem = {
  id: string;
  productName: string;
  personLabel: string;
  costBasis: number;
  value: number;
  gain: number;
  gainPct: number;
};

function GainText({ amount, children }: { amount: number; children: React.ReactNode }) {
  return <span className={amount >= 0 ? "text-fg-positive" : "text-fg-critical"}>{children}</span>;
}

function InvestmentPnlCard({
  items,
  totals,
  totalGain,
  totalGainPct,
}: {
  items: InvestmentItem[];
  totals: { costBasis: number; value: number };
  totalGain: number;
  totalGainPct: number;
}) {
  return (
    <div className="seed-card mt-4 p-5 shadow-none sm:p-7">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[18px] font-extrabold text-ink">투자 손익 현황</h2>
        <span className="text-[12px] text-ink-muted">{items.length}개 종목 매칭</span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-r3 bg-bg-neutral-weak p-4">
          <p className="text-[13px] text-ink-muted">투자원금</p>
          <p className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            <AnimatedNumber value={totals.costBasis} format="manwon" />
          </p>
        </div>
        <div className="rounded-r3 bg-bg-neutral-weak p-4">
          <p className="text-[13px] text-ink-muted">평가금액</p>
          <p className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            <AnimatedNumber value={totals.value} format="manwon" />
          </p>
        </div>
        <div className="rounded-r3 bg-bg-neutral-weak p-4">
          <p className="text-[13px] text-ink-muted">손익금액</p>
          <p className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em]">
            <GainText amount={totalGain}>
              <AnimatedNumber value={totalGain} format="signedManwon" />
            </GainText>
          </p>
        </div>
        <div className="rounded-r3 bg-bg-neutral-weak p-4">
          <p className="text-[13px] text-ink-muted">수익률</p>
          <p className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em]">
            <GainText amount={totalGainPct}>
              <AnimatedNumber value={totalGainPct} format="signedPct" />
            </GainText>
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
              <th className="w-8 py-2 pr-2 text-[11px] font-semibold">보유</th>
              <th className="py-2 pr-3 text-[11px] font-semibold">종목</th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold">투자원금</th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold">평가금액</th>
              <th className="py-2 pr-3 text-right text-[11px] font-semibold">손익금액</th>
              <th className="py-2 pl-3 text-right text-[11px] font-semibold">수익률</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                <td className={`py-2 pr-2 font-semibold ${i.personLabel === "남편" ? "text-husband" : i.personLabel === "아내" ? "text-wife" : "text-ink-muted"}`}>{i.personLabel}</td>
                <td className="py-2 pr-3 text-ink">{i.productName}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-muted">{formatManwon(i.costBasis)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{formatManwon(i.value)}</td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                  <GainText amount={i.gain}>
                    {i.gain >= 0 ? "+" : ""}
                    {formatManwon(i.gain)}
                  </GainText>
                </td>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                  <GainText amount={i.gainPct}>{formatSignedPct(i.gainPct)}</GainText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
