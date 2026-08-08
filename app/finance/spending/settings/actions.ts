"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budgetCategories, categoryMappings } from "@/lib/finance-db";

const VALID_TXN_TYPES = new Set(["수입", "지출", "이체"]);
const VALID_KINDS = new Set(["고정비", "변동비", "고정수입", "변동수입"]);

export async function upsertCategoryMappingAction(formData: FormData) {
  const txnType = String(formData.get("txnType") ?? "").trim();
  const rawCategory = String(formData.get("rawCategory") ?? "").trim();
  const rawSubcategory = String(formData.get("rawSubcategory") ?? "").trim() || "미분류";
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();

  if (VALID_TXN_TYPES.has(txnType) && rawCategory && stdCategory) {
    const db = getDb();
    await db
      .insert(categoryMappings)
      .values({ txnType, rawCategory, rawSubcategory, stdCategory })
      .onConflictDoUpdate({
        target: [categoryMappings.txnType, categoryMappings.rawCategory, categoryMappings.rawSubcategory],
        set: { stdCategory },
      });
  }

  redirect("/finance/spending/settings");
}

export async function deleteCategoryMappingAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) {
    const db = getDb();
    await db.delete(categoryMappings).where(eq(categoryMappings.id, id));
  }
  redirect("/finance/spending/settings");
}

const KIND_FIELD_PREFIX = "kind:";
const BUDGET_FIELD_PREFIX = "budget:";

export async function updateBudgetCategoriesAction(formData: FormData) {
  const db = getDb();
  const names = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith(KIND_FIELD_PREFIX)) names.add(key.slice(KIND_FIELD_PREFIX.length));
  }

  for (const name of names) {
    const kind = String(formData.get(`${KIND_FIELD_PREFIX}${name}`) ?? "");
    const budgetRaw = String(formData.get(`${BUDGET_FIELD_PREFIX}${name}`) ?? "").trim();
    if (!VALID_KINDS.has(kind)) continue;
    const monthlyBudget = budgetRaw === "" ? null : String(Math.max(0, Number(budgetRaw)));

    await db
      .update(budgetCategories)
      .set({ kind, monthlyBudget })
      .where(eq(budgetCategories.name, name));
  }

  redirect("/finance/spending/settings");
}

export async function addBudgetCategoryAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const budgetRaw = String(formData.get("monthlyBudget") ?? "").trim();

  if (name && VALID_KINDS.has(kind)) {
    const db = getDb();
    const existing = await db.select().from(budgetCategories);
    const nextSortOrder = existing.reduce((max, b) => Math.max(max, Number(b.sortOrder)), 0) + 1;
    const monthlyBudget = budgetRaw === "" ? null : String(Math.max(0, Number(budgetRaw)));

    await db
      .insert(budgetCategories)
      .values({ name, kind, sortOrder: String(nextSortOrder), monthlyBudget })
      .onConflictDoNothing({ target: budgetCategories.name });
  }

  redirect("/finance/spending/settings");
}

export async function deleteBudgetCategoryAction(name: string) {
  if (name) {
    const db = getDb();
    await db.delete(budgetCategories).where(eq(budgetCategories.name, name));
  }
  redirect("/finance/spending/settings");
}
