import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
import { completeSupply } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("completeSupply", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("sets last_done_at for the given id", async () => {
    const [first] = getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const updated = getAllSupplies(getDb()).find((r) => r.id === first.id)!;
    expect(updated.last_done_at).toBe("2026-07-01");
  });

  test("does not affect other rows", async () => {
    const [first, second] = getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const untouched = getAllSupplies(getDb()).find((r) => r.id === second.id)!;
    expect(untouched.last_done_at).not.toBe("2026-07-01");
  });
});
