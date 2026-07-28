import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
import { parseChoreForm, createChore, updateChore, completeChore, deleteChore } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseChoreForm", () => {
  test("rejects an empty name", () => {
    const result = parseChoreForm(
      formDataOf({ name: "  ", icon: "🧺", intervalValue: "1", intervalUnit: "week" })
    );
    expect(result).toEqual({ error: "이름을 입력해주세요." });
  });

  test("rejects a non-integer interval value", () => {
    const result = parseChoreForm(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "abc", intervalUnit: "week" })
    );
    expect(result).toEqual({ error: "주기는 1 이상의 정수여야 합니다." });
  });

  test("parses valid input", () => {
    const result = parseChoreForm(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "2", intervalUnit: "week" })
    );
    expect(result).toEqual({ name: "빨래", icon: "🧺", intervalValue: 2, intervalUnit: "week" });
  });
});

describe("Server Actions against an in-memory db", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("createChore inserts a row on valid input", async () => {
    const result = await createChore(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" })
    );
    expect(result).toEqual({});
    expect(getAllChores(getDb())).toHaveLength(1);
  });

  test("createChore returns an error and inserts nothing on invalid input", async () => {
    const result = await createChore(formDataOf({ name: "", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    expect(result.error).toBeTruthy();
    expect(getAllChores(getDb())).toHaveLength(0);
  });

  test("completeChore sets last_done_at", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await completeChore(row.id, "2026-07-27");
    const [updated] = getAllChores(getDb());
    expect(updated.last_done_at).toBe("2026-07-27");
  });

  test("updateChore changes fields", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await updateChore(row.id, formDataOf({ name: "손빨래", icon: "🧴", intervalValue: "3", intervalUnit: "day" }));
    const [updated] = getAllChores(getDb());
    expect(updated.name).toBe("손빨래");
    expect(updated.interval_unit).toBe("day");
  });

  test("deleteChore removes the row", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await deleteChore(row.id);
    expect(getAllChores(getDb())).toHaveLength(0);
  });
});
