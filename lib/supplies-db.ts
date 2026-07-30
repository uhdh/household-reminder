import { asc, eq, inArray, sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import type { SupplyCategory } from "./supplies";
import { todayISO } from "./chores";
import { chores } from "./chores-db";
import type { AppDb } from "./db";

export const supplies = pgTable(
  "supplies",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    cycleDays: integer("cycle_days").notNull(),
    lastDoneAt: text("last_done_at").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    check(
      "supplies_category_check",
      sql`${table.category} IN ('bathroom', 'kitchen', 'bedroom', 'appliance')`,
    ),
  ],
);

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

async function seedSuppliesIfEmpty(database: AppDb): Promise<void> {
  const [{ count }] = await database.select({ count: sql<number>`count(*)` }).from(supplies);
  if (Number(count) > 0) return;
  const today = todayISO();
  await database.insert(supplies).values(
    SUPPLY_CATALOG.filter((entry) => !entry.name.includes("세탁")).map((entry, index) => ({
      category: entry.category,
      name: entry.name,
      icon: entry.icon,
      cycleDays: entry.cycleDays,
      lastDoneAt: today,
      sortOrder: index,
    })),
  );
}

export async function moveLaundrySuppliesToChores(database: AppDb): Promise<void> {
  const laundryRows = await database
    .select()
    .from(supplies)
    .where(sql`${supplies.name} LIKE '%세탁%'`);
  if (laundryRows.length === 0) return;

  const existingChores = await database.select({ name: chores.name }).from(chores);
  const existingNames = new Set(existingChores.map((row) => row.name));

  for (const supply of laundryRows) {
    const isPillow = supply.name.includes("베개");
    const isBlanket = supply.name.includes("이불");
    const isCurtain = supply.name.includes("커튼");
    const isWasherFilter = supply.name.includes("세탁기");
    const migration = isPillow
      ? { icon: "🧺", intervalValue: 1, intervalUnit: "week" as const }
      : isBlanket
        ? { icon: "🛌", intervalValue: 1, intervalUnit: "month" as const }
        : isCurtain || isWasherFilter
          ? { icon: isCurtain ? "🧵" : "💦", intervalValue: 3, intervalUnit: "month" as const }
          : null;

    if (migration && !existingNames.has(supply.name)) {
      await database.insert(chores).values({
        name: supply.name,
        icon: migration.icon,
        intervalValue: migration.intervalValue,
        intervalUnit: migration.intervalUnit,
        lastDoneAt: supply.lastDoneAt,
        createdAt: new Date().toISOString(),
      });
    }
    await database.delete(supplies).where(eq(supplies.id, supply.id));
  }
}

export async function initSuppliesSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS supplies (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('bathroom', 'kitchen', 'bedroom', 'appliance')),
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      last_done_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);
  await seedSuppliesIfEmpty(database);
}

export async function getAllSupplies(database: AppDb): Promise<SupplyRow[]> {
  const rows = await database.select().from(supplies).orderBy(asc(supplies.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    category: row.category as SupplyCategory,
    name: row.name,
    icon: row.icon,
    cycle_days: row.cycleDays,
    last_done_at: row.lastDoneAt,
    sort_order: row.sortOrder,
  }));
}

export async function completeSupplyRow(database: AppDb, id: number, doneDateISO: string): Promise<void> {
  await database.update(supplies).set({ lastDoneAt: doneDateISO }).where(eq(supplies.id, id));
}

export async function completeSupplyRows(database: AppDb, ids: number[], doneDateISO: string): Promise<void> {
  if (ids.length === 0) return;
  await database.update(supplies).set({ lastDoneAt: doneDateISO }).where(inArray(supplies.id, ids));
}
