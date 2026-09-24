import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "./db";
import { householdMembers, users } from "./finance-db";
import { DEMO_HOUSEHOLD_ID } from "./demo-household";
import { isFinanceDemoMode } from "./finance-viewer-server";

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

/** requireHousehold()와 같지만 소속 가구가 없으면 예외 대신 null을 반환한다(온보딩 화면 등에서 사용). */
export async function getCurrentHousehold(): Promise<HouseholdContext | null> {
  try {
    return await requireHousehold();
  } catch (error) {
    if (error instanceof NoHouseholdError) return null;
    throw error;
  }
}

/** 페이지 컴포넌트 전용: 소속 가구가 없으면 예외를 던지는 대신 /onboarding으로 보낸다. */
export async function requireHouseholdOrOnboard(): Promise<HouseholdContext> {
  try {
    return await requireHousehold();
  } catch (error) {
    if (error instanceof NoHouseholdError) redirect("/onboarding");
    throw error;
  }
}

export interface FinanceViewer {
  householdId: string;
  /** true면 샘플 가구(데모)를 보는 중 - 화면은 그대로 쓰되 모든 수정 컨트롤을 숨겨야 한다. */
  readOnly: boolean;
}

/**
 * /finance, /finance/spending(+monthly/yearly) 등 실화면이 공통으로 쓰는 진입점. 로그인 없이 보는
 * 데모 모드는 DEMO_HOUSEHOLD_ID(샘플 가구)를 읽기 전용으로 보여주고, 그 외에는 평소대로 로그인한
 * 사용자의 가구를 반환한다(가구가 없으면 기존과 동일하게 /onboarding으로 보낸다).
 */
export async function resolveFinanceViewer(): Promise<FinanceViewer> {
  if (await isFinanceDemoMode()) return { householdId: DEMO_HOUSEHOLD_ID, readOnly: true };
  const { householdId } = await requireHouseholdOrOnboard();
  return { householdId, readOnly: false };
}
