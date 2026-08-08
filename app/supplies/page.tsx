import { getDb } from "@/lib/db";
import { getAllSupplies, moveLaundrySuppliesToChores } from "@/lib/supplies-db";
import { computeSupplyStatus } from "@/lib/supplies";
import { todayISO } from "@/lib/chores";
import { SupplyGrid, type SupplyViewModel } from "./supply-grid";
import { completeSupply, completeSupplies } from "./actions";
import { AppShell, PageHeader } from "@/components/ui";

// Same reasoning as /cleaning: due-date status depends on today's date and a
// mutable local sqlite file, so caching this page would freeze badges/progress
// at build time.
export const dynamic = "force-dynamic";

export default async function SuppliesPage() {
  const today = todayISO();
  const database = getDb();
  await moveLaundrySuppliesToChores(database);
  const rows = await getAllSupplies(database);

  const supplies: SupplyViewModel[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    icon: row.icon,
    status: computeSupplyStatus(row.last_done_at, row.cycle_days, today),
  }));

  return (
    <AppShell>
        <PageHeader
          title="생필품 관리"
          description="교체 주기와 남은 날짜를 한눈에 확인해요."
          className="mb-5"
        />
        <SupplyGrid supplies={supplies} completeAction={completeSupply} bulkCompleteAction={completeSupplies} />
    </AppShell>
  );
}
