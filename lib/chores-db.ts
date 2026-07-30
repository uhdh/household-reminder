import { asc, eq, sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import type { IntervalUnit } from "./chores";
import type { AppDb } from "./db";

export const chores = pgTable(
  "chores",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: text("interval_unit").notNull(),
    lastDoneAt: text("last_done_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "chores_interval_unit_check",
      sql`${table.intervalUnit} IN ('day', 'week', 'month')`,
    ),
  ],
);

export type ChoreRow = {
  id: number;
  name: string;
  icon: string;
  interval_value: number;
  interval_unit: IntervalUnit;
  last_done_at: string | null;
  created_at: string;
};

export type ChoreInput = {
  name: string;
  icon: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

function toRow(row: typeof chores.$inferSelect): ChoreRow {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    interval_value: row.intervalValue,
    interval_unit: row.intervalUnit as IntervalUnit,
    last_done_at: row.lastDoneAt,
    created_at: row.createdAt,
  };
}

export async function initChoresSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS chores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month')),
      last_done_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

export async function getAllChores(database: AppDb): Promise<ChoreRow[]> {
  const rows = await database.select().from(chores).orderBy(asc(chores.id));
  return rows.map(toRow);
}

export async function insertChore(
  database: AppDb,
  input: ChoreInput,
): Promise<ChoreRow> {
  const [row] = await database
    .insert(chores)
    .values({
      name: input.name,
      icon: input.icon,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
      lastDoneAt: null,
      createdAt: new Date().toISOString(),
    })
    .returning();

  return toRow(row);
}

export async function updateChoreRow(
  database: AppDb,
  id: number,
  input: ChoreInput,
): Promise<void> {
  await database
    .update(chores)
    .set({
      name: input.name,
      icon: input.icon,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
    })
    .where(eq(chores.id, id));
}

export async function completeChoreRow(
  database: AppDb,
  id: number,
  doneDateISO: string,
): Promise<void> {
  await database
    .update(chores)
    .set({ lastDoneAt: doneDateISO })
    .where(eq(chores.id, id));
}

export async function deleteChoreRow(database: AppDb, id: number): Promise<void> {
  await database.delete(chores).where(eq(chores.id, id));
}
