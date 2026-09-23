import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { deleteTransactionsAction } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("deleteTransactionsAction", () => {
  afterEach(() => setDbForTesting(null));

  test("deletes only the selected transactions", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
        txn_time time, txn_type text NOT NULL, category text, subcategory text, description text,
        amount numeric NOT NULL, payment_method text, std_category text, included boolean NOT NULL,
        is_internal_transfer boolean NOT NULL, beneficiary text NOT NULL
      )
    `);
    const rows = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"].map((id) => ({
      id,
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
        txn_type text NOT NULL,
        keyword text NOT NULL UNIQUE,
        std_category text NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      CREATE TABLE transactions (
        id uuid PRIMARY KEY, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
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
