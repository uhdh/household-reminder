import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { initChoresSchema } from "./chores-db";
import { initSuppliesSchema } from "./supplies-db";

function resolveDbPath(): string {
  return process.env.APP_DB_PATH ?? path.join(process.cwd(), "data", "db.sqlite");
}

let dbInstance: DatabaseSync | null = null;
let testOverride: DatabaseSync | null = null;

export function initSchema(database: DatabaseSync): void {
  initChoresSchema(database);
  initSuppliesSchema(database);
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
