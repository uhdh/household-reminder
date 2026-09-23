import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, initSchema, setDbForTesting } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
import { createChore, completeChore, deleteChore, parseChoreForm, updateChore } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function formDataOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

const valid = { name: "Laundry", icon: "🧺", intervalValue: "1", intervalUnit: "week" };

describe("parseChoreForm", () => {
  test("rejects invalid input and parses valid input", () => {
    expect(parseChoreForm(formDataOf({ ...valid, name: "" }))).toHaveProperty("error");
    expect(parseChoreForm(formDataOf(valid))).toEqual({
      name: "Laundry", icon: "🧺", intervalValue: 1, intervalUnit: "week",
    });
  });
});

describe("chore actions", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });
  afterEach(() => setDbForTesting(null));

  test("supports create, complete, update, and delete", async () => {
    await createChore(formDataOf(valid));
    const [created] = await getAllChores(getDb());
    expect(created.name).toBe("Laundry");
    await completeChore(created.id, "2026-07-27");
    await updateChore(created.id, formDataOf({ ...valid, name: "Clean laundry" }));
    expect((await getAllChores(getDb()))[0]).toMatchObject({ name: "Clean laundry", last_done_at: "2026-07-27" });
    await deleteChore(created.id);
    expect(await getAllChores(getDb())).toEqual([]);
  });
});
