import { DatabaseSync } from "node:sqlite";
import { rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, afterEach } from "vitest";
import { initSchema, getDb, setDbForTesting } from "./db";
import { getAllChores } from "./chores-db";
import { getAllSupplies } from "./supplies-db";

describe("initSchema", () => {
  test("creates both the chores and supplies tables in one call", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    expect(getAllChores(db)).toEqual([]);
    expect(getAllSupplies(db)).toHaveLength(21);
  });
});

describe("lib/db file-backed database", () => {
  let tempDir: string | null = null;
  let openedDb: DatabaseSync | null = null;

  afterEach(() => {
    // Always restore clean state, even if an assertion above failed.
    // Close the sqlite connection first — on Windows the file handle stays
    // locked until closed, which would make rmSync below fail with EPERM.
    if (openedDb) {
      openedDb.close();
      openedDb = null;
    }
    delete process.env.APP_DB_PATH;
    setDbForTesting(null);
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = null;
  });

  test("getDb() creates data directory and file-backed database without throwing", () => {
    // Point at a throwaway temp directory — never the project's real data/
    // directory, which holds the actual persistent db.sqlite.
    tempDir = path.join(os.tmpdir(), `cleaning-db-test-${Date.now()}`);
    const dbFile = path.join(tempDir, "db.sqlite");
    process.env.APP_DB_PATH = dbFile;

    // Reset test override to allow the real getDb() to work
    setDbForTesting(null);

    // Call the real getDb() - should create directory and open database
    const db = getDb();
    openedDb = db;
    expect(db).toBeDefined();

    // Verify it works
    const rows = getAllChores(db);
    expect(rows).toHaveLength(0);

    // Verify the file was created
    expect(existsSync(dbFile)).toBe(true);
  });
});
