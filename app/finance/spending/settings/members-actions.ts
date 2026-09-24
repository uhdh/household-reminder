"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { householdInvites } from "@/lib/finance-db";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/invite-token";
import { requireHousehold } from "@/lib/require-household";

export type CreateInviteState = { token?: string; error?: string };

// useActionState로 호출된다(prevState, formData). 원문 토큰은 redirect 쿼리에 절대 싣지 않고
// 반환값(state)으로만 클라이언트에 전달한다 - URL 쿼리는 브라우저 히스토리·Referer·서버 접근
// 로그(Vercel 등)에 남을 수 있어 초대 토큰 같은 비밀 값을 담기에 안전하지 않다.
export async function createInviteAction(): Promise<CreateInviteState> {
  const { householdId, role, userId } = await requireHousehold();
  if (role !== "owner") {
    return { error: "owner만 초대 링크를 만들 수 있습니다." };
  }

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const db = getDb();
  await db.insert(householdInvites).values({ householdId, tokenHash, createdBy: userId, expiresAt });

  // "활성 초대" 목록에 방금 만든 항목이 보이도록 새로고침(같은 화면 안에서만, 다른 URL로는 이동 안 함).
  revalidatePath("/finance/spending/settings");

  return { token };
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
