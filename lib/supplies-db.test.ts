import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, test } from "vitest";
import { initSuppliesSchema, getAllSupplies, completeSupplyRow } from "./supplies-db";

describe("supplies-db", () => {
  test("seeds the catalog idempotently and updates completion", async () => {
    const db = drizzle();
    await initSuppliesSchema(db);
    await initSuppliesSchema(db);
    const rows = await getAllSupplies(db);
    expect(rows).toHaveLength(21);
    await completeSupplyRow(db, rows[0].id, "2026-07-01");
    expect((await getAllSupplies(db))[0].last_done_at).toBe("2026-07-01");
  });
});
