"use server";

import { redirect } from "next/navigation";
import { and, eq, ilike, inArray } from "drizzle-orm";
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

export async function updateTransactionCategoryAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  if (txnId) {
    const db = getDb();
    const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;
    const [transaction] = await db
      .select({
        stdCategory: transactions.stdCategory,
        included: transactions.included,
        isInternalTransfer: transactions.isInternalTransfer,
      })
      .from(transactions)
      .where(eq(transactions.id, txnId))
      .limit(1);

    if (transaction) {
      const included =
        stdCategory === "자산수정"
          ? false
          : transaction.stdCategory === "자산수정" && stdCategory
            ? !transaction.isInternalTransfer
            : transaction.included;
      await db.update(transactions).set({ stdCategory, included }).where(eq(transactions.id, txnId));
    }
  }

  redirect(returnTo);
}

export async function createKeywordRuleAndApplyAction(formData: FormData) {
  const txnId = String(formData.get("txnId") ?? "");
  const keyword = String(formData.get("keyword") ?? "").trim();
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "").trim();
  const txnType = String(formData.get("txnType") ?? "지출").trim();
  const applyToExisting = formData.get("applyToExisting") === "true" || formData.get("applyToExisting") === "on";
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;

  if (keyword && stdCategory) {
    const db = getDb();

    await db
      .insert(categoryKeywordRules)
      .values({
        txnType: txnType === "수입" || txnType === "지출" || txnType === "이체" ? txnType : "전체",
        keyword,
        stdCategory,
      })
      .onConflictDoUpdate({
        target: categoryKeywordRules.keyword,
        set: {
          stdCategory,
          txnType: txnType === "수입" || txnType === "지출" || txnType === "이체" ? txnType : "전체",
        },
      });

    if (txnId) {
      const [transaction] = await db
        .select({
          stdCategory: transactions.stdCategory,
          included: transactions.included,
          isInternalTransfer: transactions.isInternalTransfer,
        })
        .from(transactions)
        .where(eq(transactions.id, txnId))
        .limit(1);

      if (transaction) {
        const included =
          stdCategory === "자산수정"
            ? false
            : transaction.stdCategory === "자산수정" && stdCategory
              ? !transaction.isInternalTransfer
              : transaction.included;
        await db.update(transactions).set({ stdCategory, included }).where(eq(transactions.id, txnId));
      }
    }

    if (applyToExisting) {
      const typeFilter = txnType !== "전체" ? eq(transactions.txnType, txnType) : undefined;
      const descFilter = ilike(transactions.description, `%${keyword}%`);
      const whereCondition = typeFilter ? and(typeFilter, descFilter) : descFilter;

      if (stdCategory === "자산수정") {
        await db.update(transactions).set({ stdCategory, included: false }).where(whereCondition);
      } else {
        await db.update(transactions).set({ stdCategory }).where(whereCondition);
      }
    }
  }

  redirect(returnTo);
}
