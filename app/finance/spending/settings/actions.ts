"use server";

import { redirect } from "next/navigation";
import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { budgetCategories, categoryKeywordRules, categoryMappings, categoryRules, transactions } from "@/lib/finance-db";
import { requireFinanceUser } from "@/lib/require-finance-user";

const VALID_TXN_TYPES = new Set(["수입", "지출", "이체"]);
const VALID_KINDS = new Set(["고정비", "변동비", "고정수입", "변동수입"]);

export async function upsertCategoryMappingAction(formData: FormData) {
  await requireFinanceUser();
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

    await db
      .update(transactions)
      .set({ stdCategory })
      .where(
        and(
          eq(transactions.txnType, txnType),
          rawCategory === "미분류"
            ? or(isNull(transactions.category), eq(transactions.category, rawCategory))
            : eq(transactions.category, rawCategory),
          rawSubcategory === "미분류"
            ? or(isNull(transactions.subcategory), eq(transactions.subcategory, rawSubcategory))
            : eq(transactions.subcategory, rawSubcategory)
        )
      );
  }

  redirect("/finance/spending/settings");
}

export async function deleteCategoryMappingAction(formData: FormData) {
  await requireFinanceUser();
  const id = String(formData.get("id") ?? "");
  if (id) {
    const db = getDb();
    await db.delete(categoryMappings).where(eq(categoryMappings.id, id));
  }
  redirect("/finance/spending/settings");
}

export async function upsertCategoryRuleAction(formData: FormData) {
  await requireFinanceUser();
  const txnType = String(formData.get("txnType") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();

  if (VALID_TXN_TYPES.has(txnType) && paymentMethod && stdCategory) {
    const db = getDb();
    await db
      .insert(categoryRules)
      .values({ txnType, paymentMethod, stdCategory })
      .onConflictDoUpdate({
        target: [categoryRules.txnType, categoryRules.paymentMethod],
        set: { stdCategory },
      });
    await db
      .update(transactions)
      .set({ stdCategory })
      .where(and(eq(transactions.txnType, txnType), eq(transactions.paymentMethod, paymentMethod)));
  }

  redirect("/finance/spending/settings?tab=rules");
}

export async function deleteCategoryRuleAction(formData: FormData) {
  await requireFinanceUser();
  const id = String(formData.get("id") ?? "");
  if (id) await getDb().delete(categoryRules).where(eq(categoryRules.id, id));
  redirect("/finance/spending/settings?tab=rules");
}

export async function upsertCategoryKeywordRuleAction(formData: FormData) {
  await requireFinanceUser();
  const txnType = String(formData.get("txnType") ?? "지출").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();
  const applyToExisting = formData.get("applyToExisting") === "true" || formData.get("applyToExisting") === "on";

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

  redirect("/finance/spending/settings?tab=rules");
}

export async function deleteCategoryKeywordRuleAction(formData: FormData) {
  await requireFinanceUser();
  const id = String(formData.get("id") ?? "");
  if (id) await getDb().delete(categoryKeywordRules).where(eq(categoryKeywordRules.id, id));
  redirect("/finance/spending/settings?tab=rules");
}

const KIND_FIELD_PREFIX = "kind:";
const BUDGET_FIELD_PREFIX = "budget:";

export async function updateBudgetCategoriesAction(formData: FormData) {
  await requireFinanceUser();
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
  await requireFinanceUser();
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
  await requireFinanceUser();
  if (name) {
    const db = getDb();
    await db.delete(budgetCategories).where(eq(budgetCategories.name, name));
  }
  redirect("/finance/spending/settings");
}
