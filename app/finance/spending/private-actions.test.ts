// 나만 보기 변경 권한 검증(PGlite): 본인 거래만 토글, 파트너의 비공개 거래는 수정·삭제·일괄 삭제·
// 카테고리 변경·"미분류로 되돌리기"가 모두 0행 변경, 연결 없는 계정은 토글 불가, 수기 입력 검증.
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, setDbForTesting } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { createPrivateSchema, H, ID_PRIV_H, ID_PUB, seedPrivateHousehold } from "@/lib/spending-private-fixtures";

const mockRequireHousehold = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/require-household", () => ({ requireHousehold: mockRequireHousehold }));

function asViewer(personId: string | null) {
  mockRequireHousehold.mockResolvedValue({ userId: "u", householdId: H, role: "member", email: "t@example.com", personId });
}

/** redirect()가 던지는 REDIRECT 예외는 정상 종료로 취급하고 이동 URL을 돌려준다. */
async function run(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return e.message.slice(9);
    throw e;
  }
  return null;
}

function form(fields: Record<string, string>, multi: Record<string, string[]> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  for (const [k, vs] of Object.entries(multi)) for (const v of vs) f.append(k, v);
  return f;
}

async function row(id: string) {
  const [r] = await getDb().select().from(transactions).where(eq(transactions.id, id));
  return r;
}

describe("나만 보기 변경 권한", () => {
  beforeEach(async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    // 재계산 경로("미분류로 되돌리기")가 읽는 테이블
    await db.execute(sql`CREATE TABLE category_mappings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, raw_category text NOT NULL, raw_subcategory text NOT NULL, std_category text NOT NULL)`);
    await db.execute(sql`CREATE TABLE category_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, payment_method text NOT NULL, std_category text NOT NULL)`);
    await db.execute(sql`CREATE TABLE category_keyword_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, keyword text NOT NULL, std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await seedPrivateHousehold(db);
  });
  afterEach(() => {
    setDbForTesting(null);
    mockRequireHousehold.mockReset();
  });

  test("내가 결제한 거래는 나만 보기로 켜고 끌 수 있다", async () => {
    const { setTransactionPrivateAction } = await import("./actions");
    asViewer("husband");

    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(true);

    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "0", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);
  });

  test("파트너 거래·연결 없는 계정은 토글할 수 없다", async () => {
    const { setTransactionPrivateAction } = await import("./actions");

    asViewer("wife");
    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);

    asViewer("wife");
    await run(setTransactionPrivateAction(form({ txnId: ID_PRIV_H, private: "0", returnTo: "/finance/spending" })));
    expect((await row(ID_PRIV_H)).isPrivate).toBe(true);

    asViewer(null);
    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);
  });

  test("파트너(아내)는 남편의 비공개 거래를 삭제·일괄 삭제·카테고리/사용 대상 변경·미분류 되돌리기 할 수 없다", async () => {
    const actions = await import("./actions");
    asViewer("wife");

    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    await run(actions.deleteTransactionsAction(form({}, { txnId: [ID_PRIV_H] })));
    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "여행" })));
    await run(actions.updateTransactionsCategoryAction(form({ stdCategory: "여행" }, { txnId: [ID_PRIV_H] })));
    await run(actions.updateBeneficiaryAction(form({ txnId: ID_PRIV_H, beneficiary: "wife" })));
    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "" }))); // 미분류로 되돌리기

    const after = await row(ID_PRIV_H);
    expect(after).toBeDefined();
    expect(after.stdCategory).toBe("선물");
    expect(after.beneficiary).toBe("husband");
    expect(after.categoryLocked).toBe(false);
    expect(after.isPrivate).toBe(true);
  });

  test("연결 없는 계정(null)도 남의 비공개 거래를 못 지운다", async () => {
    const actions = await import("./actions");
    asViewer(null);
    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    expect(await row(ID_PRIV_H)).toBeDefined();
  });

  test("소유자(남편)는 자기 비공개 거래를 바꾸고 지울 수 있다", async () => {
    const actions = await import("./actions");
    asViewer("husband");

    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "여행" })));
    const changed = await row(ID_PRIV_H);
    expect(changed.stdCategory).toBe("여행");
    expect(changed.categoryLocked).toBe(true);

    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    expect(await row(ID_PRIV_H)).toBeUndefined();
  });

  test("수기 입력: 내가 결제한 거래만 나만 보기로 저장되고, 파트너 명의로는 거부된다", async () => {
    const { addManualTransactionAction } = await import("./actions");
    const manual = (personId: string, extra: Record<string, string>) =>
      form({ returnTo: "/finance/spending?month=2026-09", personId, beneficiary: personId, txnDate: "2026-09-05", stdCategory: "선물", amount: "8000", ...extra });
    const manualRows = async () => (await getDb().select().from(transactions)).filter((t) => t.category === "직접 입력");

    asViewer("husband");
    await run(addManualTransactionAction(manual("husband", { isPrivate: "on" })));
    const mine = await manualRows();
    expect(mine).toHaveLength(1);
    expect(mine[0].isPrivate).toBe(true);

    const redirectUrl = await run(addManualTransactionAction(manual("wife", { isPrivate: "on" })));
    expect(redirectUrl).toContain("addError=");
    expect(await manualRows()).toHaveLength(1); // 파트너 명의 비공개는 저장되지 않음
  });
});
