import { getDb } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
import { computeSupplyStatus } from "@/lib/supplies";
import { todayISO } from "@/lib/chores";
import { SupplyGrid, type SupplyViewModel } from "./supply-grid";
import { completeSupply } from "./actions";

// Same reasoning as /cleaning: due-date status depends on today's date and a
// mutable local sqlite file, so caching this page would freeze badges/progress
// at build time.
export const dynamic = "force-dynamic";

export default async function SuppliesPage() {
  const today = todayISO();
  const rows = await getAllSupplies(getDb());

  const supplies: SupplyViewModel[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    icon: row.icon,
    status: computeSupplyStatus(row.last_done_at, row.cycle_days, today),
  }));

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="mb-4 text-xl font-bold">생필품 관리</h1>
        <SupplyGrid supplies={supplies} completeAction={completeSupply} />
      </main>
    </div>
  );
}
