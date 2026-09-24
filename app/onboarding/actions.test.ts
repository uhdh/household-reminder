// 온보딩(새 가구 만들기) 검증: household + owner + people(uuid id) + 기본 카테고리 시드가 생기고,
// 그 직후 월별 페이지가 쓰는 데이터 함수(getActiveTransactions)가 새 가구에서 정상 동작하는지 확인.
import { drizzle } from "drizzle-orm/pglite";
import { sql, eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { budgetCategories, categoryKeywordRules, categoryMappings, householdMembers, people, transactions, uploads, users } from "@/lib/finance-db";
import { getActiveTransactions } from "@/lib/spending-queries";

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
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE category_mappings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, raw_category text NOT NULL,
      raw_subcategory text NOT NULL, std_category text NOT NULL,
      UNIQUE (household_id, txn_type, raw_category, raw_subcategory)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_keyword_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, keyword text NOT NULL,
      std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (household_id, keyword)
    )
  `);
  await db.execute(sql`
    CREATE TABLE budget_categories (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, name text NOT NULL, kind text NOT NULL,
      sort_order numeric NOT NULL DEFAULT 0, monthly_budget numeric,
      UNIQUE (household_id, name)
    )
  `);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL
    )
  `);
}

describe("createHouseholdAction", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockAuth.mockReset();
  });

  test("가구·owner·people·기본 카테고리를 만들고, 그 직후 새 가구에서 월별 데이터 함수가 정상 동작한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    mockAuth.mockResolvedValue({ user: { email: "Owner@Example.com", name: "김소유" } });
    const { createHouseholdAction } = await import("./actions");

    const form = new FormData();
    form.set("householdName", "새가구");
    form.set("displayName", "나");
    const redirectTo = await expectRedirect(createHouseholdAction(form));
    expect(redirectTo).toBe("/finance");

    const [user] = await db.select().from(users).where(eq(users.email, "owner@example.com"));
    expect(user).toBeDefined();

    const memberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("owner");
    const householdId = memberships[0].householdId;

    const peopleRows = await db.select().from(people).where(eq(people.householdId, householdId));
    expect(peopleRows).toHaveLength(1);
    expect(peopleRows[0].displayName).toBe("나");
    // 새 가구 구성원 id는 uuid 문자열이어야 한다(기존 'husband'/'wife'와 충돌 방지).
    expect(peopleRows[0].id).toMatch(/^[0-9a-f-]{36}$/);

    const mappings = await db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId));
    const budgets = await db.select().from(budgetCategories).where(eq(budgetCategories.householdId, householdId));
    const keywordRules = await db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId));
    expect(mappings.length).toBeGreaterThan(0);
    expect(budgets.length).toBeGreaterThan(0);
    // 새 가구에는 우리집 전용 정보(실명·가맹점 키워드 규칙, 예산 금액, 개인 카테고리)가 들어가면 안 된다.
    expect(keywordRules).toHaveLength(0);
    expect(budgets.every((b) => b.monthlyBudget === null)).toBe(true);
    expect(budgets.some((b) => b.name === "엄마용돈")).toBe(false);

    // 새로 만든 가구에서 거래 하나를 넣고, 기존 월별/설정 페이지가 쓰는 getActiveTransactions가
    // 정상 동작하는지(다른 가구와 섞이지 않고) 확인한다.
    const uploadId = "00000000-0000-0000-0000-0000000000f1";
    await db.insert(uploads).values({ id: uploadId, householdId, personId: peopleRows[0].id, sourceFilename: "t.xlsx", isActive: true });
    await db.insert(transactions).values({
      id: "00000000-0000-4000-8000-0000000000f2",
      householdId,
      uploadId,
      personId: peopleRows[0].id,
      txnDate: "2026-09-01",
      txnType: "지출",
      amount: "-1000",
      included: true,
      isInternalTransfer: false,
      beneficiary: peopleRows[0].id,
    });

    const result = await getActiveTransactions(householdId);
    expect(result.transactions).toHaveLength(1);
  });

  test("이미 가구가 있으면 새로 만들지 않고 /finance로 보낸다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    mockAuth.mockResolvedValue({ user: { email: "owner2@example.com" } });
    const { createHouseholdAction } = await import("./actions");

    const form = new FormData();
    form.set("householdName", "가구1");
    form.set("displayName", "나");
    await expectRedirect(createHouseholdAction(form));

    const form2 = new FormData();
    form2.set("householdName", "가구2");
    form2.set("displayName", "나또");
    const redirectTo2 = await expectRedirect(createHouseholdAction(form2));
    expect(redirectTo2).toBe("/finance");

    const [user] = await db.select().from(users).where(eq(users.email, "owner2@example.com"));
    const memberships = await db.select().from(householdMembers).where(eq(householdMembers.userId, user.id));
    expect(memberships).toHaveLength(1); // 두 번째 시도로 가구가 하나 더 생기지 않음
  });
});
