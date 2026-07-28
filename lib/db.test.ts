import { DatabaseSync } from "node:sqlite";
import { rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, afterEach } from "vitest";
import {
  initSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
  getDb,
  setDbForTesting,
} from "./db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  return db;
}

describe("lib/db chore CRUD", () => {
  test("insertChore creates a row with null last_done_at and returns it", () => {
    const db = freshDb();
    const row = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    expect(row.name).toBe("빨래");
    expect(row.icon).toBe("🧺");
    expect(row.interval_value).toBe(1);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBeNull();
    expect(typeof row.created_at).toBe("string");
  });

  test("getAllChores returns every inserted row, ordered by id", () => {
    const db = freshDb();
    insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    insertChore(db, { name: "설거지", icon: "🍽️", intervalValue: 1, intervalUnit: "day" });
    const rows = getAllChores(db);
    expect(rows.map((r) => r.name)).toEqual(["빨래", "설거지"]);
  });

  test("updateChoreRow changes name/icon/interval but not last_done_at", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    completeChoreRow(db, created.id, "2026-07-01");
    updateChoreRow(db, created.id, { name: "손빨래", icon: "🧴", intervalValue: 2, intervalUnit: "week" });
    const [row] = getAllChores(db);
    expect(row.name).toBe("손빨래");
    expect(row.icon).toBe("🧴");
    expect(row.interval_value).toBe(2);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBe("2026-07-01");
  });

  test("completeChoreRow sets last_done_at", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    completeChoreRow(db, created.id, "2026-07-27");
    const [row] = getAllChores(db);
    expect(row.last_done_at).toBe("2026-07-27");
  });

  test("deleteChoreRow removes the row", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    deleteChoreRow(db, created.id);
    expect(getAllChores(db)).toHaveLength(0);
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
