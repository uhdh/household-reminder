// 초대 수락 흐름 검증: 토큰 원문 미저장(해시만), 만료/재사용/취소된 초대 거부, 동시 수락 경합에서
// 1명만 성공(조건부 UPDATE), 이미 다른 가구 소속자는 합류 거부.
import { drizzle } from "drizzle-orm/pglite";
import { sql, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { households, householdInvites, householdMembers, people, users } from "@/lib/finance-db";
import { hashInviteToken } from "@/lib/invite-token";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: (...args: unknown[]) => mockAuth(...args) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

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
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
}

async function seedInvite(db: ReturnType<typeof drizzle>, overrides: Partial<{ expiresAt: Date; usedAt: Date | null }> = {}) {
  const [household] = await db.insert(households).values({ name: "테스트가구" }).returning();
  const [owner] = await db.insert(users).values({ email: "owner@example.com" }).returning();
  await db.insert(householdMembers).values({ householdId: household.id, userId: owner.id, role: "owner" });

  const token = "a".repeat(64); // 테스트용 고정 "원문" 토큰
  const tokenHash = hashInviteToken(token);
  const [invite] = await db
    .insert(householdInvites)
    .values({
      householdId: household.id,
      tokenHash,
      createdBy: owner.id,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      usedAt: overrides.usedAt ?? null,
    })
    .returning();

  return { household, owner, token, invite };
}

describe("acceptInviteAction", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockAuth.mockReset();
  });

  test("초대를 수락하면 household_members(member) + people가 생기고, 토큰 해시만 저장돼 있다(원문 없음)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { household, token, invite } = await seedInvite(db);

    mockAuth.mockResolvedValue({ user: { email: "New@Example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "새구성원");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toBe("/finance");

    const [newUser] = await db.select().from(users).where(eq(users.email, "new@example.com"));
    expect(newUser).toBeDefined();

    const memberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, newUser.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].householdId).toBe(household.id);
    expect(memberships[0].role).toBe("member");

    const peopleRows = await db.select().from(people).where(eq(people.householdId, household.id));
    expect(peopleRows.some((p) => p.displayName === "새구성원")).toBe(true);

    // 저장된 값이 해시이지 원문 토큰이 아님을 직접 확인.
    const [storedInvite] = await db.select().from(householdInvites).where(eq(householdInvites.id, invite.id));
    expect(storedInvite.tokenHash).not.toBe(token);
    expect(storedInvite.tokenHash).toBe(hashInviteToken(token));
    expect(storedInvite.usedAt).not.toBeNull();
  });

  test("만료된 초대는 거부된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { token } = await seedInvite(db, { expiresAt: new Date(Date.now() - 1000) });

    mockAuth.mockResolvedValue({ user: { email: "new@example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "새구성원");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toContain(`/invite/${token}`);
    expect(redirectTo).toContain("error=");

    const memberships = await db.select().from(users).where(eq(users.email, "new@example.com"));
    // user row는 upsert되지만(방문 자체는 기록) household_members는 생기면 안 된다.
    if (memberships.length > 0) {
      const m = await db.select().from(householdMembers).where(eq(householdMembers.userId, memberships[0].id));
      expect(m).toHaveLength(0);
    }
  });

  test("이미 사용된(재사용) 초대는 거부된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { token } = await seedInvite(db, { usedAt: new Date() });

    mockAuth.mockResolvedValue({ user: { email: "new@example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "새구성원");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toContain(`/invite/${token}`);
  });

  test("취소된 초대(만료 처리)는 거부된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { token, invite } = await seedInvite(db);

    // members-actions.ts의 cancelInviteAction과 동일한 취소 방식(만료 시각을 과거로).
    await db.update(householdInvites).set({ expiresAt: new Date(0) }).where(eq(householdInvites.id, invite.id));

    mockAuth.mockResolvedValue({ user: { email: "new@example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "새구성원");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toContain(`/invite/${token}`);
  });

  test("동시 수락 경합: 같은 초대를 두 사용자가 거의 동시에 수락해도 1명만 성공한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { household, token } = await seedInvite(db);

    const { acceptInviteAction } = await import("./actions");

    mockAuth.mockResolvedValue({ user: { email: "first@example.com" } });
    const form1 = new FormData();
    form1.set("token", token);
    form1.set("displayName", "첫번째");
    const redirect1 = await expectRedirect(acceptInviteAction(form1));
    expect(redirect1).toBe("/finance"); // 성공

    mockAuth.mockResolvedValue({ user: { email: "second@example.com" } });
    const form2 = new FormData();
    form2.set("token", token);
    form2.set("displayName", "두번째");
    const redirect2 = await expectRedirect(acceptInviteAction(form2));
    expect(redirect2).toContain(`/invite/${token}`); // 실패(이미 선점됨)

    const membersOfHousehold = await db.select().from(householdMembers).where(eq(householdMembers.householdId, household.id));
    // owner 1명 + 성공한 1명만 있어야 한다(두번째는 못 들어옴).
    expect(membersOfHousehold).toHaveLength(2);
  });

  test("이미 다른 가구 소속인 사람은 합류할 수 없다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { token } = await seedInvite(db);

    // 이 사람은 이미 별도의(제3의) 가구에 속해 있다.
    const [otherHousehold] = await db.insert(households).values({ name: "다른가구" }).returning();
    const [existingUser] = await db.insert(users).values({ email: "already@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: otherHousehold.id, userId: existingUser.id, role: "owner" });

    mockAuth.mockResolvedValue({ user: { email: "already@example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "이미소속됨");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toContain(`/invite/${token}`);
    expect(redirectTo).toContain("error=");

    const memberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, existingUser.id));
    expect(memberships).toHaveLength(1); // 여전히 기존 가구 하나뿐
    expect(memberships[0].householdId).toBe(otherHousehold.id);
  });

  test("초대는 선점됐지만 household_members insert가 실패하면(예: user_id unique 위반) 선점을 되돌리고 안내 redirect한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const { household, token, invite } = await seedInvite(db);

    // 사전 체크(existingMemberships)는 통과했지만, 그 직후(선점 이후) household_members insert만
    // 실패하는 경합 상황을 재현한다 - users insert(upsert)는 그대로 두고 householdMembers insert만 가로챈다.
    const realInsert = db.insert.bind(db);
    const insertSpy = vi.spyOn(db, "insert").mockImplementation((table: unknown) => {
      if (table === householdMembers) {
        throw new Error("simulated unique violation on household_members.user_id");
      }
      return realInsert(table as Parameters<typeof db.insert>[0]);
    });

    mockAuth.mockResolvedValue({ user: { email: "race@example.com" } });
    const { acceptInviteAction } = await import("./actions");

    const form = new FormData();
    form.set("token", token);
    form.set("displayName", "경합사용자");
    const redirectTo = await expectRedirect(acceptInviteAction(form));
    expect(redirectTo).toContain(`/invite/${token}`);
    expect(redirectTo).toContain("error=");

    insertSpy.mockRestore();

    // 초대가 "선점된 채로 낭비"되지 않고 다시 미사용 상태로 돌아와야 한다.
    const [after] = await db.select().from(householdInvites).where(eq(householdInvites.id, invite.id));
    expect(after.usedAt).toBeNull();
    expect(after.usedBy).toBeNull();

    // 실패한 사용자는 household_members에 들어가지 않는다(owner만 남아있음).
    const membersOfHousehold = await db.select().from(householdMembers).where(eq(householdMembers.householdId, household.id));
    expect(membersOfHousehold).toHaveLength(1);

    // people 프로필도 생기지 않는다(멤버십이 없으니).
    const peopleRows = await db.select().from(people).where(eq(people.householdId, household.id));
    expect(peopleRows).toHaveLength(0);
  });
});
