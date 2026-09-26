import { and, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { getActiveTransactions, toNum, type Txn } from "@/lib/spending-queries";

// 서울페이 결제/구매 장부 행은 뱅크샐러드 이체와 무관한 별도 출처라 후보에서 제외한다.
const EXCLUDED_CATEGORY = "서울페이";
const MIN_ABS_AMOUNT = 100;
const MAX_DAY_DIFF = 1;

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

function toTimestamp(date: string, time: string | null): number {
  return new Date(`${date}T${time ?? "00:00:00"}Z`).getTime();
}

function isEligibleCandidate(t: Txn): boolean {
  return !t.categoryLocked && !t.isInternalTransfer && t.category !== EXCLUDED_CATEGORY && Math.abs(toNum(t.amount)) > MIN_ABS_AMOUNT;
}

function canPair(a: Txn, b: Txn): boolean {
  const amountA = toNum(a.amount);
  const amountB = toNum(b.amount);
  if (Math.sign(amountA) === Math.sign(amountB)) return false;
  if (Math.abs(amountA) !== Math.abs(amountB)) return false;
  if (daysBetween(a.txnDate, b.txnDate) > MAX_DAY_DIFF) return false;
  return a.txnType === "이체" || b.txnType === "이체" || a.personId !== b.personId;
}

function sortKey(t: Txn): string {
  return `${t.txnDate}|${t.txnTime ?? ""}|${t.id}`;
}

/**
 * 가구 단위 내 계좌 이동 짝짓기. matchSelfTransferPairs(업로드 하나 안에서만 짝을 찾음)로는
 * 안 잡히는, 배우자 간 계좌이체나 결제수단이 달라 같은 업로드에 안 걸리는 자기계좌이체를
 * 가구 전체 활성 거래(getActiveTransactions와 같은 스코프 - 재업로드로 대체된 옛 업로드는 제외)
 * 대상으로 사후에 한 번 더 찾는다.
 *
 * 후보 = category_locked=false(사용자가 직접 고치지 않음) AND is_internal_transfer=false(아직
 * 안 잡힘) AND 원본 category≠'서울페이'(결제·구매 장부 제외) AND |금액| > 100.
 * 짝 조건 = 부호 반대 AND |금액| 같음 AND 날짜 차이 ≤ 1일 AND (둘 중 하나라도 거래유형='이체'
 * 이거나 서로 다른 사람). 매칭되면 std_category는 그대로 두고 is_internal_transfer=true,
 * included=false로만 표시한다.
 *
 * 그리디·결정적: (날짜, 시간, id) 순으로 훑으며 각 후보마다 아직 안 짝지어진 것 중 시간 차이가
 * 가장 작은 상대를 고른다. 멱등 - 짝지어진 행은 is_internal_transfer=true가 되어 다음 호출의
 * 후보 목록에서 자연히 빠지므로, rederiveTransactions 뒤에 반복 호출해도 새로 생긴 후보만
 * 처리한다(rederiveTransactions는 std_category/included만 바꾸고 is_internal_transfer는
 * 그대로 읽기만 하므로 이 함수가 잠근 상태를 되돌리지 않는다 - 항상 rederive → pairing 순서로
 * 호출할 것).
 *
 * 같은 |금액|끼리만 비교하므로 실사용 규모(가구당 수천 건)에서 스캔 비용은 작다.
 */
export async function applyHouseholdTransferPairs(
  db: AppDb,
  householdId: string,
  options: { dryRun?: boolean } = {}
): Promise<{ pairs: number; rows: number }> {
  const { transactions: activeTx } = await getActiveTransactions(householdId);
  const candidates = activeTx.filter(isEligibleCandidate).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  // 짝은 |금액|이 같아야 하므로 금액별로 묶어 그 안에서만 비교한다(후보 전체 제곱 스캔 방지).
  const byAmount = new Map<number, Txn[]>();
  for (const t of candidates) {
    const key = Math.abs(toNum(t.amount));
    const group = byAmount.get(key);
    if (group) group.push(t);
    else byAmount.set(key, [t]);
  }

  const paired = new Set<string>();
  const matchedIds: string[] = [];

  for (const candidate of candidates) {
    if (paired.has(candidate.id)) continue;
    let best: Txn | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const other of byAmount.get(Math.abs(toNum(candidate.amount))) ?? []) {
      if (other.id === candidate.id || paired.has(other.id)) continue;
      if (!canPair(candidate, other)) continue;
      const diff = Math.abs(toTimestamp(candidate.txnDate, candidate.txnTime) - toTimestamp(other.txnDate, other.txnTime));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = other;
      }
    }
    if (best) {
      paired.add(candidate.id);
      paired.add(best.id);
      matchedIds.push(candidate.id, best.id);
    }
  }

  if (matchedIds.length > 0 && !options.dryRun) {
    await db
      .update(transactions)
      .set({ isInternalTransfer: true, included: false })
      .where(and(eq(transactions.householdId, householdId), inArray(transactions.id, matchedIds)));
  }

  return { pairs: matchedIds.length / 2, rows: matchedIds.length };
}
