import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  initEmotionCardsSchema,
  getCustomEmotions,
  insertCustomEmotion,
  getRecord,
  saveRecord,
  getAllRecordsDesc,
} from "./emotion-cards-db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initEmotionCardsSchema(db);
  return db;
}

describe("custom emotions", () => {
  test("insertCustomEmotion adds a new emotion with default emoji/color", () => {
    const db = freshDb();
    const emotion = insertCustomEmotion(db, "허탈함", []);
    expect(emotion).toStrictEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(getCustomEmotions(db)).toStrictEqual([emotion]);
  });

  test("insertCustomEmotion returns the existing match instead of duplicating", () => {
    const db = freshDb();
    const existing = [{ name: "행복", emoji: "😊", color: "green" as const }];
    const emotion = insertCustomEmotion(db, "행복", existing);
    expect(emotion).toStrictEqual(existing[0]);
    expect(getCustomEmotions(db)).toHaveLength(0);
  });
});

describe("emotion records", () => {
  const cards = [
    { name: "행복", emoji: "😊", color: "green" as const },
    { name: "슬픔", emoji: "😢", color: "blue" as const },
    { name: "화남", emoji: "😡", color: "red" as const },
  ];

  test("getRecord returns undefined when nothing is saved for the date", () => {
    const db = freshDb();
    expect(getRecord(db, "2026-07-28")).toBeUndefined();
  });

  test("saveRecord then getRecord round-trips the 3 cards in order", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-28", cards);
    expect(getRecord(db, "2026-07-28")).toStrictEqual(cards);
  });

  test("saveRecord replaces the previous 3 rows for the same date, not append", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-28", cards);
    const replacement = [
      { name: "걱정", emoji: "😟", color: "yellow" as const },
      { name: "고민", emoji: "🤔", color: "purple" as const },
      { name: "놀람", emoji: "😲", color: "purple" as const },
    ];
    saveRecord(db, "2026-07-28", replacement);
    expect(getRecord(db, "2026-07-28")).toStrictEqual(replacement);
  });

  test("getAllRecordsDesc groups rows by date, most recent first", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-01", cards);
    saveRecord(db, "2026-07-28", cards);
    const records = getAllRecordsDesc(db);
    expect(records.map((r) => r.date)).toEqual(["2026-07-28", "2026-07-01"]);
    expect(records[0].cards).toStrictEqual(cards);
  });
});
