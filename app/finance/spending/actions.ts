"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { isBeneficiary } from "@/lib/spending-queries";

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
    await db.update(transactions).set({ stdCategory }).where(eq(transactions.id, txnId));
  }

  redirect(returnTo);
}
