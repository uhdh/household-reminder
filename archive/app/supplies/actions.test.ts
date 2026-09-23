import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, initSchema, setDbForTesting } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
import { completeSupply } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("completeSupply", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });
  afterEach(() => setDbForTesting(null));

  test("updates only the requested row", async () => {
    const rows = await getAllSupplies(getDb());
    await completeSupply(rows[0].id, "2026-07-01");
    const updated = await getAllSupplies(getDb());
    expect(updated[0].last_done_at).toBe("2026-07-01");
    expect(updated[1].last_done_at).not.toBe("2026-07-01");
  });
});
