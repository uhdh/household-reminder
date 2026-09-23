import { asc, desc, eq, sql } from "drizzle-orm";
import { check, integer, pgTable, serial, text, unique } from "drizzle-orm/pg-core";
import type { Emotion, EmotionColor } from "./emotions";
import type { AppDb } from "./db";

export const customEmotions = pgTable(
  "custom_emotions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "custom_emotions_color_check",
      sql`${table.color} IN ('green', 'pink', 'blue', 'red', 'yellow', 'purple')`,
    ),
  ],
);

export const emotionRecords = pgTable(
  "emotion_records",
  {
    id: serial("id").primaryKey(),
    familyId: integer("family_id"),
    userId: text("user_id"),
    date: text("date").notNull(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
  },
  (table) => [
    unique("emotion_records_family_user_date_position_unique").on(table.familyId, table.userId, table.date, table.position),
    check("emotion_records_position_check", sql`${table.position} IN (1, 2, 3)`),
  ],
);

export async function initEmotionCardsSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS custom_emotions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL CHECK (color IN ('green','pink','blue','red','yellow','purple')),
      created_at TEXT NOT NULL
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS emotion_records (
      id SERIAL PRIMARY KEY,
      family_id INTEGER,
      user_id TEXT,
      date TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(family_id, user_id, date, position)
    )
  `);
  await database.execute(sql`
    ALTER TABLE emotion_records ADD COLUMN IF NOT EXISTS family_id INTEGER
  `);
  await database.execute(sql`
    ALTER TABLE emotion_records ADD COLUMN IF NOT EXISTS user_id TEXT
  `);
  await database.execute(sql`
    ALTER TABLE emotion_records DROP CONSTRAINT IF EXISTS emotion_records_date_position_unique
  `);
  await database.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS emotion_records_family_user_date_position_idx
    ON emotion_records (family_id, user_id, date, position)
  `);
}

export async function getCustomEmotions(database: AppDb): Promise<Emotion[]> {
  const rows = await database
    .select({ name: customEmotions.name, emoji: customEmotions.emoji, color: customEmotions.color })
    .from(customEmotions)
    .orderBy(asc(customEmotions.id));
  return rows.map((row) => ({ ...row, color: row.color as EmotionColor }));
}

export async function insertCustomEmotion(
  database: AppDb,
  name: string,
  existing: Emotion[],
): Promise<Emotion> {
  const found = existing.find((emotion) => emotion.name === name);
  if (found) return found;

  const emotion: Emotion = { name, emoji: "🫠", color: "purple" };
  const [row] = await database
    .insert(customEmotions)
    .values({ ...emotion, createdAt: new Date().toISOString() })
    .returning();
  return { name: row.name, emoji: row.emoji, color: row.color as EmotionColor };
}

type EmotionRecord = { date: string; userId: string | null; name: string; emoji: string; color: EmotionColor };

export async function getRecord(
  database: AppDb,
  date: string,
  familyId?: number,
  userId?: string,
): Promise<Emotion[] | undefined> {
  const rows = await database
    .select({ name: emotionRecords.name, emoji: emotionRecords.emoji, color: emotionRecords.color })
    .from(emotionRecords)
    .where(
      familyId !== undefined && userId
        ? sql`${emotionRecords.date} = ${date} AND ${emotionRecords.familyId} = ${familyId} AND ${emotionRecords.userId} = ${userId}`
        : eq(emotionRecords.date, date),
    )
    .orderBy(asc(emotionRecords.position));
  if (rows.length !== 3) return undefined;
  return rows.map((row) => ({ ...row, color: row.color as EmotionColor }));
}

export async function saveRecord(
  database: AppDb,
  date: string,
  emotions: Emotion[],
  familyId?: number,
  userId?: string,
): Promise<void> {
  await database.delete(emotionRecords).where(
    familyId !== undefined && userId
      ? sql`${emotionRecords.date} = ${date} AND ${emotionRecords.familyId} = ${familyId} AND ${emotionRecords.userId} = ${userId}`
      : eq(emotionRecords.date, date),
  );
  await database.insert(emotionRecords).values(
    emotions.map((emotion, index) => ({
      familyId,
      userId,
      date,
      position: index + 1,
      name: emotion.name,
      emoji: emotion.emoji,
      color: emotion.color,
    })),
  );
}

export async function getAllRecordsDesc(
  database: AppDb,
  familyId?: number,
): Promise<{ date: string; userId: string | null; cards: Emotion[] }[]> {
  const rows: EmotionRecord[] = (await database
    .select({
      date: emotionRecords.date,
      userId: emotionRecords.userId,
      position: emotionRecords.position,
      name: emotionRecords.name,
      emoji: emotionRecords.emoji,
      color: emotionRecords.color,
    })
    .from(emotionRecords)
    .where(familyId !== undefined ? eq(emotionRecords.familyId, familyId) : undefined)
    .orderBy(desc(emotionRecords.date), asc(emotionRecords.position))) as EmotionRecord[];

  const byDate = new Map<string, { userId: string | null; cards: Emotion[] }>();
  for (const row of rows) {
    const key = `${row.date}:${row.userId ?? "legacy"}`;
    const record = byDate.get(key) ?? { userId: row.userId, cards: [] };
    record.cards.push({ name: row.name, emoji: row.emoji, color: row.color });
    byDate.set(key, record);
  }
  return Array.from(byDate, ([key, record]) => ({ date: key.split(":")[0], ...record }));
}

export async function getFamilyRecords(
  database: AppDb,
  date: string,
  familyId: number,
): Promise<{ userId: string | null; cards: Emotion[] }[]> {
  const records = await getAllRecordsDesc(database, familyId);
  return records.filter((record) => record.date === date);
}
