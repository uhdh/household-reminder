"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { householdInvites, householdMembers, people, users } from "@/lib/finance-db";
import { hashInviteToken } from "@/lib/invite-token";

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 20);

  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  if (!displayName) redirect(`/invite/${token}?error=${encodeURIComponent("표시 이름을 입력해주세요.")}`);

  const db = getDb();
  const [user] = await db.insert(users).values({ email }).onConflictDoUpdate({ target: users.email, set: { email } }).returning();

  // 첫 버전은 1인 1가구: 이미 다른(혹은 같은) 가구 소속이면 합류를 거부한다.
  const existingMemberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
  if (existingMemberships.length > 0) {
    redirect(`/invite/${token}?error=${encodeURIComponent("이미 다른 가구에 속해 있어 합류할 수 없습니다.")}`);
  }

  // 경합 방지: usedAt IS NULL이고 아직 만료 전인 초대만, 조건에 맞을 때 단 하나의 요청만 UPDATE에
  // 성공한다(RETURNING 행이 있어야 내가 선점한 것). 동시에 여러 명이 눌러도 DB가 행 잠금으로
  // 한 명만 통과시키므로 별도의 BEGIN/COMMIT 트랜잭션 없이도 원자성이 보장된다.
  const now = new Date();
  const tokenHash = hashInviteToken(token);
  const claimed = await db
    .update(householdInvites)
    .set({ usedAt: now, usedBy: user.id })
    .where(and(eq(householdInvites.tokenHash, tokenHash), isNull(householdInvites.usedAt), gt(householdInvites.expiresAt, now)))
    .returning({ householdId: householdInvites.householdId });

  if (claimed.length === 0) {
    redirect(`/invite/${token}?error=${encodeURIComponent("이미 사용됐거나 만료된 초대 링크입니다.")}`);
  }

  const { householdId } = claimed[0];
  const personId = randomUUID();

  try {
    await db.insert(householdMembers).values({ householdId, userId: user.id, role: "member" });
  } catch {
    // household_members.user_id unique 위반 등(예: 이 사용자가 그 사이 다른 초대를 먼저 수락해
    // 이미 다른 가구 소속이 된 경우) - 초대만 소모되고 아무도 못 들어오는 상황을 막기 위해
    // 위에서 선점한 초대를 다시 미사용 상태로 되돌린다.
    await db.update(householdInvites).set({ usedAt: null, usedBy: null }).where(eq(householdInvites.tokenHash, tokenHash));
    redirect(`/invite/${token}?error=${encodeURIComponent("합류에 실패했습니다. 이미 다른 가구에 속해 있는지 확인해주세요.")}`);
  }

  await db.insert(people).values({ id: personId, householdId, displayName });

  redirect("/finance");
}
