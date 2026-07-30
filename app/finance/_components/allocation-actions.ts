"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { allocationTargets } from "@/lib/finance-db";

const TARGET_FIELD_PREFIX = "target:";

export async function updateAllocationTargetsAction(formData: FormData) {
  const db = getDb();
  const person = String(formData.get("person") ?? "all");

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(TARGET_FIELD_PREFIX)) continue;
    const category = key.slice(TARGET_FIELD_PREFIX.length);
    const targetPct = Number(value);
    if (!category || !Number.isFinite(targetPct)) continue;
    const clamped = Math.min(100, Math.max(0, targetPct));

    await db
      .insert(allocationTargets)
      .values({ category, targetPct: clamped.toString() })
      .onConflictDoUpdate({
        target: allocationTargets.category,
        set: { targetPct: clamped.toString(), updatedAt: new Date() },
      });
  }

  redirect(person === "all" ? "/finance" : `/finance?person=${person}`);
}
