// 구성원 초대 액션 검증: owner만 초대를 만들 수 있고, 원문 토큰은 반환값(state)으로만 오며,
// 취소된 초대는 더 이상 유효하지 않다. 아래쪽에는 가구 나가기/가구 삭제(위험 구역) 액션 검증도 있다.
import { drizzle } from "drizzle-orm/pglite";
import { sql, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import {
  allocationTargets,
  assetItems,
  budgetCategories,
  categoryKeywordRules,
  categoryMappings,
  categoryRules,
  households,
  householdInvites,
  householdMembers,
  people,
  transactions,
  uploads,
  users,
} from "@/lib/finance-db";

const mockAuth = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue(undefined);
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));
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

// 가구 나가기/가구 삭제(위험 구역) 검증: 삭제 순서(lib/household-lifecycle.ts)가 실제 FK 제약과
// 어긋나지 않는지, 그리고 다른 가구(B) 데이터가 절대 영향받지 않는지를 전 테이블 기준으로 확인한다.
describe("leaveHouseholdAction / deleteHouseholdAction (위험 구역)", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockAuth.mockReset();
    mockSignOut.mockClear();
  });

  async function createFullSchema(db: ReturnType<typeof drizzle>) {
    await createSchema(db);
    await db.execute(sql`ALTER TABLE household_members ADD CONSTRAINT hm_household_fk FOREIGN KEY (household_id) REFERENCES households(id)`);
    await db.execute(sql`ALTER TABLE household_members ADD CONSTRAINT hm_user_fk FOREIGN KEY (user_id) REFERENCES users(id)`);
    await db.execute(sql`ALTER TABLE household_invites ADD CONSTRAINT hi_household_fk FOREIGN KEY (household_id) REFERENCES households(id)`);
    await db.execute(sql`ALTER TABLE household_invites ADD CONSTRAINT hi_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id)`);
    await db.execute(sql`ALTER TABLE household_invites ADD CONSTRAINT hi_used_by_fk FOREIGN KEY (used_by) REFERENCES users(id)`);
    await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id), display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await db.execute(sql`
      CREATE TABLE uploads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), person_id text NOT NULL REFERENCES people(id),
        source_filename text NOT NULL, period_start date, period_end date, is_active boolean NOT NULL DEFAULT true,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id),
        upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE, person_id text NOT NULL REFERENCES people(id),
        txn_date date NOT NULL, txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL DEFAULT true,
        is_internal_transfer boolean NOT NULL DEFAULT false, beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
      )
    `);
    await db.execute(sql`
      CREATE TABLE asset_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id),
        upload_id uuid NOT NULL REFERENCES uploads(id) ON DELETE CASCADE, person_id text NOT NULL REFERENCES people(id),
        side text NOT NULL, category text NOT NULL, product_name text, amount numeric NOT NULL DEFAULT 0,
        cost_basis numeric, sector text
      )
    `);
    await db.execute(sql`CREATE TABLE allocation_targets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), category text NOT NULL, target_pct numeric NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(household_id, category))`);
    await db.execute(sql`CREATE TABLE category_mappings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), txn_type text NOT NULL, raw_category text NOT NULL, raw_subcategory text NOT NULL, std_category text NOT NULL, UNIQUE(household_id, txn_type, raw_category, raw_subcategory))`);
    await db.execute(sql`CREATE TABLE category_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), txn_type text NOT NULL, payment_method text NOT NULL, std_category text NOT NULL, UNIQUE(household_id, txn_type, payment_method))`);
    await db.execute(sql`CREATE TABLE category_keyword_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), txn_type text NOT NULL, keyword text NOT NULL, std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(household_id, keyword))`);
    await db.execute(sql`CREATE TABLE budget_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL REFERENCES households(id), name text NOT NULL, kind text NOT NULL, sort_order numeric NOT NULL DEFAULT 0, monthly_budget numeric, UNIQUE(household_id, name))`);
  }

  /** 가구 소속 데이터 테이블 전부(household_members·household_invites 포함)의 행 수 합계. */
  async function countRows(db: ReturnType<typeof drizzle>, householdId: string): Promise<number> {
    const counts = await Promise.all([
      db.select().from(transactions).where(eq(transactions.householdId, householdId)),
      db.select().from(assetItems).where(eq(assetItems.householdId, householdId)),
      db.select().from(uploads).where(eq(uploads.householdId, householdId)),
      db.select().from(allocationTargets).where(eq(allocationTargets.householdId, householdId)),
      db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId)),
      db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
      db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId)),
      db.select().from(budgetCategories).where(eq(budgetCategories.householdId, householdId)),
      db.select().from(people).where(eq(people.householdId, householdId)),
      db.select().from(householdInvites).where(eq(householdInvites.householdId, householdId)),
      db.select().from(householdMembers).where(eq(householdMembers.householdId, householdId)),
    ]);
    return counts.reduce((sum, rows) => sum + rows.length, 0);
  }

  /** 가구 하나(household 1건 + 소속원 1명 + 각 테이블 1행씩)를 시드하고 만든 id들을 돌려준다. */
  async function seedHousehold(db: ReturnType<typeof drizzle>, opts: { name: string; ownerEmail: string }) {
    const [household] = await db.insert(households).values({ name: opts.name }).returning();
    const [owner] = await db.insert(users).values({ email: opts.ownerEmail }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId: owner.id, role: "owner" });
    await db.insert(people).values({ id: `${household.id}-p1`, householdId: household.id, displayName: "본인" });
    const [upload] = await db.insert(uploads).values({ householdId: household.id, personId: `${household.id}-p1`, sourceFilename: "a.xlsx" }).returning();
    await db.insert(transactions).values({
      householdId: household.id,
      uploadId: upload.id,
      personId: `${household.id}-p1`,
      txnDate: "2026-08-01",
      txnType: "지출",
      amount: "-1000",
      included: true,
      isInternalTransfer: false,
      beneficiary: "husband",
    });
    await db.insert(assetItems).values({ householdId: household.id, uploadId: upload.id, personId: `${household.id}-p1`, side: "asset", category: "예금", amount: "10000" });
    await db.insert(allocationTargets).values({ householdId: household.id, category: "예금", targetPct: "50" });
    await db.insert(categoryMappings).values({ householdId: household.id, txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "식비" });
    await db.insert(categoryRules).values({ householdId: household.id, txnType: "지출", paymentMethod: "카드", stdCategory: "식비" });
    await db.insert(categoryKeywordRules).values({ householdId: household.id, txnType: "지출", keyword: "코스트코", stdCategory: "식비" });
    await db.insert(budgetCategories).values({ householdId: household.id, name: "식비", kind: "변동비" });
    return { household, owner };
  }

  test("유일한 구성원이 탈퇴하면 그 가구의 모든 테이블이 0행이 되고, 다른 가구(B)는 그대로다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createFullSchema(db);

    const a = await seedHousehold(db, { name: "A가구", ownerEmail: "a-owner@example.com" });
    const b = await seedHousehold(db, { name: "B가구", ownerEmail: "b-owner@example.com" });
    const bCountBefore = await countRows(db, b.household.id);

    mockAuth.mockResolvedValue({ user: { email: "a-owner@example.com" } });
    const { leaveHouseholdAction } = await import("./members-actions");

    const form = new FormData();
    form.set("confirm", "탈퇴");
    await leaveHouseholdAction(form);

    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/" });
    expect(await countRows(db, a.household.id)).toBe(0);
    const [aHousehold] = await db.select().from(households).where(eq(households.id, a.household.id));
    expect(aHousehold).toBeUndefined();
    const [aUser] = await db.select().from(users).where(eq(users.id, a.owner.id));
    expect(aUser).toBeUndefined();

    expect(await countRows(db, b.household.id)).toBe(bCountBefore);
    const [bHousehold] = await db.select().from(households).where(eq(households.id, b.household.id));
    expect(bHousehold).toBeDefined();
  });

  test("2인 가구에서 owner가 탈퇴하면 남은 구성원이 owner로 승격되고 가구 데이터는 유지된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createFullSchema(db);

    const a = await seedHousehold(db, { name: "A가구", ownerEmail: "a-owner@example.com" });
    const [otherUser] = await db.insert(users).values({ email: "a-member@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: a.household.id, userId: otherUser.id, role: "member" });
    // owner가 만든 초대(다른 사람이 사용)와, owner가 사용해서 합류한 초대 둘 다 심어서
    // created_by(not null)/used_by(nullable) FK 정리가 실제로 동작하는지 확인한다.
    await db.insert(householdInvites).values({
      householdId: a.household.id,
      tokenHash: "hash-created-by-owner",
      createdBy: a.owner.id,
      usedBy: otherUser.id,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await db.insert(householdInvites).values({
      householdId: a.household.id,
      tokenHash: "hash-used-by-owner",
      createdBy: otherUser.id,
      usedBy: a.owner.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    mockAuth.mockResolvedValue({ user: { email: "a-owner@example.com" } });
    const { leaveHouseholdAction } = await import("./members-actions");

    const form = new FormData();
    form.set("confirm", "탈퇴");
    await leaveHouseholdAction(form); // FK 위반 없이 끝나야 한다(초대 정리가 먼저 이뤄짐).

    expect(mockSignOut).toHaveBeenCalledWith({ redirectTo: "/" });

    const [household] = await db.select().from(households).where(eq(households.id, a.household.id));
    expect(household).toBeDefined(); // 가구 데이터는 유지

    const remainingMembers = await db.select().from(householdMembers).where(eq(householdMembers.householdId, a.household.id));
    expect(remainingMembers).toHaveLength(1);
    expect(remainingMembers[0].userId).toBe(otherUser.id);
    expect(remainingMembers[0].role).toBe("owner"); // 승격됨

    const [ownerUserRow] = await db.select().from(users).where(eq(users.id, a.owner.id));
    expect(ownerUserRow).toBeUndefined(); // 탈퇴한 본인 users 행은 삭제

    const remainingInvites = await db.select().from(householdInvites).where(eq(householdInvites.householdId, a.household.id));
    expect(remainingInvites).toHaveLength(1); // owner가 만든 초대는 삭제되고, otherUser가 만든 초대만 남음
    expect(remainingInvites[0].createdBy).toBe(otherUser.id);
    expect(remainingInvites[0].usedBy).toBeNull(); // owner를 가리키던 used_by는 null 처리됨

    const remainingTxns = await db.select().from(transactions).where(eq(transactions.householdId, a.household.id));
    expect(remainingTxns).toHaveLength(1); // 거래 이력 등 가구 데이터는 그대로
  });

  test("member는 가구 삭제를 시도할 수 없다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createFullSchema(db);

    const a = await seedHousehold(db, { name: "A가구", ownerEmail: "a-owner@example.com" });
    const [memberUser] = await db.insert(users).values({ email: "a-member@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: a.household.id, userId: memberUser.id, role: "member" });

    mockAuth.mockResolvedValue({ user: { email: "a-member@example.com" } });
    const { deleteHouseholdAction } = await import("./members-actions");

    const form = new FormData();
    form.set("householdName", "A가구");
    const redirectUrl = await expectRedirect(deleteHouseholdAction(form));
    expect(redirectUrl).toContain("error=");

    const [household] = await db.select().from(households).where(eq(households.id, a.household.id));
    expect(household).toBeDefined();
  });

  test("가구 이름이 일치하지 않으면 삭제가 거부된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createFullSchema(db);

    const a = await seedHousehold(db, { name: "A가구", ownerEmail: "a-owner@example.com" });
    mockAuth.mockResolvedValue({ user: { email: "a-owner@example.com" } });
    const { deleteHouseholdAction } = await import("./members-actions");

    const form = new FormData();
    form.set("householdName", "이름다름");
    const redirectUrl = await expectRedirect(deleteHouseholdAction(form));
    expect(redirectUrl).toContain("error=");

    const [household] = await db.select().from(households).where(eq(households.id, a.household.id));
    expect(household).toBeDefined();
  });

  test("owner가 가구를 삭제하면 A 전 테이블이 0행이 되고, 다른 구성원 users 행은 남으며, B는 불변이다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createFullSchema(db);

    const a = await seedHousehold(db, { name: "A가구", ownerEmail: "a-owner@example.com" });
    const [otherUser] = await db.insert(users).values({ email: "a-member@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: a.household.id, userId: otherUser.id, role: "member" });
    const b = await seedHousehold(db, { name: "B가구", ownerEmail: "b-owner@example.com" });
    const bCountBefore = await countRows(db, b.household.id);

    mockAuth.mockResolvedValue({ user: { email: "a-owner@example.com" } });
    const { deleteHouseholdAction } = await import("./members-actions");

    const form = new FormData();
    form.set("householdName", "A가구");
    const redirectUrl = await expectRedirect(deleteHouseholdAction(form));
    expect(redirectUrl).toBe("/onboarding");

    expect(await countRows(db, a.household.id)).toBe(0);
    const [aHousehold] = await db.select().from(households).where(eq(households.id, a.household.id));
    expect(aHousehold).toBeUndefined();

    // owner 본인과 다른 구성원의 users 행은 남는다(다음 로그인 시 온보딩으로).
    const [ownerUserRow] = await db.select().from(users).where(eq(users.id, a.owner.id));
    expect(ownerUserRow).toBeDefined();
    const [otherUserRow] = await db.select().from(users).where(eq(users.id, otherUser.id));
    expect(otherUserRow).toBeDefined();

    expect(await countRows(db, b.household.id)).toBe(bCountBefore);
    const [bHousehold] = await db.select().from(households).where(eq(households.id, b.household.id));
    expect(bHousehold).toBeDefined();
  });
});
