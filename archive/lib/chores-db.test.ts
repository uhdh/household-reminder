import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, test } from "vitest";
import type { AppDb } from "./db";
import {
  completeChoreRow,
  deleteChoreRow,
  getAllChores,
  initChoresSchema,
  insertChore,
  updateChoreRow,
} from "./chores-db";

async function freshDb(): Promise<AppDb> {
  const db = drizzle();
  await initChoresSchema(db);
  return db;
}

const input = {
  name: "Laundry",
  icon: "🧺",
  intervalValue: 1,
  intervalUnit: "week" as const,
};

describe("lib/chores-db CRUD", () => {
  test("inserts a row with a null completion date", async () => {
    const row = await insertChore(await freshDb(), input);
    expect(row).toMatchObject({
      name: input.name,
      icon: input.icon,
      interval_value: 1,
      interval_unit: "week",
      last_done_at: null,
    });
    expect(typeof row.created_at).toBe("string");
  });

  test("returns rows ordered by id", async () => {
    const db = await freshDb();
    await insertChore(db, input);
    await insertChore(db, { ...input, name: "Dishes", intervalUnit: "day" });
    expect((await getAllChores(db)).map((row) => row.name)).toEqual([
      "Laundry",
      "Dishes",
    ]);
  });

  test("updates editable fields without changing completion date", async () => {
    const db = await freshDb();
    const created = await insertChore(db, input);
    await completeChoreRow(db, created.id, "2026-07-01");
    await updateChoreRow(db, created.id, {
      ...input,
      name: "Clean laundry",
      icon: "✨",
      intervalValue: 2,
    });
    expect(await getAllChores(db)).toContainEqual({
      id: created.id,
      name: "Clean laundry",
      icon: "✨",
      interval_value: 2,
      interval_unit: "week",
      last_done_at: "2026-07-01",
      created_at: created.created_at,
    });
  });

  test("completes and deletes a chore", async () => {
    const db = await freshDb();
    const created = await insertChore(db, input);
    await completeChoreRow(db, created.id, "2026-07-27");
    expect((await getAllChores(db))[0].last_done_at).toBe("2026-07-27");
    await deleteChoreRow(db, created.id);
    expect(await getAllChores(db)).toEqual([]);
  });
});
