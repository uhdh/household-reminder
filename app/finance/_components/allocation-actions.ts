"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { allocationTargets } from "@/lib/finance-db";
import { isAllocationTargetSumValid, sumTargetPct } from "@/lib/finance-format";
import { requireFinanceUser } from "@/lib/require-finance-user";

const TARGET_FIELD_PREFIX = "target:";

export async function updateAllocationTargetsAction(formData: FormData) {
  await requireFinanceUser();
  const db = getDb();
  const person = String(formData.get("person") ?? "all");
  const destination = person === "all" ? "/finance" : `/finance?person=${person}`;

  const entries: { category: string; targetPct: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(TARGET_FIELD_PREFIX)) continue;
    const category = key.slice(TARGET_FIELD_PREFIX.length);
    const targetPct = Number(value);
    if (!category || !Number.isFinite(targetPct)) continue;
    entries.push({ category, targetPct: Math.min(100, Math.max(0, targetPct)) });
  }

  // 목표 비중 합계가 100%(오차 ±0.1)가 아니면 저장을 거부한다 - UI에서 저장 버튼을 막아도
  // 폼이 직접 제출될 수 있으므로 서버에서도 검증한다.
  if (!isAllocationTargetSumValid(sumTargetPct(entries.map((e) => e.targetPct)))) {
    redirect(destination);
  }

  for (const { category, targetPct: clamped } of entries) {
    await db
      .insert(allocationTargets)
      .values({ category, targetPct: clamped.toString() })
      .onConflictDoUpdate({
        target: allocationTargets.category,
        set: { targetPct: clamped.toString(), updatedAt: new Date() },
      });
  }

  redirect(destination);
}
