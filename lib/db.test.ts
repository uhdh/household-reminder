import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, test } from "vitest";
import { getAllChores, initChoresSchema } from "./chores-db";
import { getDb, initSchema, setDbForTesting } from "./db";

describe("initSchema", () => {
  test("creates the chores table", async () => {
    const db = drizzle();
    await initSchema(db);
    expect(await getAllChores(db)).toEqual([]);
  });
});

describe("getDb", () => {
  afterEach(() => {
    setDbForTesting(null);
    delete process.env.DATABASE_URL;
  });

  test("returns the test override without DATABASE_URL", () => {
    const db = drizzle();
    setDbForTesting(db);
    expect(getDb()).toBe(db);
  });

  test("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });
});
