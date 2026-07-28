import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import {
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
  type ChoreInput,
} from "@/lib/chores-db";
import type { IntervalUnit } from "@/lib/chores";

const INTERVAL_UNITS: IntervalUnit[] = ["day", "week", "month"];

export function parseChoreForm(formData: FormData): ChoreInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const intervalValueRaw = String(formData.get("intervalValue") ?? "");
  const intervalUnit = String(formData.get("intervalUnit") ?? "") as IntervalUnit;

  if (!name) return { error: "이름을 입력해주세요." };
  if (!icon) return { error: "이모지를 입력해주세요." };

  const intervalValue = Number(intervalValueRaw);
  if (!Number.isInteger(intervalValue) || intervalValue < 1) {
    return { error: "주기는 1 이상의 정수여야 합니다." };
  }
  if (!INTERVAL_UNITS.includes(intervalUnit)) {
    return { error: "주기 단위가 올바르지 않습니다." };
  }

  return { name, icon, intervalValue, intervalUnit };
}

export async function createChore(formData: FormData): Promise<{ error?: string }> {
  "use server";
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  insertChore(getDb(), parsed);
  revalidatePath("/cleaning");
  revalidatePath("/");
  return {};
}

export async function updateChore(id: number, formData: FormData): Promise<{ error?: string }> {
  "use server";
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  updateChoreRow(getDb(), id, parsed);
  revalidatePath("/cleaning");
  revalidatePath("/");
  return {};
}

export async function completeChore(id: number, doneDateISO: string): Promise<void> {
  "use server";
  completeChoreRow(getDb(), id, doneDateISO);
  revalidatePath("/cleaning");
  revalidatePath("/");
}

export async function deleteChore(id: number): Promise<void> {
  "use server";
  deleteChoreRow(getDb(), id);
  revalidatePath("/cleaning");
  revalidatePath("/");
}
