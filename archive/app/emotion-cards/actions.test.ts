import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, initSchema, setDbForTesting } from "@/lib/db";
import { getCustomEmotions, getRecord } from "@/lib/emotion-cards-db";
import { addCustomEmotion, saveRecord } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("emotion card actions", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });
  afterEach(() => setDbForTesting(null));

  test("adds a custom emotion and saves a three-card record", async () => {
    const added = await addCustomEmotion("Calm");
    expect(added.emotion).toMatchObject({ name: "Calm", color: "purple" });
    expect(await getCustomEmotions(getDb())).toHaveLength(1);
    const cards = [
      { name: "A", emoji: "😀", color: "green" as const },
      { name: "B", emoji: "😌", color: "blue" as const },
      { name: "C", emoji: "❤️", color: "red" as const },
    ];
    expect(await saveRecord("2026-07-28", cards)).toEqual({});
    expect(await getRecord(getDb(), "2026-07-28")).toEqual(cards);
  });
});
