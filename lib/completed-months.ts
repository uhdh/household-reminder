/** 한국 시간 기준 이번 달 1일(YYYY-MM-DD). 서버(Vercel)는 UTC라 직접 계산하면 월초 9시간이 어긋난다. */
export function currentMonthStartKst(now: Date = new Date()): string {
  return `${now.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7)}-01`;
}

function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 진행 중인 이번 달 거래를 빼고, 업로드 기간도 지난달 말까지로 줄인다. 기간을 줄여야 다음 달에 다시 올릴 때
 * 이번 달 날짜가 "이미 올린 기간"으로 건너뛰어지지 않는다.
 */
export function trimToCompletedMonths<T extends { txnDate: string }>(
  parsed: { transactions: T[]; periodStart: string | null; periodEnd: string | null },
  monthStart: string
): { transactions: T[]; periodStart: string | null; periodEnd: string | null; droppedCount: number } {
  const kept = parsed.transactions.filter((t) => t.txnDate < monthStart);
  const lastDay = dayBefore(monthStart);
  let { periodStart, periodEnd } = parsed;
  if (periodEnd && periodEnd > lastDay) periodEnd = lastDay;
  if (periodStart && periodEnd && periodStart > periodEnd) {
    periodStart = null;
    periodEnd = null;
  }
  return { transactions: kept, periodStart, periodEnd, droppedCount: parsed.transactions.length - kept.length };
}
