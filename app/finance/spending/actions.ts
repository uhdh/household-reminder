"use server";

import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { categoryKeywordRules, transactions } from "@/lib/finance-db";
import { getHouseholdPeople, isBeneficiary, isPersonId } from "@/lib/spending-queries";
import { requireHousehold } from "@/lib/require-household";
import { rederiveTransactions } from "@/lib/rederive-transactions";
import { getOrCreateActiveUploadId } from "@/lib/manual-upload";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function spendingReturnTo(value: FormDataEntryValue | null): string {
  const path = String(value ?? "");
  return path.startsWith("/finance/spending") ? path : "/finance/spending";
}

export async function addManualTransactionAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");
  const personId = String(formData.get("personId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const txnDate = String(formData.get("txnDate") ?? "");
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 100);
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim().slice(0, 50);
  const amount = Number(String(formData.get("amount") ?? "").replaceAll(",", ""));

  const householdPeople = await getHouseholdPeople(householdId);
  const knownIds = householdPeople.map((p) => p.id);
  if (!isPersonId(personId, knownIds) || !isBeneficiary(beneficiary, knownIds) || !ISO_DATE_RE.test(txnDate) || !stdCategory || !Number.isFinite(amount) || amount <= 0) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}addError=${encodeURIComponent("입력 내용을 다시 확인해주세요.")}`);
  }

  const db = getDb();
  // 아직 이 사람 명의로 업로드한 엑셀이 하나도 없어도 수동 입력은 막지 않는다: 활성 업로드가
  // 있으면 그대로 쓰고, 없으면 수동 입력 전용 자리표시자 업로드를 재사용/생성한다(서울페이
  // 업로드와 공유하는 헬퍼). 나중에 실제 엑셀을 업로드하면 uploadAction이 이 거래들을 새
  // 업로드로 재연결한다.
  const uploadId = await getOrCreateActiveUploadId(db, householdId, personId);

  await db.insert(transactions).values({
    householdId,
    uploadId,
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
  const { householdId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  const knownIds = (await getHouseholdPeople(householdId)).map((p) => p.id);
  if (txnId && isBeneficiary(beneficiary, knownIds)) {
    const db = getDb();
    await db.update(transactions).set({ beneficiary }).where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId)));
  }

  redirect(returnTo);
}

export async function deleteTransactionAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  if (UUID_RE.test(txnId)) {
    await getDb().delete(transactions).where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId)));
  }

  redirect(returnTo);
}

export async function deleteTransactionsAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const returnTo = spendingReturnTo(formData.get("returnTo"));
  const ids = formData.getAll("txnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);

  if (ids.length > 0) {
    await getDb().delete(transactions).where(and(inArray(transactions.id, ids), eq(transactions.householdId, householdId)));
  }

  redirect(returnTo);
}

const UNMAPPED_VALUE = "__미분류__";

// 자기계좌이체 등을 제외한 집계 포함 여부(included)를 카테고리 변경에 맞춰 재계산하며 저장한다.
// 단건/규칙 일괄적용/다건 일괄변경이 모두 이 로직을 공유한다. householdId 조건으로 다른 가구의
// 거래 id가 섞여 들어와도(악의적 요청 포함) 절대 바뀌지 않는다.
//
// stdCategory가 null이면 "미분류로 되돌리기"다: 사용자가 직접 고친 분류를 지우고 자동 분류로
// 되돌리는 것이므로, category_locked를 풀고 rederiveTransactions로 우선순위 규칙에 따라 다시
// 계산한다(값이 그대로 null로 남을 수도, 매핑/규칙에 걸려 자동으로 채워질 수도 있다).
// stdCategory가 있으면 사용자가 직접 고른 것이므로 category_locked=true로 저장해, 이후 설정 탭의
// 일괄 재계산(rederiveTransactions)이 이 거래를 건드리지 않도록 보호한다.
async function applyStdCategoryToTransaction(db: ReturnType<typeof getDb>, householdId: string, txnId: string, stdCategory: string | null) {
  if (stdCategory === null) {
    await db
      .update(transactions)
      .set({ categoryLocked: false })
      .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId)));
    await rederiveTransactions(db, householdId, eq(transactions.id, txnId));
    return;
  }

  const [transaction] = await db
    .select({
      stdCategory: transactions.stdCategory,
      included: transactions.included,
      isInternalTransfer: transactions.isInternalTransfer,
    })
    .from(transactions)
    .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId)))
    .limit(1);

  if (!transaction) return;

  const included =
    stdCategory === "자산수정"
      ? false
      : transaction.stdCategory === "자산수정" && stdCategory
        ? !transaction.isInternalTransfer
        : transaction.included;
  await db
    .update(transactions)
    .set({ stdCategory, included, categoryLocked: true })
    .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId)));
}

export async function updateTransactionCategoryAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  if (txnId) {
    const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;
    await applyStdCategoryToTransaction(getDb(), householdId, txnId, stdCategory);
  }

  redirect(returnTo);
}

export async function updateTransactionsCategoryAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const returnTo = spendingReturnTo(formData.get("returnTo"));
  const ids = formData.getAll("txnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);
  const stdCategoryRaw = String(formData.get("stdCategory") ?? "");
  const stdCategory = stdCategoryRaw === UNMAPPED_VALUE || stdCategoryRaw === "" ? null : stdCategoryRaw;

  if (ids.length > 0) {
    const db = getDb();
    await Promise.all(ids.map((id) => applyStdCategoryToTransaction(db, householdId, id, stdCategory)));
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
  const { householdId } = await requireHousehold();
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
      .values({ householdId, txnType, keyword, stdCategory })
      .onConflictDoUpdate({
        target: [categoryKeywordRules.householdId, categoryKeywordRules.keyword],
        set: { stdCategory, txnType },
      });

    if (txnId) {
      await applyStdCategoryToTransaction(db, householdId, txnId, stdCategory);
    }

    if (applyToExisting && applyTxnIds.length > 0) {
      await Promise.all(applyTxnIds.map((id) => applyStdCategoryToTransaction(db, householdId, id, stdCategory)));
    }
  }

  redirect(returnTo);
}
