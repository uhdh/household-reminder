import { getDb } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
import { moveLaundrySuppliesToChores } from "@/lib/supplies-db";
import { computeChoreStatus, todayISO } from "@/lib/chores";
import { ChoreGrid, type ChoreViewModel } from "./chore-grid";
import { createChore, updateChore, completeChore, deleteChore } from "./actions";
import { AppShell, PageHeader } from "@/components/ui";

// This page reads a mutable local SQLite file and computes time-dependent
// due-date status (today's date) on every read — there's nothing to gain
// from caching it, and caching it would freeze D-day/badges/progress at
// build time.
export const dynamic = "force-dynamic";

export default async function CleaningPage() {
  const today = todayISO();
  const database = getDb();
  await moveLaundrySuppliesToChores(database);
  const rows = await getAllChores(database);

  const chores: ChoreViewModel[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    status: computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today),
  }));

  return (
    <AppShell>
        <PageHeader
          title="청소 관리"
          description="주기와 최근 완료일을 기준으로 오늘 할 일을 확인해요."
          className="mb-5"
        />
        <ChoreGrid
          chores={chores}
          completeAction={completeChore}
          createAction={createChore}
          updateAction={updateChore}
          deleteAction={deleteChore}
        />
    </AppShell>
  );
}
