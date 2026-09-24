"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { households, householdMembers, people, users } from "@/lib/finance-db";
import { seedDefaultCategories } from "@/lib/default-categories";

export async function createHouseholdAction(formData: FormData) {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) redirect("/api/auth/signin?callbackUrl=/onboarding");

  const householdName = String(formData.get("householdName") ?? "").trim().slice(0, 50) || "우리집";
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 20);
  if (!displayName) {
    redirect("/onboarding?error=" + encodeURIComponent("표시 이름을 입력해주세요."));
  }

  const db = getDb();

  // 로그인 이벤트(auth.ts events.signIn)에서 이미 만들어졌겠지만, 순서 경합 대비 안전망으로 재확인.
  const [user] = await db
    .insert(users)
    .values({ email })
    .onConflictDoUpdate({ target: users.email, set: { email } })
    .returning();

  const existingMemberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
  if (existingMemberships.length > 0) redirect("/finance");

  // ponytail: neon-http 드라이버는 진짜 트랜잭션(BEGIN/COMMIT)을 지원하지 않는다(db.transaction 호출 시
  // "No transactions support in neon-http driver"). id를 미리 만들어 단계 사이 의존성을 없애고
  // 순차 처리로 구성했다 - 중간에 실패해도 재방문 시 existingMemberships 체크가 중복 생성을 막는다.
  // 완전한 원자성이 필요해지면 neon-serverless(Pool) 드라이버로 교체해야 한다.
  const householdId = randomUUID();
  const personId = randomUUID();

  await db.insert(households).values({ id: householdId, name: householdName });
  await db.insert(householdMembers).values({ householdId, userId: user.id, role: "owner" });
  await db.insert(people).values({ id: personId, householdId, displayName });
  await seedDefaultCategories(db, householdId, { generic: true });

  redirect("/finance");
}
