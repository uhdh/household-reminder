import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, test } from "vitest";
import {
  getAllRecordsDesc, getCustomEmotions, getRecord, initEmotionCardsSchema,
  insertCustomEmotion, saveRecord,
} from "./emotion-cards-db";

describe("emotion-cards-db", () => {
  test("supports custom emotions and replacing daily records", async () => {
    const db = drizzle();
    await initEmotionCardsSchema(db);
    await initEmotionCardsSchema(db);
    const custom = await insertCustomEmotion(db, "Calm", []);
    expect(custom.color).toBe("purple");
    expect(await getCustomEmotions(db)).toHaveLength(1);
    const cards = [
      { name: "A", emoji: "😀", color: "green" as const },
      { name: "B", emoji: "😌", color: "blue" as const },
      { name: "C", emoji: "❤️", color: "red" as const },
    ];
    await saveRecord(db, "2026-07-28", cards);
    expect(await getRecord(db, "2026-07-28")).toEqual(cards);
    expect((await getAllRecordsDesc(db))[0].cards).toEqual(cards);
  });
});
