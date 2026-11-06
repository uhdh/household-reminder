import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetItems, depositRates, planSettings, uploads } from "@/lib/finance-db";
import { toNumber } from "@/lib/finance-format";
import { assetClassOf, isExcludedItem } from "@/lib/asset-scope";
import { currentMonthStartKst } from "@/lib/completed-months";
import { monthlyNetWorth } from "@/lib/net-worth-history";
import { DEFAULT_PLAN_SETTINGS, sanitizePlanSettings } from "@/lib/plan-settings";
import { resolveFinanceViewer } from "@/lib/require-household";
import { countsInTotals, flowLabel, getActiveTransactionsInRange, getHouseholdPeople, toNum } from "@/lib/spending-queries";
import { AppShell } from "@/components/ui";
import { DemoBanner } from "../_components/demo-banner";
import { PlanView, type PlanDebt } from "./plan-view";

export const dynamic = "force-dynamic";

function monthsBefore(monthStart: string, n: number): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** 아직 마이그레이션 전이라 테이블이 없으면(42P01) 빈 결과로 본다. 다른 오류는 그대로 던진다. */
function emptyIfMissingTable<T>(error: unknown): T[] {
  const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  if (code === "42P01") return [];
  throw error;
}

export default async function PlanPage() {
  const { householdId, readOnly, personId } = await resolveFinanceViewer();
  const db = getDb();

  const monthStart = currentMonthStartKst();
  const [allUploads, allItems, people, rateRows, savedRows, { transactions }] = await Promise.all([
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
    db.select().from(assetItems).where(eq(assetItems.householdId, householdId)),
    getHouseholdPeople(householdId),
    db.select().from(depositRates).where(eq(depositRates.householdId, householdId)).catch(emptyIfMissingTable<typeof depositRates.$inferSelect>),
    db.select().from(planSettings).where(eq(planSettings.householdId, householdId)).catch(emptyIfMissingTable<typeof planSettings.$inferSelect>),
    getActiveTransactionsInRange(householdId, monthsBefore(monthStart, 12), monthStart, personId),
  ]);
  const items = allItems.filter((i) => !isExcludedItem(i));
  const signed = (i: (typeof items)[number]) => (i.side === "asset" ? 1 : -1) * toNumber(i.amount);

  // 지금 자산: 자산관리 화면과 같은 기준(활성 업로드, 제외 항목 빼고).
  const activeIds = new Set(allUploads.filter((u) => u.isActive).map((u) => u.id));
  const active = items.filter((i) => activeIds.has(i.uploadId));
  const label = new Map(people.map((p) => [p.id, p.displayName]));
  const classWeights = { cash: 0, deposit: 0, invest: 0, other: 0 };
  for (const i of active) if (i.side === "asset") classWeights[assetClassOf(i)] += toNumber(i.amount);
  const grossAssets = Object.values(classWeights).reduce((s, v) => s + v, 0);
  const debts: PlanDebt[] = active
    .filter((i) => i.side === "debt" && toNumber(i.amount) > 0)
    .map((i) => ({ key: `${i.personId}|${i.productName}`, name: i.productName ?? "대출", personLabel: label.get(i.personId) ?? i.personId, balance: toNumber(i.amount) }));

  // 예적금 수익률 기본값: 입력해 둔 계좌 금리를 금액으로 가중 평균.
  const rateByKey = new Map(rateRows.map((r) => [`${r.personId}|${r.productName}`, toNumber(r.ratePct)]));
  let rated = 0;
  let ratedSum = 0;
  for (const i of active) {
    const rate = rateByKey.get(`${i.personId}|${i.productName}`);
    if (i.side !== "asset" || assetClassOf(i) !== "deposit" || rate === undefined) continue;
    rated += toNumber(i.amount);
    ratedSum += toNumber(i.amount) * rate;
  }
  const depositRateHint = rated > 0 ? Math.round((ratedSum / rated) * 100) / 100 : null;

  // 실제 순자산 흐름: 업로드마다 남은 자산 스냅샷(올린 날짜 기준).
  const netByUpload = new Map<string, number>();
  for (const i of items) netByUpload.set(i.uploadId, (netByUpload.get(i.uploadId) ?? 0) + signed(i));
  const history = monthlyNetWorth(
    allUploads
      .filter((u) => netByUpload.has(u.id))
      .map((u) => ({ personId: u.personId, date: u.uploadedAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), net: netByUpload.get(u.id)! })),
    monthStart.slice(0, 7)
  );

  // 연 저축 가능액: 진행 중인 이번 달을 뺀 최근 12개월의 (수입 - 지출). 12개월이 안 되면 있는 달로 연환산한다.
  let income = 0;
  let expense = 0;
  const months = new Set<string>();
  for (const t of transactions) {
    if (!countsInTotals(t)) continue;
    months.add(t.txnDate.slice(0, 7));
    const amount = Math.abs(toNum(t.amount));
    if (flowLabel(t) === "입금") income += amount;
    else expense += amount;
  }
  const monthCount = months.size;
  const annualize = (v: number) => (monthCount > 0 ? (v / monthCount) * 12 : 0);

  const saved = savedRows[0];
  return (
    <AppShell size="wide" className="font-office text-ink">
      {readOnly && <DemoBanner />}
      <PlanView
        grossAssets={grossAssets}
        classWeights={classWeights}
        debts={debts}
        annualIncome={annualize(income)}
        annualExpense={annualize(expense)}
        monthCount={monthCount}
        history={history}
        depositRateHint={depositRateHint}
        initialSettings={saved ? sanitizePlanSettings(saved.data) : DEFAULT_PLAN_SETTINGS}
        savedAt={saved ? saved.updatedAt.toISOString() : null}
        readOnly={readOnly}
      />
    </AppShell>
  );
}
