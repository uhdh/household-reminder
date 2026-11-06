import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetItems, uploads } from "@/lib/finance-db";
import { toNumber } from "@/lib/finance-format";
import { isExcludedItem } from "@/lib/asset-scope";
import { currentMonthStartKst } from "@/lib/completed-months";
import { resolveFinanceViewer } from "@/lib/require-household";
import { countsInTotals, flowLabel, getActiveTransactionsInRange, toNum } from "@/lib/spending-queries";
import { AppShell } from "@/components/ui";
import { DemoBanner } from "../_components/demo-banner";
import { PlanView } from "./plan-view";

export const dynamic = "force-dynamic";

function monthsBefore(monthStart: string, n: number): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

export default async function PlanPage() {
  const { householdId, readOnly, personId } = await resolveFinanceViewer();
  const db = getDb();

  // 지금 순자산: 자산관리 화면과 같은 기준(활성 업로드의 자산 - 부채, 제외 항목 빼고).
  const activeUploads = await db.select({ id: uploads.id }).from(uploads).where(and(eq(uploads.householdId, householdId), eq(uploads.isActive, true)));
  const items = activeUploads.length
    ? await db.select().from(assetItems).where(and(eq(assetItems.householdId, householdId), inArray(assetItems.uploadId, activeUploads.map((u) => u.id))))
    : [];
  const netWorth = items
    .filter((i) => !isExcludedItem(i))
    .reduce((sum, i) => sum + (i.side === "asset" ? 1 : -1) * toNumber(i.amount), 0);

  // 연 저축 가능액: 진행 중인 이번 달을 뺀 최근 12개월의 (수입 - 지출). 데이터가 12개월이 안 되면 있는 달로 연환산한다.
  const to = currentMonthStartKst();
  const { transactions } = await getActiveTransactionsInRange(householdId, monthsBefore(to, 12), to, personId);
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

  return (
    <AppShell size="wide" className="font-office text-ink">
      {readOnly && <DemoBanner />}
      <PlanView
        netWorth={netWorth}
        annualIncome={annualize(income)}
        annualExpense={annualize(expense)}
        monthCount={monthCount}
      />
    </AppShell>
  );
}
