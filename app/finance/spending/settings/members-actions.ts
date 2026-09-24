"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { getDb } from "@/lib/db";
import { households, householdInvites, householdMembers, users } from "@/lib/finance-db";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/invite-token";
import { deleteHouseholdData } from "@/lib/household-lifecycle";
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

function dangerZoneRedirect(message: string): never {
  redirect(`/finance/spending/settings?tab=members&error=${encodeURIComponent(message)}`);
}

// 가구 나가기(탈퇴): 모든 구성원이 쓸 수 있다.
// - 본인이 가구의 유일한 구성원이면 가구 데이터 전체 + 가구 자체 + 본인 users 행을 지운다.
// - 다른 구성원이 남아있으면 본인 소속·계정만 지우고 가구 데이터(거래 이력 등)는 유지한다.
//   본인이 마지막 owner였으면 남은 구성원 중 가장 먼저 합류한 사람을 owner로 승격한다.
export async function leaveHouseholdAction(formData: FormData) {
  const { householdId, userId } = await requireHousehold();
  if (String(formData.get("confirm") ?? "") !== "탈퇴") {
    dangerZoneRedirect("확인 문구를 체크해주세요.");
  }

  const db = getDb();
  const members = await db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId));
  const self = members.find((m) => m.userId === userId);
  if (!self) dangerZoneRedirect("이미 가구에서 나간 상태입니다.");

  if (members.length <= 1) {
    await deleteHouseholdData(db, householdId);
    await db.delete(users).where(eq(users.id, userId));
  } else {
    const others = members.filter((m) => m.userId !== userId);
    const iAmLastOwner = self.role === "owner" && !others.some((m) => m.role === "owner");
    if (iAmLastOwner) {
      const successor = [...others].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      await db.update(householdMembers).set({ role: "owner" }).where(eq(householdMembers.id, successor.id));
    }
    // 본인을 참조하는 초대 FK 정리: used_by는 nullable이라 null 처리하고, created_by는
    // not null이라 본인이 만든 초대 자체를 지운다(만료 후 감사 목적 외 의미가 없는 기록).
    await db.update(householdInvites).set({ usedBy: null }).where(eq(householdInvites.usedBy, userId));
    await db.delete(householdInvites).where(eq(householdInvites.createdBy, userId));
    await db.delete(householdMembers).where(eq(householdMembers.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }

  await signOut({ redirectTo: "/" });
}

// 가구 삭제: owner만 실행할 수 있고, 가구 이름을 정확히 입력해야 한다(서버에서 재검증).
// 가구 데이터 + 모든 구성원 membership + household를 지우되, 다른 구성원의 users 행은
// 남겨서 다음 로그인 때 온보딩으로 새 가구를 만들 수 있게 한다.
export async function deleteHouseholdAction(formData: FormData) {
  const { householdId, role } = await requireHousehold();
  if (role !== "owner") dangerZoneRedirect("owner만 가구를 삭제할 수 있습니다.");

  const db = getDb();
  const [household] = await db.select().from(households).where(eq(households.id, householdId)).limit(1);
  const typedName = String(formData.get("householdName") ?? "");
  if (!household || typedName !== household.name) {
    dangerZoneRedirect("가구 이름이 일치하지 않습니다.");
  }

  await deleteHouseholdData(db, householdId);
  redirect("/onboarding");
}
