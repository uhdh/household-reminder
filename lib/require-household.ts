import "server-only";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "./db";
import { householdMembers, users } from "./finance-db";

// proxy.ts + requireFinanceUser(허용 명단)는 그대로 두고(P4 전환 전까지), 여기서는
// "이 사용자가 어느 가구 소속인가"만 추가로 판정한다. 소속 가구가 없으면 거부(fail-closed).
export class NoHouseholdError extends Error {
  constructor() {
    super("소속된 가구가 없습니다.");
    this.name = "NoHouseholdError";
  }
}

export interface HouseholdContext {
  userId: string;
  householdId: string;
  role: string;
  email: string;
}

/**
 * 세션 이메일 → users → household_members 순으로 조회해 현재 사용자의 가구를 얻는다.
 * 한 사용자가 여러 가구에 속할 수 있는 데이터 모델이지만(설계 문서), 첫 버전은 가구 선택
 * UI가 없으므로 가장 먼저 찾은 소속(owner 우선) 하나만 사용한다.
 */
export async function requireHousehold(): Promise<HouseholdContext> {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) throw new NoHouseholdError();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new NoHouseholdError();

  const memberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
  if (memberships.length === 0) throw new NoHouseholdError();
  const membership = memberships.find((m) => m.role === "owner") ?? memberships[0];

  return { userId: user.id, householdId: membership.householdId, role: membership.role, email };
}
