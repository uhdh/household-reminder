// resolveFinanceViewer 검증: 데모 모드면 로그인/가구 조회 없이 샘플 가구를 읽기 전용으로,
// 아니면 기존 requireHouseholdOrOnboard 경로로 실제 가구를 반환하는지 확인한다.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { households, householdMembers, users } from "@/lib/finance-db";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-household";

const mockAuth = vi.fn();
const mockIsFinanceDemoMode = vi.fn();
vi.mock("@/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("@/lib/finance-viewer-server", () => ({ isFinanceDemoMode: (...args: unknown[]) => mockIsFinanceDemoMode(...args) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE household_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE, role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

describe("resolveFinanceViewer", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockAuth.mockReset();
    mockIsFinanceDemoMode.mockReset();
  });

  test("데모 모드면 로그인 여부와 무관하게 샘플 가구를 읽기 전용으로 반환한다", async () => {
    mockIsFinanceDemoMode.mockResolvedValue(true);
    const { resolveFinanceViewer } = await import("./require-household");

    const result = await resolveFinanceViewer();

    expect(result).toEqual({ householdId: DEMO_HOUSEHOLD_ID, readOnly: true });
    expect(mockAuth).not.toHaveBeenCalled();
  });

  test("데모가 아니면 로그인한 사용자의 실제 가구를 읽기/쓰기 가능하게 반환한다", async () => {
    mockIsFinanceDemoMode.mockResolvedValue(false);
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [household] = await db.insert(households).values({ name: "우리집" }).returning();
    const [user] = await db.insert(users).values({ email: "a@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId: user.id, role: "owner" });
    mockAuth.mockResolvedValue({ user: { email: "a@example.com" } });

    const { resolveFinanceViewer } = await import("./require-household");
    const result = await resolveFinanceViewer();

    expect(result).toEqual({ householdId: household.id, readOnly: false });
  });

  test("데모가 아니고 소속 가구도 없으면 기존처럼 /onboarding으로 보낸다", async () => {
    mockIsFinanceDemoMode.mockResolvedValue(false);
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    mockAuth.mockResolvedValue({ user: { email: "nohousehold@example.com" } });

    const { resolveFinanceViewer } = await import("./require-household");

    await expect(resolveFinanceViewer()).rejects.toThrow("REDIRECT:/onboarding");
  });
});
