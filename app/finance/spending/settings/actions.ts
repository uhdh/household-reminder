"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { budgetCategories, categoryKeywordRules, categoryMappings, categoryRules, transactions } from "@/lib/finance-db";
import { requireHousehold } from "@/lib/require-household";
import { escapeIlikePattern, rederiveTransactions, type CategoryTransition } from "@/lib/rederive-transactions";
import { applyHouseholdTransferPairs } from "@/lib/household-transfer-pairs";

const VALID_TXN_TYPES = new Set(["수입", "지출", "이체"]);
const VALID_KINDS = new Set(["고정비", "변동비", "고정수입", "변동수입"]);

/**
 * 매핑/규칙 편집이 rederiveTransactions로 std_category/included를 다시 계산한 뒤, 가구 단위
 * 계좌이동 짝짓기(applyHouseholdTransferPairs)를 그 다음 순서로 실행한다(순서 계약은
 * lib/rederive-transactions.ts 참고 - 반대로 하면 안 됨). 편집 액션마다 반복되는 이 두 호출을
 * 한데 묶는다.
 */
async function rederiveAndPairHousehold(db: AppDb, householdId: string, candidateFilter?: SQL) {
  await rederiveTransactions(db, householdId, candidateFilter);
  await applyHouseholdTransferPairs(db, householdId);
}

// 원본 대분류/소분류 조합으로 매핑 규칙의 영향을 받는 거래를 골라내는 조건(매핑 자체의
// std_category와 무관하게, 이 raw 값 조합을 가진 거래 전부가 후보다).
function mappingCandidateFilter(txnType: string, rawCategory: string, rawSubcategory: string) {
  return and(
    eq(transactions.txnType, txnType),
    rawCategory === "미분류"
      ? or(isNull(transactions.category), eq(transactions.category, rawCategory))
      : eq(transactions.category, rawCategory),
    rawSubcategory === "미분류"
      ? or(isNull(transactions.subcategory), eq(transactions.subcategory, rawSubcategory))
      : eq(transactions.subcategory, rawSubcategory)
  );
}

function ruleCandidateFilter(txnType: string, paymentMethod: string) {
  return and(eq(transactions.txnType, txnType), eq(transactions.paymentMethod, paymentMethod));
}

function keywordCandidateFilter(txnType: string, keyword: string) {
  const typeFilter = txnType !== "전체" ? eq(transactions.txnType, txnType) : undefined;
  return and(typeFilter, ilike(transactions.description, `%${escapeIlikePattern(keyword)}%`));
}

export async function upsertCategoryMappingAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const txnType = String(formData.get("txnType") ?? "").trim();
  const rawCategory = String(formData.get("rawCategory") ?? "").trim();
  const rawSubcategory = String(formData.get("rawSubcategory") ?? "").trim() || "미분류";
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();

  if (VALID_TXN_TYPES.has(txnType) && rawCategory && stdCategory) {
    const db = getDb();
    await db
      .insert(categoryMappings)
      .values({ householdId, txnType, rawCategory, rawSubcategory, stdCategory })
      .onConflictDoUpdate({
        target: [categoryMappings.householdId, categoryMappings.txnType, categoryMappings.rawCategory, categoryMappings.rawSubcategory],
        set: { stdCategory },
      });

    await rederiveAndPairHousehold(db, householdId, mappingCandidateFilter(txnType, rawCategory, rawSubcategory));
  }

  redirect("/finance/spending/settings");
}

export async function deleteCategoryMappingAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const id = String(formData.get("id") ?? "");
  if (id) {
    const db = getDb();
    const [mapping] = await db
      .select({ txnType: categoryMappings.txnType, rawCategory: categoryMappings.rawCategory, rawSubcategory: categoryMappings.rawSubcategory })
      .from(categoryMappings)
      .where(and(eq(categoryMappings.id, id), eq(categoryMappings.householdId, householdId)))
      .limit(1);
    await db.delete(categoryMappings).where(and(eq(categoryMappings.id, id), eq(categoryMappings.householdId, householdId)));
    // 삭제된 매핑이 적용되던 거래도, 남은 규칙 우선순위대로 다시 계산한다(전에는 그대로 남아있었음).
    if (mapping) await rederiveAndPairHousehold(db, householdId, mappingCandidateFilter(mapping.txnType, mapping.rawCategory, mapping.rawSubcategory));
  }
  redirect("/finance/spending/settings");
}

export async function upsertCategoryRuleAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const txnType = String(formData.get("txnType") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim();
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();

  if (VALID_TXN_TYPES.has(txnType) && paymentMethod && stdCategory) {
    const db = getDb();
    await db
      .insert(categoryRules)
      .values({ householdId, txnType, paymentMethod, stdCategory })
      .onConflictDoUpdate({
        target: [categoryRules.householdId, categoryRules.txnType, categoryRules.paymentMethod],
        set: { stdCategory },
      });
    await rederiveAndPairHousehold(db, householdId, ruleCandidateFilter(txnType, paymentMethod));
  }

  redirect("/finance/spending/settings?tab=rules");
}

export async function deleteCategoryRuleAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const id = String(formData.get("id") ?? "");
  if (id) {
    const db = getDb();
    const [rule] = await db
      .select({ txnType: categoryRules.txnType, paymentMethod: categoryRules.paymentMethod })
      .from(categoryRules)
      .where(and(eq(categoryRules.id, id), eq(categoryRules.householdId, householdId)))
      .limit(1);
    await db.delete(categoryRules).where(and(eq(categoryRules.id, id), eq(categoryRules.householdId, householdId)));
    if (rule) await rederiveAndPairHousehold(db, householdId, ruleCandidateFilter(rule.txnType, rule.paymentMethod));
  }
  redirect("/finance/spending/settings?tab=rules");
}

export async function upsertCategoryKeywordRuleAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const txnType = String(formData.get("txnType") ?? "지출").trim();
  const keyword = String(formData.get("keyword") ?? "").trim();
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();
  const applyToExisting = formData.get("applyToExisting") === "true" || formData.get("applyToExisting") === "on";

  if (keyword && stdCategory) {
    const db = getDb();
    const normalizedTxnType = txnType === "수입" || txnType === "지출" || txnType === "이체" ? txnType : "전체";
    await db
      .insert(categoryKeywordRules)
      .values({ householdId, txnType: normalizedTxnType, keyword, stdCategory })
      .onConflictDoUpdate({
        target: [categoryKeywordRules.householdId, categoryKeywordRules.keyword],
        set: { stdCategory, txnType: normalizedTxnType },
      });

    if (applyToExisting) {
      await rederiveAndPairHousehold(db, householdId, keywordCandidateFilter(normalizedTxnType, keyword));
    }
  }

  redirect("/finance/spending/settings?tab=rules");
}

export async function deleteCategoryKeywordRuleAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const id = String(formData.get("id") ?? "");
  if (id) {
    const db = getDb();
    const [rule] = await db
      .select({ txnType: categoryKeywordRules.txnType, keyword: categoryKeywordRules.keyword })
      .from(categoryKeywordRules)
      .where(and(eq(categoryKeywordRules.id, id), eq(categoryKeywordRules.householdId, householdId)))
      .limit(1);
    await db.delete(categoryKeywordRules).where(and(eq(categoryKeywordRules.id, id), eq(categoryKeywordRules.householdId, householdId)));
    if (rule) await rederiveAndPairHousehold(db, householdId, keywordCandidateFilter(rule.txnType, rule.keyword));
  }
  redirect("/finance/spending/settings?tab=rules");
}

export type RederiveState = {
  changed?: number;
  categoryChanged?: number;
  reclassified?: number;
  includedChanged?: number;
  transitions?: CategoryTransition[];
  pairs?: number;
  error?: string;
};

// useActionState로 호출된다(prevState, formData). 매핑·규칙을 나중에 추가해 과거 거래에는
// 반영되지 않은 경우를 위해, 가구 전체를 candidateFilter 없이(household 전체) 재계산한다.
// 실제로 값을 바꾸는(dryRun 아닌) 버전 - rederive-card의 "적용" 버튼이 호출한다.
export async function rederiveAllAction(): Promise<RederiveState> {
  const { householdId } = await requireHousehold();
  const db = getDb();
  const summary = await rederiveTransactions(db, householdId);
  const { pairs } = await applyHouseholdTransferPairs(db, householdId);
  // 미분류 목록·집계가 방금 바뀐 값을 반영하도록 새로고침.
  revalidatePath("/finance/spending/settings");
  return { ...summary, pairs };
}

// rederiveAllAction과 같은 계산을 하되 아무 것도 쓰지 않는다(rederiveTransactions/
// applyHouseholdTransferPairs 둘 다 dryRun:true) - rederive-card의 "변경 미리보기" 버튼이
// 호출해, 실제로 적용하기 전에 바뀔 내용(분류 변화 상위 항목·재분류/집계 변경 건수·새로
// 제외될 계좌이동 쌍 수)을 보여준다.
export async function rederivePreviewAction(): Promise<RederiveState> {
  const { householdId } = await requireHousehold();
  const db = getDb();
  const summary = await rederiveTransactions(db, householdId, undefined, { dryRun: true });
  const { pairs } = await applyHouseholdTransferPairs(db, householdId, { dryRun: true });
  return { ...summary, pairs };
}

const KIND_FIELD_PREFIX = "kind:";
const BUDGET_FIELD_PREFIX = "budget:";

export async function updateBudgetCategoriesAction(formData: FormData) {
  const { householdId } = await requireHousehold();
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
      .where(and(eq(budgetCategories.name, name), eq(budgetCategories.householdId, householdId)));
  }

  redirect("/finance/spending/settings");
}

export async function addBudgetCategoryAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  const budgetRaw = String(formData.get("monthlyBudget") ?? "").trim();

  if (name && VALID_KINDS.has(kind)) {
    const db = getDb();
    const existing = await db.select().from(budgetCategories).where(eq(budgetCategories.householdId, householdId));
    const nextSortOrder = existing.reduce((max, b) => Math.max(max, Number(b.sortOrder)), 0) + 1;
    const monthlyBudget = budgetRaw === "" ? null : String(Math.max(0, Number(budgetRaw)));

    await db
      .insert(budgetCategories)
      .values({ householdId, name, kind, sortOrder: String(nextSortOrder), monthlyBudget })
      .onConflictDoNothing({ target: [budgetCategories.householdId, budgetCategories.name] });
  }

  redirect("/finance/spending/settings");
}

export async function deleteBudgetCategoryAction(name: string) {
  const { householdId } = await requireHousehold();
  if (name) {
    const db = getDb();
    await db.delete(budgetCategories).where(and(eq(budgetCategories.name, name), eq(budgetCategories.householdId, householdId)));
  }
  redirect("/finance/spending/settings");
}
