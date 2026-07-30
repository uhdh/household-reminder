import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { initChoresSchema } from "./chores-db";
import { initSuppliesSchema } from "./supplies-db";
import { initEmotionCardsSchema } from "./emotion-cards-db";

export type AppDb = PgDatabase<any, any, any>;

let dbInstance: AppDb | null = null;
let testOverride: AppDb | null = null;

export function getDb(): AppDb {
  if (testOverride) return testOverride;

  if (!dbInstance) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    dbInstance = drizzleNeon({ client: neon(url) });
  }

  return dbInstance;
}

export function setDbForTesting(database: AppDb | null): void {
  testOverride = database;
}

export async function initSchema(database: AppDb): Promise<void> {
  await initChoresSchema(database);
  await initSuppliesSchema(database);
  await initEmotionCardsSchema(database);
}
