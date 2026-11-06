/**
 * 업로드마다 남아 있는 자산 스냅샷으로 월별 가구 순자산을 만든다. 각 달 말 기준으로 사람마다 그때까지의
 * 가장 최근 업로드 값을 더한다(그 달에 새로 올리지 않은 사람은 직전 값 유지).
 */
export function monthlyNetWorth(snapshots: { personId: string; date: string; net: number }[], untilMonth: string): { month: string; net: number }[] {
  if (snapshots.length === 0) return [];
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const out: { month: string; net: number }[] = [];
  const latest = new Map<string, number>();
  let i = 0;
  for (let month = sorted[0].date.slice(0, 7); month <= untilMonth; month = nextMonth(month)) {
    while (i < sorted.length && sorted[i].date.slice(0, 7) <= month) latest.set(sorted[i].personId, sorted[i++].net);
    out.push({ month, net: [...latest.values()].reduce((s, v) => s + v, 0) });
  }
  return out;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
