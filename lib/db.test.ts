import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, test } from "vitest";
import { getDb, setDbForTesting } from "./db";

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
