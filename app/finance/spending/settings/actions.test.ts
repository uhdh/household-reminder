// 설정 탭의 매핑/규칙/키워드 규칙 추가·삭제가 실제로 rederiveTransactions(우선순위대로 재계산)를
// 거치는지 검증한다: locked 거래는 불변, 삭제 시에도 영향 거래가 재계산되는지, ILIKE 이스케이프가
// 적용되는지를 서버 액션을 통해(단위 함수가 아니라) 확인한다.
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules, people, transactions, uploads } from "@/lib/finance-db";

const HOUSEHOLD_ID = vi.hoisted(() => "00000000-0000-4000-8000-000000000001");
const UPLOAD_ID = "00000000-0000-0000-0000-000000000001";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/require-household", () => ({
  requireHousehold: vi.fn().mockResolvedValue({ userId: "test-user", householdId: HOUSEHOLD_ID, role: "owner", email: "test@example.com" }),
}));

// people/uploads: 매핑·규칙 편집 액션이 rederiveTransactions 뒤에 applyHouseholdTransferPairs를
// 호출하게 되면서(getActiveTransactions가 이 두 테이블을 읽는다) 함께 필요해졌다.
async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL,
      txn_date date NOT NULL, txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
      amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL DEFAULT true,
      is_internal_transfer boolean NOT NULL DEFAULT false, beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_mappings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, raw_category text NOT NULL,
      raw_subcategory text NOT NULL, std_category text NOT NULL,
      UNIQUE (household_id, txn_type, raw_category, raw_subcategory)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, payment_method text NOT NULL,
      std_category text NOT NULL,
      UNIQUE (household_id, txn_type, payment_method)
    )
  `);
  await db.execute(sql`
    CREATE TABLE category_keyword_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, keyword text NOT NULL,
      std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (household_id, keyword)
    )
  `);
  await db.insert(people).values({ id: "husband", householdId: HOUSEHOLD_ID, displayName: "남편" });
  await db.insert(uploads).values({ id: UPLOAD_ID, householdId: HOUSEHOLD_ID, personId: "husband", sourceFilename: "테스트", isActive: true });
}

function txnRow(overrides: Partial<typeof transactions.$inferInsert>) {
  return {
    householdId: HOUSEHOLD_ID,
    uploadId: UPLOAD_ID,
    personId: "husband",
    txnDate: "2026-08-10",
    txnType: "지출",
    category: "식비",
    subcategory: "한식",
    description: "순대국밥",
    amount: "-10000",
    stdCategory: null,
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    ...overrides,
  };
}

describe("settings actions -> rederiveTransactions 연동", () => {
  afterEach(() => setDbForTesting(null));

  test("매핑 추가 시 locked 거래는 그대로 두고, locked=false 거래만 재계산한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    // 잠긴 행과 미분류 행은 서로 다른 가맹점이어야 한다 - 설명이 같으면 가맹점 기억이 끼어들어
    // (locked 행이 학습시킨 값을 unlocked 행이 그대로 물려받아) 이 테스트가 확인하려는
    // "새 매핑대로 재계산" 경로와 구분이 안 된다.
    const [locked, unlocked] = await db
      .insert(transactions)
      .values([
        txnRow({ description: "동네정육점", stdCategory: "기타", categoryLocked: true }),
        txnRow({ description: "다른식당", stdCategory: null, categoryLocked: false }),
      ])
      .returning();

    const { upsertCategoryMappingAction } = await import("./actions");
    const form = new FormData();
    form.set("txnType", "지출");
    form.set("rawCategory", "식비");
    form.set("rawSubcategory", "한식");
    form.set("stdCategory", "식비");
    await upsertCategoryMappingAction(form);

    const [afterLocked] = await db.select().from(transactions).where(eq(transactions.id, locked.id));
    const [afterUnlocked] = await db.select().from(transactions).where(eq(transactions.id, unlocked.id));
    expect(afterLocked.stdCategory).toBe("기타"); // 직접 고친 값 유지
    expect(afterUnlocked.stdCategory).toBe("식비"); // 새 매핑대로 재계산
  });

  test("매핑 삭제 시 영향받는 거래가 미분류로 재계산된다(전에는 그대로 남아있던 버그)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [mapping] = await db
      .insert(categoryMappings)
      .values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "미분류", stdCategory: "여행" })
      .returning();
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ category: "여행/숙박", subcategory: "미분류", description: "호텔", stdCategory: "여행" }))
      .returning();

    const { deleteCategoryMappingAction } = await import("./actions");
    const form = new FormData();
    form.set("id", mapping.id);
    await deleteCategoryMappingAction(form);

    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBeNull();
  });

  test("결제수단 규칙 삭제 시 영향받는 거래가 재계산된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [rule] = await db
      .insert(categoryRules)
      .values({ householdId: HOUSEHOLD_ID, txnType: "지출", paymentMethod: "MG생활비통장", stdCategory: "대출원리금" })
      .returning();
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ paymentMethod: "MG생활비통장", stdCategory: "대출원리금" }))
      .returning();

    const { deleteCategoryRuleAction } = await import("./actions");
    const form = new FormData();
    form.set("id", rule.id);
    await deleteCategoryRuleAction(form);

    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBeNull();
  });

  test("키워드 규칙 적용(applyToExisting) 시 ILIKE 특수문자를 이스케이프한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [literalMatch, unrelated] = await db
      .insert(transactions)
      .values([
        txnRow({ description: "50% 할인쿠폰 사용" }),
        txnRow({ description: "50000원 결제" }), // 이스케이프 없으면 ILIKE '%50%%'에 잘못 걸림
      ])
      .returning();

    const { upsertCategoryKeywordRuleAction } = await import("./actions");
    const form = new FormData();
    form.set("txnType", "지출");
    form.set("keyword", "50%");
    form.set("stdCategory", "할인");
    form.set("applyToExisting", "true");
    await upsertCategoryKeywordRuleAction(form);

    const [afterLiteral] = await db.select().from(transactions).where(eq(transactions.id, literalMatch.id));
    const [afterUnrelated] = await db.select().from(transactions).where(eq(transactions.id, unrelated.id));
    expect(afterLiteral.stdCategory).toBe("할인");
    expect(afterUnrelated.stdCategory).toBeNull();
  });

  test("키워드 규칙 삭제 시 영향받는 거래가 재계산된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [rule] = await db
      .insert(categoryKeywordRules)
      .values({ householdId: HOUSEHOLD_ID, txnType: "지출", keyword: "코스트코", stdCategory: "식재료" })
      .returning();
    const [row] = await db
      .insert(transactions)
      .values(txnRow({ description: "코스트코", stdCategory: "식재료" }))
      .returning();

    const { deleteCategoryKeywordRuleAction } = await import("./actions");
    const form = new FormData();
    form.set("id", rule.id);
    await deleteCategoryKeywordRuleAction(form);

    const [after] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(after.stdCategory).toBeNull();
  });
});

describe("rederivePreviewAction / rederiveAllAction - 미리보기는 쓰지 않고, 적용만 실제로 쓴다", () => {
  afterEach(() => setDbForTesting(null));

  test("미리보기(dryRun)는 변경 건수만 알려주고 DB는 그대로다 - 적용해야 실제로 바뀐다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(categoryMappings).values({ householdId: HOUSEHOLD_ID, txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "한식비" });
    const [row] = await db.insert(transactions).values(txnRow({ stdCategory: null })).returning();

    const { rederivePreviewAction, rederiveAllAction } = await import("./actions");

    const preview = await rederivePreviewAction();
    expect(preview.changed).toBe(1);
    expect(preview.reclassified).toBe(1);
    expect(preview.transitions?.[0]).toMatchObject({ from: null, to: "한식비", count: 1 });
    const [afterPreview] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(afterPreview.stdCategory).toBeNull(); // 미리보기는 아직 아무것도 안 바꾼다

    const applied = await rederiveAllAction();
    expect(applied.changed).toBe(1);
    const [afterApply] = await db.select().from(transactions).where(eq(transactions.id, row.id));
    expect(afterApply.stdCategory).toBe("한식비"); // 적용해야 실제로 바뀐다
  });
});
