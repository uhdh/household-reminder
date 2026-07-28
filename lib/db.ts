import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { IntervalUnit } from "./chores";
import type { SupplyCategory } from "./supplies";
import { todayISO } from "./chores";

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

export type SupplyRow = {
  id: number;
  category: SupplyCategory;
  name: string;
  icon: string;
  cycle_days: number;
  last_done_at: string;
  sort_order: number;
};

type SupplyCatalogEntry = {
  category: SupplyCategory;
  name: string;
  icon: string;
  cycleDays: number;
};

const SUPPLY_CATALOG: SupplyCatalogEntry[] = [
  { category: "bathroom", name: "칫솔", icon: "🪥", cycleDays: 90 },
  { category: "bathroom", name: "면도기", icon: "🪒", cycleDays: 14 },
  { category: "bathroom", name: "샤워볼", icon: "🧽", cycleDays: 30 },
  { category: "bathroom", name: "수건", icon: "🏖️", cycleDays: 365 },
  { category: "bathroom", name: "변기솔", icon: "🪠", cycleDays: 180 },
  { category: "kitchen", name: "수세미", icon: "🧽", cycleDays: 14 },
  { category: "kitchen", name: "주방스펀지", icon: "🫧", cycleDays: 14 },
  { category: "kitchen", name: "행주", icon: "🧣", cycleDays: 30 },
  { category: "kitchen", name: "고무장갑", icon: "🧤", cycleDays: 60 },
  { category: "kitchen", name: "도마", icon: "🟫", cycleDays: 365 },
  { category: "kitchen", name: "전기포트", icon: "🫖", cycleDays: 730 },
  { category: "bedroom", name: "베개솜", icon: "☁️", cycleDays: 365 },
  { category: "bedroom", name: "베개커버(세탁)", icon: "🧺", cycleDays: 7 },
  { category: "bedroom", name: "이불(세탁)", icon: "🛌", cycleDays: 30 },
  { category: "bedroom", name: "매트리스", icon: "🛏️", cycleDays: 1825 },
  { category: "bedroom", name: "커튼(세탁)", icon: "🧵", cycleDays: 90 },
  { category: "bedroom", name: "향수", icon: "🌸", cycleDays: 730 },
  { category: "appliance", name: "멀티탭", icon: "🔌", cycleDays: 1095 },
  { category: "appliance", name: "공기청정기 필터", icon: "🌬️", cycleDays: 180 },
  { category: "appliance", name: "에어컨 필터", icon: "❄️", cycleDays: 14 },
  { category: "appliance", name: "세탁기 필터", icon: "💦", cycleDays: 90 },
];

function seedSuppliesIfEmpty(database: DatabaseSync): void {
  const { count } = database.prepare("SELECT COUNT(*) as count FROM supplies").get() as {
    count: number;
  };
  if (count > 0) return;
  const today = todayISO();
  const insert = database.prepare(
    "INSERT INTO supplies (category, name, icon, cycle_days, last_done_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  SUPPLY_CATALOG.forEach((entry, index) => {
    insert.run(entry.category, entry.name, entry.icon, entry.cycleDays, today, index);
  });
}

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
  database.exec(`
    CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK (category IN ('bathroom', 'kitchen', 'bedroom', 'appliance')),
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      last_done_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);
  seedSuppliesIfEmpty(database);
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

export function getAllSupplies(database: DatabaseSync): SupplyRow[] {
  return database.prepare("SELECT * FROM supplies ORDER BY sort_order").all() as unknown as SupplyRow[];
}

export function completeSupplyRow(database: DatabaseSync, id: number, doneDateISO: string): void {
  database.prepare("UPDATE supplies SET last_done_at = ? WHERE id = ?").run(doneDateISO, id);
}
