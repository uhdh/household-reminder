import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getRecord, getCustomEmotions } from "@/lib/emotion-cards-db";
import { addCustomEmotion, saveRecord } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Server Actions against an in-memory db", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("addCustomEmotion rejects an empty name", async () => {
    const result = await addCustomEmotion("   ");
    expect(result.error).toBeTruthy();
    expect(getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("addCustomEmotion inserts a new custom emotion and returns it", async () => {
    const result = await addCustomEmotion("허탈함");
    expect(result.emotion).toEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(getCustomEmotions(getDb())).toHaveLength(1);
  });

  test("addCustomEmotion returns the existing preset match instead of duplicating", async () => {
    const result = await addCustomEmotion("행복");
    expect(result.emotion).toEqual({ name: "행복", emoji: "😊", color: "green" });
    expect(getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("saveRecord rejects fewer than 3 emotions", async () => {
    const result = await saveRecord("2026-07-28", [{ name: "행복", emoji: "😊", color: "green" }]);
    expect(result.error).toBeTruthy();
    expect(getRecord(getDb(), "2026-07-28")).toBeUndefined();
  });

  test("saveRecord saves exactly 3 emotions for the date", async () => {
    const emotions = [
      { name: "행복", emoji: "😊", color: "green" as const },
      { name: "슬픔", emoji: "😢", color: "blue" as const },
      { name: "화남", emoji: "😡", color: "red" as const },
    ];
    const result = await saveRecord("2026-07-28", emotions);
    expect(result).toEqual({});
    expect(getRecord(getDb(), "2026-07-28")).toEqual(emotions);
  });

  test("saveRecord replaces an existing record for the same date", async () => {
    const first = [
      { name: "행복", emoji: "😊", color: "green" as const },
      { name: "슬픔", emoji: "😢", color: "blue" as const },
      { name: "화남", emoji: "😡", color: "red" as const },
    ];
    const second = [
      { name: "걱정", emoji: "😟", color: "yellow" as const },
      { name: "고민", emoji: "🤔", color: "purple" as const },
      { name: "놀람", emoji: "😲", color: "purple" as const },
    ];
    await saveRecord("2026-07-28", first);
    await saveRecord("2026-07-28", second);
    expect(getRecord(getDb(), "2026-07-28")).toEqual(second);
  });
});
