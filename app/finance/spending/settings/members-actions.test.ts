// 구성원 초대 액션 검증: owner만 초대를 만들 수 있고, 원문 토큰은 반환값(state)으로만 오며,
// 취소된 초대는 더 이상 유효하지 않다.
import { drizzle } from "drizzle-orm/pglite";
import { sql, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { households, householdInvites, householdMembers, users } from "@/lib/finance-db";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

async function expectRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return e.message.slice(9);
    throw e;
  }
  throw new Error("expected a redirect");
}

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text, created_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE household_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE, role text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE household_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, token_hash text NOT NULL UNIQUE,
      created_by uuid NOT NULL, expires_at timestamptz NOT NULL, used_at timestamptz, used_by uuid
    )
  `);
}

describe("createInviteAction / cancelInviteAction", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockAuth.mockReset();
  });

  test("owner가 아니면 초대 링크를 만들 수 없다(에러는 state로 반환, redirect 없음)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const [household] = await db.insert(households).values({ name: "테스트가구" }).returning();
    const [member] = await db.insert(users).values({ email: "member@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId: member.id, role: "member" });

    mockAuth.mockResolvedValue({ user: { email: "member@example.com" } });
    const { createInviteAction } = await import("./members-actions");

    const state = await createInviteAction();
    expect(state.error).toBeTruthy();
    expect(state.token).toBeUndefined();

    const invites = await db.select().from(householdInvites).where(eq(householdInvites.householdId, household.id));
    expect(invites).toHaveLength(0);
  });

  test("owner는 초대 링크를 만들 수 있고(토큰은 state로만 옴, URL에는 없음), 취소한 초대는 더 이상 유효하지 않다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const [household] = await db.insert(households).values({ name: "테스트가구" }).returning();
    const [owner] = await db.insert(users).values({ email: "owner@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId: owner.id, role: "owner" });

    mockAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    const { createInviteAction, cancelInviteAction } = await import("./members-actions");

    const state = await createInviteAction();
    expect(state.error).toBeUndefined();
    expect(state.token).toBeDefined();
    expect(state.token).toHaveLength(64); // randomBytes(32).toString("hex")

    const [invite] = await db.select().from(householdInvites).where(eq(householdInvites.householdId, household.id));
    expect(invite.usedAt).toBeNull();
    expect(invite.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const cancelForm = new FormData();
    cancelForm.set("id", invite.id);
    await expectRedirect(cancelInviteAction(cancelForm));

    const [cancelled] = await db.select().from(householdInvites).where(eq(householdInvites.id, invite.id));
    expect(cancelled.expiresAt.getTime()).toBeLessThan(Date.now());
  });
});
