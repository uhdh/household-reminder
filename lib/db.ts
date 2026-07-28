import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { IntervalUnit } from "./chores";

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

function resolveDbPath(): string {
  return process.env.APP_DB_PATH ?? path.join(process.cwd(), "data", "db.sqlite");
}

let dbInstance: DatabaseSync | null = null;
let testOverride: DatabaseSync | null = null;

export function initSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month')),
      last_done_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

export function getDb(): DatabaseSync {
  if (testOverride) return testOverride;
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    dbInstance = new DatabaseSync(dbPath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function setDbForTesting(database: DatabaseSync | null): void {
  testOverride = database;
}

export function getAllChores(database: DatabaseSync): ChoreRow[] {
  return database.prepare("SELECT * FROM chores ORDER BY id").all() as unknown as ChoreRow[];
}

export function insertChore(database: DatabaseSync, input: ChoreInput): ChoreRow {
  const createdAt = new Date().toISOString();
  const info = database
    .prepare(
      "INSERT INTO chores (name, icon, interval_value, interval_unit, last_done_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
    )
    .run(input.name, input.icon, input.intervalValue, input.intervalUnit, createdAt);
  return database
    .prepare("SELECT * FROM chores WHERE id = ?")
    .get(info.lastInsertRowid) as unknown as ChoreRow;
}

export function updateChoreRow(database: DatabaseSync, id: number, input: ChoreInput): void {
  database
    .prepare("UPDATE chores SET name = ?, icon = ?, interval_value = ?, interval_unit = ? WHERE id = ?")
    .run(input.name, input.icon, input.intervalValue, input.intervalUnit, id);
}

export function completeChoreRow(database: DatabaseSync, id: number, doneDateISO: string): void {
  database.prepare("UPDATE chores SET last_done_at = ? WHERE id = ?").run(doneDateISO, id);
}

export function deleteChoreRow(database: DatabaseSync, id: number): void {
  database.prepare("DELETE FROM chores WHERE id = ?").run(id);
}
