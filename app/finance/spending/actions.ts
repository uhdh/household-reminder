"use server";

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions, uploads } from "@/lib/finance-db";
import { isBeneficiary, isPersonId } from "@/lib/spending-queries";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    amount: String(Math.round(amount)),
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
