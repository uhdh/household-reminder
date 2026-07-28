import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { EMOTIONS, type Emotion } from "@/lib/emotions";
import {
  getCustomEmotions,
  insertCustomEmotion,
  saveRecord as saveRecordRow,
} from "@/lib/emotion-cards-db";

const MAX_NAME_LENGTH = 6;

export async function addCustomEmotion(name: string): Promise<{ emotion?: Emotion; error?: string }> {
  "use server";
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return { error: "이름을 입력해주세요." };

  const existing = [...EMOTIONS, ...getCustomEmotions(getDb())];
  const emotion = insertCustomEmotion(getDb(), trimmed, existing);
  return { emotion };
}

export async function saveRecord(date: string, emotions: Emotion[]): Promise<{ error?: string }> {
  "use server";
  if (emotions.length !== 3) {
    return { error: "카드를 정확히 3장 선택해주세요." };
  }
  saveRecordRow(getDb(), date, emotions);
  revalidatePath("/emotion-cards");
  revalidatePath("/emotion-cards/history");
  revalidatePath("/");
  return {};
}
