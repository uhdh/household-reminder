"use server";

import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { planSettings } from "@/lib/finance-db";
import { sanitizePlanSettings } from "@/lib/plan-settings";
import { requireHousehold } from "@/lib/require-household";

/** 미래 계획 설정을 가구 단위로 저장한다(부부가 같은 계획을 본다). */
export async function savePlanSettingsAction(json: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { householdId } = await requireHousehold();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "저장할 내용을 읽지 못했어요." };
  }
  const data = sanitizePlanSettings(parsed);
  try {
    await getDb()
      .insert(planSettings)
      .values({ householdId, data })
      .onConflictDoUpdate({ target: planSettings.householdId, set: { data, updatedAt: new Date() } });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "42P01") return { ok: false, error: "저장 공간이 아직 준비되지 않았어요. 관리자에게 알려 주세요." };
    throw error;
  }
  refresh();
  return { ok: true };
}
