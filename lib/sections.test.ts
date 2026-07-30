import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, test } from "vitest";
import { getDb, initSchema, setDbForTesting } from "./db";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  afterEach(() => setDbForTesting(null));
  test("computes statuses from the shared database", async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
    expect((await SECTIONS[0].getStatus()).ready).toBe(true);
    expect((await SECTIONS[1].getStatus()).ready).toBe(true);
    expect((await SECTIONS[2].getStatus()).ready).toBe(true);
    expect(getDb()).toBe(db);
  });
});
