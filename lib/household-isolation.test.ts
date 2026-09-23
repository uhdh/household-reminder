// 여러 가구 격리 테스트: household B의 데이터가 household A 컨텍스트에서 절대 보이거나
// 바뀌지 않는지 확인한다. requireHousehold()를 A로 고정한 채, 조회 함수·서버 액션·export
// API가 B 행을 반환/변경하지 않는지 PGlite로 검증한다.
// docs/superpowers/specs/2026-09-24-multi-household-design.md 참고.
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { transactions, uploads, categoryKeywordRules } from "@/lib/finance-db";
import { getActiveTransactions } from "@/lib/spending-queries";

const { HOUSEHOLD_A, HOUSEHOLD_B } = vi.hoisted(() => ({
  HOUSEHOLD_A: "00000000-0000-4000-8000-00000000000a",
  HOUSEHOLD_B: "00000000-0000-4000-8000-00000000000b",
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/require-household", () => ({
  requireHousehold: vi.fn().mockResolvedValue({ userId: "user-a", householdId: HOUSEHOLD_A, role: "owner", email: "a@example.com" }),
}));
vi.mock("@/lib/finance-viewer-server", () => ({
  isFinanceDemoMode: vi.fn().mockResolvedValue(false),
}));

async function createSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY, household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true,
      uploaded_at timestamp with time zone NOT NULL DEFAULT now()
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
}

function txnRow(overrides: Partial<typeof transactions.$inferInsert>) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    householdId: HOUSEHOLD_A,
    uploadId: "00000000-0000-0000-0000-000000000001",
    personId: "husband",
    txnDate: "2026-08-10",
    txnType: "지출",
    category: "식비",
    subcategory: "한식",
    description: "코스트코",
    amount: "-10000",
    stdCategory: "식비",
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    ...overrides,
  };
}

describe("household isolation", () => {
  afterEach(() => setDbForTesting(null));

  test("getActiveTransactions never returns another household's rows", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(uploads).values([
      { id: "00000000-0000-0000-0000-000000000001", householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "a.xlsx", isActive: true },
      { id: "00000000-0000-0000-0000-000000000002", householdId: HOUSEHOLD_B, personId: "husband", sourceFilename: "b.xlsx", isActive: true },
    ]);
    await db.insert(transactions).values([
      txnRow({ id: "00000000-0000-4000-8000-0000000000a1", householdId: HOUSEHOLD_A, uploadId: "00000000-0000-0000-0000-000000000001" }),
      txnRow({ id: "00000000-0000-4000-8000-0000000000b1", householdId: HOUSEHOLD_B, uploadId: "00000000-0000-0000-0000-000000000002", description: "가구B전용" }),
    ]);

    const resultA = await getActiveTransactions(HOUSEHOLD_A);
    expect(resultA.transactions.map((t) => t.id)).toEqual(["00000000-0000-4000-8000-0000000000a1"]);

    const resultB = await getActiveTransactions(HOUSEHOLD_B);
    expect(resultB.transactions.map((t) => t.id)).toEqual(["00000000-0000-4000-8000-0000000000b1"]);
  });

  test("A가 B의 거래 id로 삭제/카테고리 변경/일괄 변경을 시도해도 B 행은 바뀌지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const bTxnId = "00000000-0000-4000-8000-0000000000b2";
    await db.insert(uploads).values({ id: "00000000-0000-0000-0000-000000000002", householdId: HOUSEHOLD_B, personId: "husband", sourceFilename: "b.xlsx", isActive: true });
    await db.insert(transactions).values(
      txnRow({ id: bTxnId, householdId: HOUSEHOLD_B, uploadId: "00000000-0000-0000-0000-000000000002", stdCategory: "식비" })
    );

    const { deleteTransactionAction, deleteTransactionsAction, updateTransactionCategoryAction, updateTransactionsCategoryAction } = await import(
      "@/app/finance/spending/actions"
    );

    // requireHousehold()는 A로 고정되어 있다(위 vi.mock). B의 거래 id를 넘겨도 A 소속이 아니므로 전부 무시돼야 한다.
    const deleteForm = new FormData();
    deleteForm.set("txnId", bTxnId);
    await deleteTransactionAction(deleteForm);

    const bulkDeleteForm = new FormData();
    bulkDeleteForm.append("txnId", bTxnId);
    await deleteTransactionsAction(bulkDeleteForm);

    const categoryForm = new FormData();
    categoryForm.set("txnId", bTxnId);
    categoryForm.set("stdCategory", "여행");
    await updateTransactionCategoryAction(categoryForm);

    const bulkCategoryForm = new FormData();
    bulkCategoryForm.append("txnId", bTxnId);
    bulkCategoryForm.set("stdCategory", "여행");
    await updateTransactionsCategoryAction(bulkCategoryForm);

    const [remaining] = await db.select().from(transactions).where(sql`id = ${bTxnId}`);
    expect(remaining).toBeDefined();
    expect(remaining.stdCategory).toBe("식비"); // 바뀌지 않음
    expect(remaining.householdId).toBe(HOUSEHOLD_B);
  });

  test("A의 키워드 규칙 생성은 B의 동일 키워드 거래에 영향을 주지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    const bTxnId = "00000000-0000-4000-8000-0000000000b3";
    await db.insert(uploads).values({ id: "00000000-0000-0000-0000-000000000003", householdId: HOUSEHOLD_B, personId: "husband", sourceFilename: "b.xlsx", isActive: true });
    await db.insert(transactions).values(
      txnRow({
        id: bTxnId,
        householdId: HOUSEHOLD_B,
        uploadId: "00000000-0000-0000-0000-000000000003",
        description: "코스트코 장보기", // A가 등록할 키워드("코스트코")와 겹치는 설명
        stdCategory: null,
      })
    );

    const { createKeywordRuleAndApplyAction } = await import("@/app/finance/spending/actions");

    const form = new FormData();
    form.set("keyword", "코스트코");
    form.set("stdCategory", "식재료");
    form.set("txnType", "지출");
    await createKeywordRuleAndApplyAction(form);

    // 키워드 규칙은 A 소속으로만 생성된다.
    const rules = await db.select().from(categoryKeywordRules);
    expect(rules).toHaveLength(1);
    expect(rules[0].householdId).toBe(HOUSEHOLD_A);

    // B의 거래는 여전히 미분류(stdCategory null)다 - A의 규칙 생성이 넘어가지 않았다.
    const [bTxn] = await db.select().from(transactions).where(sql`id = ${bTxnId}`);
    expect(bTxn.stdCategory).toBeNull();
  });

  test("export route는 로그인한 가구(A)의 거래만 내보낸다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);

    await db.insert(uploads).values([
      { id: "00000000-0000-0000-0000-000000000001", householdId: HOUSEHOLD_A, personId: "husband", sourceFilename: "a.xlsx", isActive: true },
      { id: "00000000-0000-0000-0000-000000000002", householdId: HOUSEHOLD_B, personId: "husband", sourceFilename: "b.xlsx", isActive: true },
    ]);
    await db.insert(transactions).values([
      txnRow({
        id: "00000000-0000-4000-8000-0000000000a4",
        householdId: HOUSEHOLD_A,
        uploadId: "00000000-0000-0000-0000-000000000001",
        txnDate: "2026-08-10",
        description: "A의 거래",
      }),
      txnRow({
        id: "00000000-0000-4000-8000-0000000000b4",
        householdId: HOUSEHOLD_B,
        uploadId: "00000000-0000-0000-0000-000000000002",
        txnDate: "2026-08-10",
        description: "B의 거래",
      }),
    ]);

    const { GET } = await import("@/app/api/finance/spending/export/route");
    const { NextRequest } = await import("next/server");
    const ExcelJS = (await import("exceljs")).default;

    const req = new NextRequest("http://localhost:3000/api/finance/spending/export?month=2026-08");
    const response = await GET(req);
    expect(response.status).toBe(200);

    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const ws = workbook.getWorksheet("세부내역");
    expect(ws?.rowCount).toBe(2); // header + A의 거래 1건만
    expect(ws?.getRow(2).getCell(6).value).toBe("A의 거래");
  });
});
