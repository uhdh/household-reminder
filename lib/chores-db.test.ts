import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  initChoresSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
} from "./chores-db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initChoresSchema(db);
  return db;
}

describe("lib/chores-db CRUD", () => {
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
