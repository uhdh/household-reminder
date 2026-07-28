import { DatabaseSync } from "node:sqlite";
import type { Emotion, EmotionColor } from "./emotions";

export function initEmotionCardsSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_emotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL CHECK (color IN ('green','pink','blue','red','yellow','purple')),
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS emotion_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(date, position)
    )
  `);
}

export function getCustomEmotions(database: DatabaseSync): Emotion[] {
  const rows = database
    .prepare("SELECT name, emoji, color FROM custom_emotions ORDER BY id")
    .all() as unknown as { name: string; emoji: string; color: EmotionColor }[];
  return rows.map((row) => ({ name: row.name, emoji: row.emoji, color: row.color }));
}

export function insertCustomEmotion(database: DatabaseSync, name: string, existing: Emotion[]): Emotion {
  const found = existing.find((e) => e.name === name);
  if (found) return found;

  const emotion: Emotion = { name, emoji: "💭", color: "purple" };
  const createdAt = new Date().toISOString();
  database
    .prepare("INSERT INTO custom_emotions (name, emoji, color, created_at) VALUES (?, ?, ?, ?)")
    .run(emotion.name, emotion.emoji, emotion.color, createdAt);
  return emotion;
}

export function getRecord(database: DatabaseSync, date: string): Emotion[] | undefined {
  const rows = database
    .prepare("SELECT name, emoji, color FROM emotion_records WHERE date = ? ORDER BY position")
    .all(date) as unknown as { name: string; emoji: string; color: EmotionColor }[];
  if (rows.length !== 3) return undefined;
  return rows.map((row) => ({ name: row.name, emoji: row.emoji, color: row.color }));
}

export function saveRecord(database: DatabaseSync, date: string, emotions: Emotion[]): void {
  database.prepare("DELETE FROM emotion_records WHERE date = ?").run(date);
  const insert = database.prepare(
    "INSERT INTO emotion_records (date, position, name, emoji, color) VALUES (?, ?, ?, ?, ?)"
  );
  emotions.forEach((emotion, index) => {
    insert.run(date, index + 1, emotion.name, emotion.emoji, emotion.color);
  });
}

export function getAllRecordsDesc(database: DatabaseSync): { date: string; cards: Emotion[] }[] {
  const rows = database
    .prepare("SELECT date, position, name, emoji, color FROM emotion_records ORDER BY date DESC, position ASC")
    .all() as unknown as { date: string; position: number; name: string; emoji: string; color: EmotionColor }[];

  const byDate = new Map<string, Emotion[]>();
  for (const row of rows) {
    const cards = byDate.get(row.date) ?? [];
    cards.push({ name: row.name, emoji: row.emoji, color: row.color });
    byDate.set(row.date, cards);
  }
  return Array.from(byDate.entries()).map(([date, cards]) => ({ date, cards }));
}
