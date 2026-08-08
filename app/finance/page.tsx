import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { allocationTargets, assetItems, people, uploads } from "@/lib/finance-db";
import { classifyInvestmentSector } from "@/lib/finance-parse/investment-sector";
import { buildCategoryColorMap, formatKRW, heatmapReturnColor, toNumber } from "@/lib/finance-format";
import { AnimatedNumber } from "./_components/animated-number";
import { DashboardCharts } from "./_components/charts";
import { TargetAllocationCard } from "./_components/target-allocation";
import { normalizeInvestmentProductName } from "@/lib/finance-parse/investment-utils";
import { AppShell, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const PERSON_IDS = ["husband", "wife"] as const;
type PersonId = (typeof PERSON_IDS)[number];

const PERSON_LABELS: Record<PersonId, string> = {
  husband: "남편",
  wife: "아내",
};

// 부동산/차량, 전자금융/보험 자산은 순자산 계산 및 분류에서 제외하기로 함
const EXCLUDED_ASSET_CATEGORIES = new Set(["부동산", "동산", "전자금융 자산", "보험 자산"]);
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

function isPersonId(value: string | undefined): value is PersonId {
  return !!value && (PERSON_IDS as readonly string[]).includes(value);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const { person } = await searchParams;
  const personFilter: "all" | PersonId = isPersonId(person) ? person : "all";

  const db = getDb();

  const [activeUploads, allPeople, allocationTargetRows] = await Promise.all([
    db.select().from(uploads).where(eq(uploads.isActive, true)),
    db.select().from(people),
    db.select().from(allocationTargets),
  ]);

  if (activeUploads.length === 0) {
    redirect("/finance/upload");
  }

  const targetPctByCategory = new Map(
    allocationTargetRows.map((r) => [r.category, toNumber(r.targetPct)])
  );

  const activeUploadIds = activeUploads.map((u) => u.id);
  const peopleWithData = new Set(activeUploads.map((u) => u.personId));
  const displayNameByPerson = new Map(allPeople.map((p) => [p.id, p.displayName]));

  const rawAssets = activeUploadIds.length
    ? await db.select().from(assetItems).where(inArray(assetItems.uploadId, activeUploadIds))
    : [];

  const assets = rawAssets.filter((item) => !isExcludedItem(item));

  const summary = PERSON_IDS.map((personId) => {
    const items = assets.filter((a) => a.personId === personId);
    const totalAsset = items
      .filter((i) => i.side === "asset")
      .reduce((s, i) => s + toNumber(i.amount), 0);
    const totalDebt = items
      .filter((i) => i.side === "debt")
      .reduce((s, i) => s + toNumber(i.amount), 0);
    return {
      personId,
      label: displayNameByPerson.get(personId) ?? PERSON_LABELS[personId],
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

  const debtCategoryTotals = new Map<string, number>();
  for (const item of filteredAssets) {
    if (item.side !== "debt") continue;
    const amt = toNumber(item.amount);
    debtCategoryTotals.set(item.category, (debtCategoryTotals.get(item.category) ?? 0) + amt);
  }
  const debtCategoryOrder = Array.from(debtCategoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const colorByCategory = buildCategoryColorMap([...assetCategoryOrder, ...debtCategoryOrder]);

  const assetComposition = assetCategoryOrder.map((name) => ({
    name,
    value: assetCategoryTotals.get(name) ?? 0,
    fill: colorByCategory[name],
  }));

  const debtComposition = debtCategoryOrder.map((name) => ({
    name,
    value: debtCategoryTotals.get(name) ?? 0,
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
      const key = item.productName || item.category;
      const existing = treemapByProduct.get(key);
      treemapByProduct.set(key, {
        name: key,
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
      personLabel: existing ? "공동" : (
        displayNameByPerson.get(item.personId) ?? PERSON_LABELS[item.personId as PersonId] ?? item.personId
      ).charAt(0),
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
        <PageHeader
          title="우리집 자산 대시보드"
          description="가족 자산과 부채, 투자 현황을 한눈에 확인해요."
          className="mb-5"
          action={
            <div className="flex items-center gap-4">
            <Link href="/finance/spending" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              우리집 자산흐름
            </Link>
            <Link href="/" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              홈
            </Link>
            <Link href="/finance/upload" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              파일 업로드
            </Link>
            </div>
          }
        />

        {hasAnyData && (
          <PersonFilterTabs
            current={personFilter}
            husbandLabel={displayNameByPerson.get("husband") ?? PERSON_LABELS.husband}
            wifeLabel={displayNameByPerson.get("wife") ?? PERSON_LABELS.wife}
          />
        )}

        {!hasAnyData ? (
          <div className="border-[0.8px] border-hairline bg-card p-10 text-center">
            <p className="mb-4 text-[13px] text-ink-muted">
              아직 업로드된 자산 데이터가 없습니다. 뱅크샐러드 엑셀 파일을 업로드해 주세요.
            </p>
            <Link
              href="/finance/upload"
              className="inline-block bg-legend1 px-4 py-2 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90"
            >
              파일 업로드하러 가기
            </Link>
          </div>
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
              debtComposition={debtComposition}
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
  const [husband, wife] = summary;

  if (personFilter !== "all") {
    return (
      <div className="border-[0.8px] border-hairline bg-card px-4 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-3">
          <StatItem label="순자산" value={totalNet} first accent={personFilter} />
          <StatItem label="총자산" value={totalAsset} />
          <StatItem label="총부채" value={totalDebt} />
        </div>
      </div>
    );
  }

  return (
    <div className="border-[0.8px] border-hairline bg-card px-4 py-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr_1fr_1fr_1fr]">
        <StatItem label="순자산" value={totalNet} subtext={`자산 ${formatKRW(totalAsset)}`} first />
        <StatItem label="총자산" value={totalAsset} />
        <StatItem label="총부채" value={totalDebt} />
        <StatItem
          label={`${husband.label} 순자산`}
          value={husband.net}
          subtext={husband.hasData ? undefined : "데이터 없음"}
          accent="husband"
        />
        <StatItem
          label={`${wife.label} 순자산`}
          value={wife.net}
          subtext={wife.hasData ? undefined : "데이터 없음"}
          accent="wife"
        />
      </div>
    </div>
  );
}

function PersonFilterTabs({
  current,
  husbandLabel,
  wifeLabel,
}: {
  current: "all" | PersonId;
  husbandLabel: string;
  wifeLabel: string;
}) {
  const tabs: { key: "all" | PersonId; label: string; dotColor?: string }[] = [
    { key: "all", label: "전체" },
    { key: "husband", label: husbandLabel, dotColor: "bg-husband" },
    { key: "wife", label: wifeLabel, dotColor: "bg-wife" },
  ];
  return (
    <div className="mb-4 inline-flex gap-1 border-[0.8px] border-hairline bg-card p-1">
      {tabs.map((tab) => {
        const active = tab.key === current;
        const href = tab.key === "all" ? "/finance" : `/finance?person=${tab.key}`;
        return (
          <Link
            key={tab.key}
            href={href}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? "bg-canvas text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.dotColor && <span className={`h-1.5 w-1.5 rounded-full ${tab.dotColor}`} />}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function StatItem({
  label,
  value,
  subtext,
  first,
  accent,
}: {
  label: string;
  value: number;
  subtext?: string;
  first?: boolean;
  accent?: "husband" | "wife";
}) {
  const dotColor = accent === "husband" ? "bg-husband" : accent === "wife" ? "bg-wife" : null;
  return (
    <div
      className={`py-2 ${
        first
          ? "sm:pr-4"
          : "border-t-[0.8px] border-hairline2 sm:border-l-[0.8px] sm:border-t-0 sm:px-4"
      }`}
    >
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted">
        {dotColor && <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />}
        {label}
      </p>
      <p className="text-[22px] font-bold tabular-nums text-ink sm:text-[25px]">
        <AnimatedNumber value={value} />
      </p>
      {subtext && <p className="mt-0.5 text-[11px] text-ink-muted">{subtext}</p>}
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
  return <span className={amount >= 0 ? "text-legend1" : "text-gain"}>{children}</span>;
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
    <div className="mt-4 border-[0.8px] border-hairline bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-ink">투자 손익 현황</h2>
        <span className="text-[11px] text-ink-muted">{items.length}개 종목 매칭</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] font-semibold text-ink-muted">투자원금</p>
          <p className="text-[16px] font-bold text-ink">
            <AnimatedNumber value={totals.costBasis} />
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-ink-muted">평가금액</p>
          <p className="text-[16px] font-bold text-ink">
            <AnimatedNumber value={totals.value} />
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-ink-muted">손익금액</p>
          <p className="text-[16px] font-bold">
            <GainText amount={totalGain}>
              <AnimatedNumber value={totalGain} format="signedKrw" />
            </GainText>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-ink-muted">수익률</p>
          <p className="text-[16px] font-bold">
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
                <td className="py-2 pr-2 text-ink-muted">{i.personLabel}</td>
                <td className="py-2 pr-3 text-ink">{i.productName}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-muted">{formatKRW(i.costBasis)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink">{formatKRW(i.value)}</td>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                  <GainText amount={i.gain}>
                    {i.gain >= 0 ? "+" : ""}
                    {formatKRW(i.gain)}
                  </GainText>
                </td>
                <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                  <GainText amount={i.gainPct}>
                    {i.gainPct >= 0 ? "+" : ""}
                    {i.gainPct.toFixed(1)}%
                  </GainText>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
