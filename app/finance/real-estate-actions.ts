"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { realAssets } from "@/lib/finance-db";
import { requireHousehold } from "@/lib/require-household";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 부동산 한 건 저장(id가 있으면 수정). 시세는 만원 단위로 받는다. */
export async function saveRealAssetAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { householdId } = await requireHousehold();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  const valueMan = Number(String(formData.get("valueMan") ?? "").replaceAll(",", ""));
  const loanKeys = formData.getAll("loanKey").map(String).filter((k) => k.length <= 250).slice(0, 20);
  if (!name || !Number.isFinite(valueMan) || valueMan < 0 || valueMan > 100_000_000) return { ok: false, error: "이름과 시세를 확인해 주세요." };
  const values = { name, value: String(Math.round(valueMan * 10_000)), loanKeys, updatedAt: new Date() };
  const db = getDb();
  if (id) {
    if (!UUID_RE.test(id)) return { ok: false, error: "잘못된 요청이에요." };
    await db.update(realAssets).set(values).where(and(eq(realAssets.id, id), eq(realAssets.householdId, householdId)));
  } else {
    await db.insert(realAssets).values({ householdId, ...values });
  }
  refresh();
  return { ok: true };
}

export async function deleteRealAssetAction(id: string): Promise<void> {
  const { householdId } = await requireHousehold();
  if (!UUID_RE.test(id)) return;
  await getDb().delete(realAssets).where(and(eq(realAssets.id, id), eq(realAssets.householdId, householdId)));
  refresh();
}
