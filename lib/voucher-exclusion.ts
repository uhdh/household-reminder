import { and, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { transactions } from "@/lib/finance-db";

/**
 * 서울페이 상품권 구매 장부용 행("서울페이" 업로드가 넣는, 실제 집계에는 안 잡히는 기록용 거래)인지.
 * 세부 내역 목록/내보내기처럼 "included || stdCategory==='자산수정'"로 자산수정 거래를 사용자가
 * 볼 수 있게 노출하는 화면에서, 이 장부용 행만은 숨겨야 하는 곳에 공통으로 쓴다.
 */
export function isVoucherPurchaseRecord(t: { category: string | null; subcategory: string | null }): boolean {
  return t.category === "서울페이" && t.subcategory === "구매";
}

// 서울페이 구매 건과 매칭 대상에서 절대 제외할 원본 카테고리(수동 입력, 서울페이 자기 자신).
const EXCLUDED_CANDIDATE_CATEGORIES = ["직접 입력", "서울페이"];
const MAX_DAY_DIFF = 1;

function daysBetween(a: string, b: string): number {
  const msPerDay = 86_400_000;
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / msPerDay;
}

/**
 * 이 사람의 서울페이 상품권 구매 장부 행(category='서울페이', subcategory='구매') 각각에 대해,
 * 뱅크샐러드가 이미 기록한 "카드 결제일의 계좌 출금"과 같은 금액(-A)·±1일 이내인 거래를 찾아
 * std_category='자산수정', included=false, category_locked=true로 잠근다(서울페이 구매와
 * 뱅크샐러드 출금의 이중 집계 방지). 구매 하나당 후보 하나만 매칭하며(날짜 차이가 가장 작은
 * 쪽), category_locked=true인 행과 '직접 입력'/'서울페이' 카테고리는 후보에서 제외한다.
 *
 * category_locked=true가 된 행은 다음 호출의 후보 목록에서 자연히 빠지므로, 같은 업로드를
 * 반복 실행하거나(서울페이 재업로드) 다른 시점에 실행해도(뱅크샐러드 재업로드 후) 중복 없이
 * 새로 생긴 매칭만 처리한다 - 별도 dedup 없이 이 함수 자체가 멱등이다.
 *
 * ponytail: 구매 개수만큼(수십~수백 건) 후보 전체를 선형 스캔하는 O(n*m) 매칭이다. 가구 규모가
 * 훨씬 커지면 (personId, amount)로 후보를 미리 그룹화해 스캔 범위를 좁히는 개선이 필요하다.
 */
export async function applyVoucherPurchaseExclusion(
  db: AppDb,
  householdId: string,
  personId: string
): Promise<{ excludedCount: number }> {
  const purchases = await db
    .select({ id: transactions.id, txnDate: transactions.txnDate, amount: transactions.amount })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.personId, personId),
        eq(transactions.category, "서울페이"),
        eq(transactions.subcategory, "구매")
      )
    );
  if (purchases.length === 0) return { excludedCount: 0 };

  // category가 NULL인 행은 SQL NOT IN에서 항상 빠지므로 명시적으로 포함한다.
  const rows = await db
    .select({
      id: transactions.id,
      txnDate: transactions.txnDate,
      amount: transactions.amount,
      categoryLocked: transactions.categoryLocked,
      stdCategory: transactions.stdCategory,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.householdId, householdId),
        eq(transactions.personId, personId),
        or(isNull(transactions.category), notInArray(transactions.category, EXCLUDED_CANDIDATE_CATEGORIES))
      )
    );
  const candidates = rows.filter((r) => !r.categoryLocked);
  // 이전 실행에서 이미 잠가 둔(자산수정) 출금. 재실행 때 이미 짝이 있는 구매가 같은 금액의
  // 다른 거래를 또 잡지 않도록, 구매마다 먼저 여기서 짝을 찾아 소진시킨다.
  const alreadyExcluded = rows.filter((r) => r.categoryLocked && r.stdCategory === "자산수정");

  const usedCandidateIds = new Set<string>();
  const toExclude: string[] = [];

  const pending = purchases.filter((purchase) => {
    const match = alreadyExcluded.find(
      (r) => !usedCandidateIds.has(r.id) && Number(r.amount) === Number(purchase.amount) && daysBetween(purchase.txnDate, r.txnDate) <= MAX_DAY_DIFF
    );
    if (!match) return true;
    usedCandidateIds.add(match.id);
    return false;
  });

  for (const purchase of pending) {
    const targetAmount = Number(purchase.amount);
    let best: { id: string; diff: number } | null = null;
    for (const candidate of candidates) {
      if (usedCandidateIds.has(candidate.id)) continue;
      if (Number(candidate.amount) !== targetAmount) continue;
      const diff = daysBetween(purchase.txnDate, candidate.txnDate);
      if (diff > MAX_DAY_DIFF) continue;
      if (!best || diff < best.diff) best = { id: candidate.id, diff };
    }
    if (best) {
      usedCandidateIds.add(best.id);
      toExclude.push(best.id);
    }
  }

  if (toExclude.length > 0) {
    await db
      .update(transactions)
      .set({ stdCategory: "자산수정", included: false, categoryLocked: true })
      .where(and(eq(transactions.householdId, householdId), inArray(transactions.id, toExclude)));
  }

  return { excludedCount: toExclude.length };
}
