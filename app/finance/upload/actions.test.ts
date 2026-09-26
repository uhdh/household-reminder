// 서울페이 업로드/DB 통합 테스트: 업로드가 결제+구매 장부를 저장하고, 서울페이 구매와 같은 금액·
// ±1일 이내인 뱅크샐러드 출금을 자동으로 찾아 집계 제외하는지, 재업로드 멱등성과 뱅크샐러드 쪽
// 부수효과(활성 업로드/asset_items 무변경, 수동입력/서울페이 보존)를 검증한다.
import ExcelJS from "exceljs";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";

const HOUSEHOLD_ID = vi.hoisted(() => "00000000-0000-4000-8000-000000000099");
const mockParseUploadFile = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/require-household", () => ({
  requireHousehold: vi.fn().mockResolvedValue({ userId: "test-user", householdId: HOUSEHOLD_ID, role: "owner", email: "test@example.com" }),
}));
// 서울페이 경로(detectUploadFileKind/parseSeoulPayFile)는 실제 구현을 그대로 쓰고, 뱅크샐러드
// 파서만 목으로 바꿔 가짜 워크북을 만들 필요 없이 그쪽 로직만 검증한다.
vi.mock("@/lib/finance-parse", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance-parse")>()),
  parseUploadFile: (...args: unknown[]) => mockParseUploadFile(...args),
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
      beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false
    )
  `);
  await db.execute(sql`
    CREATE TABLE asset_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, side text NOT NULL,
      category text NOT NULL, product_name text, amount numeric NOT NULL DEFAULT 0, cost_basis numeric, sector text
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
}

/** 실제 서울페이 이용내역 형식(값은 전부 가상)을 흉내 낸 엑셀을 File로 만든다. */
async function seoulPayFile(opts: {
  filename?: string;
  period?: string;
  purchases?: [productName: string, datetime: string, amountA: number][];
  payments?: [merchant: string, datetime: string, amount: number, kind: string][];
}): Promise<File> {
  const wb = new ExcelJS.Workbook();

  const purchaseSheet = wb.addWorksheet("구매내역");
  purchaseSheet.getCell("A3").value = "조회기간";
  purchaseSheet.getCell("B3").value = opts.period ?? "20260901~20260930";
  purchaseSheet.getRow(6).values = ["상품권명", "구매(환불)일", "구매(환불)방법", "거래구분", "거래번호", "고객구매금(A)", "지원금(B)", "총금액(A+B)"];
  (opts.purchases ?? []).forEach(([productName, datetime, amountA], i) => {
    purchaseSheet.getRow(7 + i).values = [productName, datetime, "카드", "구매", `TX-P${i}`, amountA, 0, amountA];
  });

  const paymentSheet = wb.addWorksheet("결제내역");
  paymentSheet.getCell("A3").value = "조회기간";
  paymentSheet.getCell("B3").value = opts.period ?? "20260901~20260930";
  paymentSheet.getRow(6).values = ["결제채널", "거래번호", "결제일", "가맹점", "사업자번호", "가맹점ID", "거래유형", "결제구분", "거래금액", "공급가액", "봉사료", "부가세", "과세여부"];
  (opts.payments ?? []).forEach(([merchant, datetime, amount, kind], i) => {
    paymentSheet.getRow(7 + i).values = ["앱", `TX-M${i}`, datetime, merchant, "111-11-11111", "M", "결제", kind, amount, amount, 0, 0, "과세"];
  });

  const buf = await wb.xlsx.writeBuffer();
  return new File([buf as ArrayBuffer], opts.filename ?? "서울페이_이용내역.xlsx");
}

function uploadForm(file: File, personId = "husband"): FormData {
  const form = new FormData();
  form.set("personId", personId);
  form.set("file", file);
  return form;
}

describe("uploadAction - 서울페이", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockParseUploadFile.mockReset();
  });

  test("결제/구매를 저장하고, 매칭되는 뱅크샐러드 출금을 자동 제외한다(±1일, 잠긴 후보는 건너뜀)", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);

    const bankUploadId = "00000000-0000-4000-8000-0000000000b1";
    await db.insert(uploads).values({ id: bankUploadId, householdId: HOUSEHOLD_ID, personId: "husband", sourceFilename: "뱅크샐러드.xlsx", isActive: true });
    await db.insert(transactions).values([
      // 서울페이 구매(-100000)와 같은 금액, 하루 뒤: 매칭 대상
      { householdId: HOUSEHOLD_ID, uploadId: bankUploadId, personId: "husband", txnDate: "2026-09-06", txnType: "이체", category: "카드대금", subcategory: "체크카드", description: "카드출금", amount: "-100000", paymentMethod: "체크카드", included: true, beneficiary: "husband" },
      // 금액이 같지만 이미 잠긴 행: 매칭 대상에서 제외되어야 함
      { householdId: HOUSEHOLD_ID, uploadId: bankUploadId, personId: "husband", txnDate: "2026-09-06", txnType: "이체", category: "카드대금", subcategory: "체크카드", description: "다른카드출금", amount: "-100000", paymentMethod: "체크카드", included: true, beneficiary: "husband", categoryLocked: true },
    ]);

    const { uploadAction } = await import("./actions");
    const file = await seoulPayFile({
      purchases: [["서울페이상품권", "2026-09-05 10:00", 100000]],
      payments: [
        ["동네마트", "2026-09-06 09:00:00", 15000, "결제"],
        ["분식집", "2026-09-07 12:00:00", 8000, "취소"],
      ],
    });
    const successUrl = await expectRedirect(uploadAction(uploadForm(file)));
    expect(successUrl).toContain("/finance/upload?success=");
    const message = decodeURIComponent(successUrl.split("success=")[1]);
    expect(message).toContain("서울페이 결제 2건 추가");
    expect(message).toContain("상품권 구매 출금 1건 집계 제외");

    const allTx = await db.select().from(transactions);
    const seoulpayRows = allTx.filter((t) => t.category === "서울페이");
    expect(seoulpayRows).toHaveLength(3); // 결제 2 + 구매 1

    const purchaseRow = seoulpayRows.find((t) => t.subcategory === "구매")!;
    expect(purchaseRow.amount).toBe("-100000");
    expect(purchaseRow.stdCategory).toBe("자산수정");
    expect(purchaseRow.included).toBe(false);
    expect(purchaseRow.categoryLocked).toBe(true);
    expect(purchaseRow.uploadId).toBe(bankUploadId); // 활성 업로드에 붙음(새 업로드를 안 만듦)

    const paymentRefund = seoulpayRows.find((t) => t.description === "분식집")!;
    expect(paymentRefund.amount).toBe("8000"); // 취소=환불=양수

    const matchedOutflow = allTx.find((t) => t.description === "카드출금")!;
    expect(matchedOutflow.stdCategory).toBe("자산수정");
    expect(matchedOutflow.included).toBe(false);
    expect(matchedOutflow.categoryLocked).toBe(true);

    const lockedCandidate = allTx.find((t) => t.description === "다른카드출금")!;
    expect(lockedCandidate.stdCategory).toBeNull(); // 원래 잠겨 있던 행은 건드리지 않음

    // 업로드는 새로 안 만들고 기존 활성 업로드 그대로 - 뱅크샐러드 업로드를 비활성화하지 않는다.
    const uploadRows = await db.select().from(uploads);
    expect(uploadRows).toHaveLength(1);
    expect(uploadRows[0].isActive).toBe(true);

    // asset_items는 전혀 건드리지 않는다(테이블 자체엔 아무 것도 안 넣었으므로 0건 유지).
    const { assetItems } = await import("@/lib/finance-db");
    expect(await db.select().from(assetItems)).toHaveLength(0);
  });

  test("같은 파일을 두 번 업로드해도 서울페이 행이 중복되지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);

    const { uploadAction } = await import("./actions");
    const file1 = await seoulPayFile({ payments: [["동네마트", "2026-09-06 09:00:00", 15000, "결제"]] });
    await expectRedirect(uploadAction(uploadForm(file1)));

    const file2 = await seoulPayFile({ payments: [["동네마트", "2026-09-06 09:00:00", 15000, "결제"]] });
    await expectRedirect(uploadAction(uploadForm(file2)));

    const seoulpayRows = (await db.select().from(transactions)).filter((t) => t.category === "서울페이");
    expect(seoulpayRows).toHaveLength(1);
  });

  test("뱅크샐러드 재업로드는 서울페이 행을 보존하고, 새로 들어온 출금을 다시 제외한다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);

    const { uploadAction } = await import("./actions");

    // 1) 서울페이 먼저 업로드(아직 활성 업로드가 없으니 수동 입력형 자리표시자에 붙는다).
    const seoulFile = await seoulPayFile({ purchases: [["서울페이상품권", "2026-09-05 10:00", 100000]] });
    await expectRedirect(uploadAction(uploadForm(seoulFile)));
    const seoulpayCountBefore = (await db.select().from(transactions)).filter((t) => t.category === "서울페이").length;
    expect(seoulpayCountBefore).toBe(1);

    // 2) 뱅크샐러드 업로드(모킹) - 서울페이 구매와 같은 금액의 카드출금을 포함.
    mockParseUploadFile.mockResolvedValue({
      customerName: null,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      assetItems: [],
      transactions: [
        { txnDate: "2026-09-06", txnTime: null, txnType: "이체", category: "카드대금", subcategory: "체크카드", description: "카드출금", amount: -100000, paymentMethod: "체크카드" },
      ],
    });
    const bankFile = new File(["dummy"], "가계부_2026-09-01~2026-09-30.xlsx");
    const successUrl = await expectRedirect(uploadAction(uploadForm(bankFile)));
    const message = decodeURIComponent(successUrl.split("success=")[1]);
    expect(message).toContain("서울페이 상품권 구매 출금 1건 집계 제외");

    const allTx = await db.select().from(transactions);
    const seoulpayRows = allTx.filter((t) => t.category === "서울페이");
    expect(seoulpayRows).toHaveLength(1); // 보존됨(뱅크샐러드 재업로드 기간 삭제에서 안 지워짐)

    const newOutflow = allTx.find((t) => t.description === "카드출금")!;
    expect(newOutflow.stdCategory).toBe("자산수정");
    expect(newOutflow.included).toBe(false);
    expect(newOutflow.categoryLocked).toBe(true);

    // 서울페이 행은 새 뱅크샐러드 업로드로 재연결된다(활성 업로드가 바뀌었으므로).
    const uploadRows = await db.select().from(uploads);
    const activeUpload = uploadRows.find((u) => u.isActive)!;
    expect(seoulpayRows[0].uploadId).toBe(activeUpload.id);
  });
});

describe("uploadAction - 가맹점 기억(merchant memory)", () => {
  afterEach(() => {
    setDbForTesting(null);
    mockParseUploadFile.mockReset();
  });

  test("이전에 사용자가 직접 고쳐 잠근(locked) 가맹점과 같은 거래는 매핑이 없어도 기억으로 자동 분류된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);

    const oldUploadId = "00000000-0000-4000-8000-0000000000d1";
    await db.insert(uploads).values({ id: oldUploadId, householdId: HOUSEHOLD_ID, personId: "husband", sourceFilename: "이전 업로드.xlsx", isActive: false });
    // 이전 업로드에서 사용자가 "스타벅스"를 직접 "식비"로 고쳐 잠근 거래(매핑 테이블에는 없는 원본 조합).
    await db.insert(transactions).values({
      householdId: HOUSEHOLD_ID,
      uploadId: oldUploadId,
      personId: "husband",
      txnDate: "2026-08-05",
      txnType: "지출",
      category: "카페",
      subcategory: "미분류",
      description: "스타벅스",
      amount: "-5000",
      paymentMethod: "체크카드",
      stdCategory: "식비",
      included: true,
      isInternalTransfer: false,
      beneficiary: "husband",
      categoryLocked: true,
    });

    mockParseUploadFile.mockResolvedValue({
      customerName: null,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      assetItems: [],
      transactions: [
        { txnDate: "2026-09-06", txnTime: null, txnType: "지출", category: "카페", subcategory: "미분류", description: "스타벅스", amount: -4500, paymentMethod: "체크카드" },
      ],
    });

    const { uploadAction } = await import("./actions");
    const bankFile = new File(["dummy"], "가계부_2026-09-01~2026-09-30.xlsx");
    const successUrl = await expectRedirect(uploadAction(uploadForm(bankFile)));
    const message = decodeURIComponent(successUrl.split("success=")[1]);
    expect(message).toContain("자동 분류 1건");

    const newRow = (await db.select().from(transactions)).find((t) => t.txnDate === "2026-09-06")!;
    expect(newRow.stdCategory).toBe("식비"); // 매핑 테이블엔 없지만 가맹점 기억으로 분류됨
    expect(newRow.categoryLocked).toBe(false); // 자동 분류일 뿐 잠기지는 않음
  });
});
