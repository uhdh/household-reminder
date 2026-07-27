import { getDb, getAllChores } from "@/lib/db";
import { computeChoreStatus, todayISO } from "@/lib/chores";
import { ChoreGrid, type ChoreViewModel } from "./chore-grid";
import { createChore, updateChore, completeChore, deleteChore } from "./actions";

export default function CleaningPage() {
  const today = todayISO();
  const rows = getAllChores(getDb());

  const chores: ChoreViewModel[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    status: computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today),
  }));

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold">청소 관리</h1>
      <ChoreGrid
        chores={chores}
        completeAction={completeChore}
        createAction={createChore}
        updateAction={updateChore}
        deleteAction={deleteChore}
      />
    </main>
  );
}
