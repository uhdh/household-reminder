"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { householdInvites } from "@/lib/finance-db";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/invite-token";
import { requireHousehold } from "@/lib/require-household";

export async function createInviteAction() {
  const { householdId, role, userId } = await requireHousehold();
  if (role !== "owner") {
    redirect("/finance/spending/settings?tab=members&error=" + encodeURIComponent("owner만 초대 링크를 만들 수 있습니다."));
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const db = getDb();
  await db.insert(householdInvites).values({ householdId, tokenHash, createdBy: userId, expiresAt });

  // 원문 토큰은 이 리다이렉트 한 번에만 노출된다(DB에는 해시만 저장) - 화면에서 바로 복사해야 한다.
  redirect(`/finance/spending/settings?tab=members&invite=${token}`);
}

export async function cancelInviteAction(formData: FormData) {
  const { householdId, role } = await requireHousehold();
  const id = String(formData.get("id") ?? "");

  if (role === "owner" && id) {
    const db = getDb();
    // 취소 = 즉시 만료 처리. "취소됨"과 "미사용인 채 만료됨"을 구분하지 않고 accept 액션과 같은
    // 만료 체크(expiresAt > now)로 함께 다룬다.
    await db
      .update(householdInvites)
      .set({ expiresAt: new Date(0) })
      .where(and(eq(householdInvites.id, id), eq(householdInvites.householdId, householdId)));
  }

  redirect("/finance/spending/settings?tab=members");
}
