import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { initSuppliesSchema, getAllSupplies, completeSupplyRow } from "./supplies-db";
import { todayISO } from "./chores";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initSuppliesSchema(db);
  return db;
}

describe("lib/supplies-db catalog", () => {
  test("initSuppliesSchema seeds exactly 21 supply rows spanning all 4 categories, dated today", () => {
    const db = freshDb();
    const rows = getAllSupplies(db);
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.category))).toEqual(
      new Set(["bathroom", "kitchen", "bedroom", "appliance"])
    );
    for (const row of rows) {
      expect(row.last_done_at).toBe(todayISO());
    }
  });

  test("seeding is idempotent - calling initSuppliesSchema again does not duplicate rows", () => {
    const db = freshDb();
    initSuppliesSchema(db);
    expect(getAllSupplies(db)).toHaveLength(21);
  });

  test("completeSupplyRow updates last_done_at for the given id", () => {
    const db = freshDb();
    const [first] = getAllSupplies(db);
    completeSupplyRow(db, first.id, "2026-07-01");
    const [updated] = getAllSupplies(db);
    expect(updated.last_done_at).toBe("2026-07-01");
  });
});
