"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categoryKeywordRules, transactions, uploads } from "@/lib/finance-db";
import { isBeneficiary, isPersonId } from "@/lib/spending-queries";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function spendingReturnTo(value: FormDataEntryValue | null): string {
  const path = String(value ?? "");
  return path.startsWith("/finance/spending") ? path : "/finance/spending";
}

export async function addManualTransactionAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");
  const personId = String(formData.get("personId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const txnDate = String(formData.get("txnDate") ?? "");
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 100);
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim().slice(0, 50);
  const amount = Number(String(formData.get("amount") ?? "").replaceAll(",", ""));

  if (!isPersonId(personId) || !isBeneficiary(beneficiary) || !ISO_DATE_RE.test(txnDate) || !stdCategory || !Number.isFinite(amount) || amount <= 0) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}addError=${encodeURIComponent("입력 내용을 다시 확인해주세요.")}`);
  }

  const db = getDb();
  const [activeUpload] = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.personId, personId), eq(uploads.isActive, true)))
    .limit(1);

  if (!activeUpload) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}addError=${encodeURIComponent(`${personId === "husband" ? "남편" : "아내"}의 파일을 먼저 업로드해주세요.`)}`);
  }

  await db.insert(transactions).values({
    uploadId: activeUpload.id,
    personId,
    txnDate,
    txnTime: null,
    txnType: "지출",
    category: "직접 입력",
    subcategory: "직접 입력",
    description: description || null,
    amount: String(-Math.round(amount)),
    paymentMethod: paymentMethod || null,
    stdCategory,
    included: stdCategory !== "자산수정",
    isInternalTransfer: false,
    beneficiary,
  });

  redirect(returnTo);
}

export async function updateBeneficiaryAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  if (txnId && isBeneficiary(beneficiary)) {
    const db = getDb();
    await db.update(transactions).set({ beneficiary }).where(eq(transactions.id, txnId));
  }

  redirect(returnTo);
}

export async function deleteTransactionAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  if (UUID_RE.test(txnId)) await getDb().delete(transactions).where(eq(transactions.id, txnId));

  redirect(returnTo);
}

export async function deleteTransactionsAction(formData: FormData) {
  const returnTo = spendingReturnTo(formData.get("returnTo"));
  const ids = formData.getAll("txnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);

  if (ids.length > 0) await getDb().delete(transactions).where(inArray(transactions.id, ids));

  redirect(returnTo);
}

const UNMAPPED_VALUE = "__미분류__";

// 자기계좌이체 등을 제외한 집계 포함 여부(included)를 카테고리 변경에 맞춰 재계산하며 저장한다.
// 단건/규칙 일괄적용/다건 일괄변경이 모두 이 로직을 공유한다.
async function applyStdCategoryToTransaction(db: ReturnType<typeof getDb>, txnId: string, stdCategory: string | null) {
  const [transaction] = await db
    .select({
      stdCategory: transactions.stdCategory,
      included: transactions.included,
      isInternalTransfer: transactions.isInternalTransfer,
    })
    .from(transactions)
    .where(eq(transactions.id, txnId))
    .limit(1);

  if (!transaction) return;

  const included =
    stdCategory === "자산수정"
      ? false
      : transaction.stdCategory === "자산수정" && stdCategory
        ? !transaction.isInternalTransfer
        : transaction.included;
  await db.update(transactions).set({ stdCategory, included }).where(eq(transactions.id, txnId));
}

export async function updateTransactionCategoryAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  if (txnId) {
    const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;
    await applyStdCategoryToTransaction(getDb(), txnId, stdCategory);
  }

  redirect(returnTo);
}

export async function updateTransactionsCategoryAction(formData: FormData) {
  const returnTo = spendingReturnTo(formData.get("returnTo"));
  const ids = formData.getAll("txnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "");
  const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;

  if (ids.length > 0) {
    const db = getDb();
    await Promise.all(ids.map((id) => applyStdCategoryToTransaction(db, id, stdCategory)));
  }

  redirect(returnTo);
}

function normalizeTxnType(txnType: string): string {
  return txnType === "수입" || txnType === "지출" || txnType === "이체" ? txnType : "전체";
}

// 토스트의 "앞으로도 자동": 키워드 규칙을 만들고(향후 자동분류용), 같은 가맹점의 기존
// 거래에도 일괄 적용한다. 규칙 텍스트(keyword)는 향후 자동분류에만 쓰이고, 지금 당장 바꿀
// 기존 거래는 page.tsx가 미리 정확 일치로 골라준 applyTxnId 목록만 사용한다
// (ILIKE 부분일치로 무관한 거래까지 바뀌는 것을 막기 위함).
export async function createKeywordRuleAndApplyAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const keyword = String(formData.get("keyword") ?? "").trim();
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "").trim();
  const txnType = normalizeTxnType(String(formData.get("txnType") ?? "지출").trim());
  const applyToExisting = formData.get("applyToExisting") === "true" || formData.get("applyToExisting") === "on";
  const applyTxnIds = formData.getAll("applyTxnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;

  if (keyword && stdCategory) {
    const db = getDb();

    await db
      .insert(categoryKeywordRules)
      .values({ txnType, keyword, stdCategory })
      .onConflictDoUpdate({
        target: categoryKeywordRules.keyword,
        set: { stdCategory, txnType },
      });

    if (txnId) {
      await applyStdCategoryToTransaction(db, txnId, stdCategory);
    }

    if (applyToExisting && applyTxnIds.length > 0) {
      await Promise.all(applyTxnIds.map((id) => applyStdCategoryToTransaction(db, id, stdCategory)));
    }
  }

  redirect(returnTo);
}
