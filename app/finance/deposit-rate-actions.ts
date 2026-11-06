"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { depositRates } from "@/lib/finance-db";
import { requireHousehold } from "@/lib/require-household";
import { getHouseholdPeople } from "@/lib/spending-queries";
import { parseRatePct } from "@/lib/deposit-rate";


// 현금·예적금 계좌의 연 금리 저장. 빈 값이면 금리를 지운다(입력 안 함으로 되돌리기).
export async function saveDepositRateAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const personId = String(formData.get("personId") ?? "");
  const productName = String(formData.get("productName") ?? "").trim().slice(0, 200);
  const parsed = parseRatePct(String(formData.get("ratePct") ?? ""));

  const people = await getHouseholdPeople(householdId);
  if (!productName || !people.some((p) => p.id === personId) || parsed === "invalid") return;

  const db = getDb();
  const key = and(eq(depositRates.householdId, householdId), eq(depositRates.personId, personId), eq(depositRates.productName, productName));
  if (parsed === null) {
    await db.delete(depositRates).where(key);
  } else {
    await db
      .insert(depositRates)
      .values({ householdId, personId, productName, ratePct: String(parsed) })
      .onConflictDoUpdate({
        target: [depositRates.householdId, depositRates.personId, depositRates.productName],
        set: { ratePct: String(parsed), updatedAt: new Date() },
      });
  }
  refresh(); // redirect는 화면을 맨 위로 올리므로 같은 화면만 다시 그린다
}
