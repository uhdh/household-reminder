import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";
import { getActiveTransactions } from "@/lib/spending-queries";
import { addManualTransactionAction, deleteTransactionsAction } from "./actions";

// actions.ts는 "use server" 파일이라 async 함수 외의 export를 둘 수 없어, 여기서는 실제
// 코드가 쓰는 값과 같은 문자열 리터럴로 직접 검증한다.
const MANUAL_UPLOAD_FILENAME = "수동 입력";

const HOUSEHOLD_ID = vi.hoisted(() => "00000000-0000-4000-8000-000000000099");
const mockParseUploadFile = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/require-household", () => ({ requireHousehold: vi.fn().mockResolvedValue({ userId: "test-user", householdId: HOUSEHOLD_ID, role: "owner", email: "test@example.com" }) }));
// 업로드 재연결 테스트에서는 실제 뱅크샐러드 엑셀 형식을 구성할 필요 없이, 파싱 결과만 흉내 낸다
// (검증 대상은 파서가 아니라 app/finance/upload/actions.ts의 업로드/재연결 로직이다).
vi.mock("@/lib/finance-parse", () => ({ parseUploadFile: (...args: unknown[]) => mockParseUploadFile(...args) }));

async function createUploadSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
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

function manualEntryForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("returnTo", "/finance/spending?month=2026-09");
  form.set("personId", "husband");
  form.set("beneficiary", "husband");
  form.set("txnDate", "2026-09-05");
  form.set("stdCategory", "식비");
  form.set("amount", "8000");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("addManualTransactionAction", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockParseUploadFile.mockReset();
  });

  test("업로드가 하나도 없는 가구에서도 수동 입력에 성공하고, 수동 입력 전용 업로드를 재사용한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createUploadSchema(db);
    await db.insert(people).values({ id: "husband", householdId: HOUSEHOLD_ID, displayName: "남편" });

    await addManualTransactionAction(manualEntryForm());

    const uploadRows = await db.select().from(uploads);
    expect(uploadRows).toHaveLength(1);
    expect(uploadRows[0].sourceFilename).toBe(MANUAL_UPLOAD_FILENAME);
    expect(uploadRows[0].isActive).toBe(true);

    const txRows = await db.select().from(transactions);
    expect(txRows).toHaveLength(1);
    expect(txRows[0].uploadId).toBe(uploadRows[0].id);
    expect(txRows[0].category).toBe("직접 입력");

    // 두 번째 수동 입력은 새 업로드를 또 만들지 않고 같은(활성) 업로드를 재사용한다.
    await addManualTransactionAction(manualEntryForm({ txnDate: "2026-09-06" }));
    expect(await db.select().from(uploads)).toHaveLength(1);
    expect(await db.select().from(transactions)).toHaveLength(2);
  });

  test("수동 입력 후 같은 보유자가 실제 엑셀을 업로드해도 수동 거래가 사라지거나 중복되지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createUploadSchema(db);
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
    await db.insert(people).values([
      { id: "husband", householdId: HOUSEHOLD_ID, displayName: "남편" },
      { id: "wife", householdId: HOUSEHOLD_ID, displayName: "아내" },
    ]);

    // 다른 가구/사람 데이터가 이 로직에 섞이지 않는지도 함께 확인.
    const OTHER_HOUSEHOLD = "00000000-0000-4000-8000-000000000098";

    await addManualTransactionAction(manualEntryForm());
    const [manualUpload] = await db.select().from(uploads);

    mockParseUploadFile.mockResolvedValue({
      customerName: null,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      assetItems: [],
      transactions: [
        {
          txnDate: "2026-09-10",
          txnTime: null,
          txnType: "지출",
          category: "식비",
          subcategory: "한식",
          description: "김밥천국",
          amount: 8000,
          paymentMethod: "카드",
        },
      ],
    });

    const { uploadAction } = await import("@/app/finance/upload/actions");
    const uploadForm = new FormData();
    uploadForm.set("personId", "husband");
    uploadForm.set("file", new File(["dummy"], "가계부_2026-09-01~2026-09-30.xlsx"));
    await uploadAction(uploadForm);

    const uploadRows = await db.select().from(uploads);
    expect(uploadRows).toHaveLength(2);
    const oldUpload = uploadRows.find((u) => u.id === manualUpload.id)!;
    const newUpload = uploadRows.find((u) => u.id !== manualUpload.id)!;
    expect(oldUpload.isActive).toBe(false); // 수동 입력 전용 업로드는 비활성화됨
    expect(newUpload.isActive).toBe(true);
    expect(newUpload.sourceFilename).not.toBe(MANUAL_UPLOAD_FILENAME);

    // 수동 거래는 지워지지 않고 새 업로드로 재연결된다.
    const manualTx = (await db.select().from(transactions)).find((t) => t.category === "직접 입력")!;
    expect(manualTx).toBeDefined();
    expect(manualTx.uploadId).toBe(newUpload.id);

    // 활성 거래 조회에는 수동 거래(1건) + 엑셀 거래(1건)만 남고, 다른 가구는 영향받지 않는다.
    const active = await getActiveTransactions(HOUSEHOLD_ID);
    expect(active.transactions).toHaveLength(2);
    expect(active.transactions.filter((t) => t.category === "직접 입력")).toHaveLength(1);
    const otherHouseholdActive = await getActiveTransactions(OTHER_HOUSEHOLD);
    expect(otherHouseholdActive.transactions).toHaveLength(0);
  });
});

describe("deleteTransactionsAction", () => {
  afterEach(() => setDbForTesting(null));

  test("deletes only the selected transactions", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
        txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);
    const rows = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"].map((id) => ({
      id,
      householdId: HOUSEHOLD_ID,
      uploadId: "00000000-0000-0000-0000-000000000001",
      personId: "wife",
      txnDate: "2026-08-01",
      txnType: "지출",
      amount: "-1000",
      included: true,
      isInternalTransfer: false,
      beneficiary: "wife",
    }));
    await db.insert(transactions).values(rows);
    const formData = new FormData();
    formData.append("txnId", rows[0].id);
    formData.set("returnTo", "/finance/spending?month=2026-08");

    await deleteTransactionsAction(formData);

    expect((await db.select({ id: transactions.id }).from(transactions)).map((row) => row.id)).toEqual([rows[1].id]);
  });

  test("createKeywordRuleAndApplyAction saves rule and bulk updates matching transactions", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await db.execute(sql`
      CREATE TABLE category_keyword_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id uuid NOT NULL,
        txn_type text NOT NULL,
        keyword text NOT NULL,
        std_category text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        UNIQUE (household_id, keyword)
      )
    `);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
        txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);

    const { categoryKeywordRules } = await import("@/lib/finance-db");
    const { createKeywordRuleAndApplyAction } = await import("./actions");

    const rows = [
      {
        id: "00000000-0000-4000-8000-000000000021",
        householdId: HOUSEHOLD_ID,
        uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "husband",
        txnDate: "2026-08-21",
        txnType: "지출",
        category: "온라인쇼핑",
        subcategory: "인터넷쇼핑",
        description: "코스트코코리아",
        amount: "-297020",
        stdCategory: "온라인쇼핑",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
      {
        id: "00000000-0000-4000-8000-000000000022",
        householdId: HOUSEHOLD_ID,
        uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "husband",
        txnDate: "2026-07-21",
        txnType: "지출",
        category: "온라인쇼핑",
        subcategory: "인터넷쇼핑",
        description: "코스트코온라인몰",
        amount: "-150000",
        stdCategory: "온라인쇼핑",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
      {
        id: "00000000-0000-4000-8000-000000000023",
        householdId: HOUSEHOLD_ID,
        uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "husband",
        txnDate: "2026-08-10",
        txnType: "지출",
        category: "식비",
        subcategory: "한식",
        description: "순대국밥",
        amount: "-10000",
        stdCategory: "식비",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
      {
        // 설명에 "코스트코"가 포함돼 ILIKE라면 잘못 걸렸을 거래. applyTxnId 목록에 없으므로
        // 정확 일치 방식에서는 건드리지 않아야 한다.
        id: "00000000-0000-4000-8000-000000000024",
        householdId: HOUSEHOLD_ID,
        uploadId: "00000000-0000-0000-0000-000000000001",
        personId: "husband",
        txnDate: "2026-08-15",
        txnType: "지출",
        category: "주차",
        subcategory: "주차",
        description: "코스트코 주차장",
        amount: "-5000",
        stdCategory: "주차",
        included: true,
        isInternalTransfer: false,
        beneficiary: "husband",
      },
    ];
    await db.insert(transactions).values(rows);

    const formData = new FormData();
    formData.set("txnId", rows[0].id);
    formData.set("keyword", "코스트코");
    formData.set("stdCategory", "식재료");
    formData.set("txnType", "지출");
    formData.set("applyToExisting", "true");
    // page.tsx가 정규화 가맹점 키 + txnType 정확 일치로 미리 골라준 id만 일괄 적용 대상이 된다
    // (ILIKE 부분일치로 무관한 거래까지 바뀌는 것을 막기 위함).
    formData.append("applyTxnId", rows[1].id);
    formData.set("returnTo", "/finance/spending?month=2026-08");

    await createKeywordRuleAndApplyAction(formData);

    // Verify rule was saved
    const rules = await db.select().from(categoryKeywordRules);
    expect(rules).toHaveLength(1);
    expect(rules[0].keyword).toBe("코스트코");
    expect(rules[0].stdCategory).toBe("식재료");

    // Verify both Costco transactions (txnId + applyTxnId) were updated to '식재료', and '순대국밥'
    // and "코스트코 주차장"(설명에 키워드가 섞여 있지만 목록에 없음)은 건드리지 않았는지 확인.
    const txAfter = await db.select().from(transactions);
    const costco1 = txAfter.find((t) => t.id === rows[0].id);
    const costco2 = txAfter.find((t) => t.id === rows[1].id);
    const other = txAfter.find((t) => t.id === rows[2].id);
    const unrelatedCostcoMention = txAfter.find((t) => t.id === rows[3].id);

    expect(costco1?.stdCategory).toBe("식재료");
    expect(costco2?.stdCategory).toBe("식재료");
    expect(other?.stdCategory).toBe("식비");
    expect(unrelatedCostcoMention?.stdCategory).toBe("주차");
  });
});
