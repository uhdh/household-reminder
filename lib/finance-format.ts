export function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number(value);
}

export function formatKRW(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

export const CATEGORY_PALETTE = [
  "#2A78D6",
  "#EB6834",
  "#1BAF7A",
  "#EDA100",
  "#E87BA4",
  "#008300",
  "#4A3AA7",
  "#E34948",
];

/**
 * 값 기준 내림차순 정렬 후 상위 n개만 남기고 나머지는 otherLabel 항목 하나로 합친다.
 * 파이차트 등에서 라벨 겹침을 막기 위해 항목 수를 제한할 때 쓴다.
 */
export function topNWithOther(entries: [string, number][], n: number, otherLabel = "기타"): [string, number][] {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  if (sorted.length <= n) return sorted;
  const top = sorted.slice(0, n);
  const otherTotal = sorted.slice(n).reduce((s, [, v]) => s + v, 0);
  return otherTotal > 0 ? [...top, [otherLabel, otherTotal]] : top;
}

export function buildCategoryColorMap(categoriesInOrder: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  let i = 0;
  for (const category of categoriesInOrder) {
    if (map[category]) continue;
    map[category] = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    i++;
  }
  return map;
}

export function isLightColor(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

const HEATMAP_NEUTRAL = "#D6D4CB";
const HEATMAP_GAIN = "#15803D";
const HEATMAP_LOSS = "#D03B3B";
const HEATMAP_RETURN_CLAMP_PCT = 20;

function mixHex(from: string, to: string, t: number): string {
  const a = from.replace("#", "");
  const b = to.replace("#", "");
  const channels = [0, 2, 4].map((i) => {
    const av = parseInt(a.slice(i, i + 2), 16);
    const bv = parseInt(b.slice(i, i + 2), 16);
    return Math.round(av + (bv - av) * t)
      .toString(16)
      .padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

// 수익률(%) 기준 히트맵 색상: 무손익/현금성 자산은 회색, 이익은 초록, 손실은 빨강으로 강도에 비례해 표시
export function heatmapReturnColor(gainPct: number | null): string {
  if (gainPct === null || Number.isNaN(gainPct)) return HEATMAP_NEUTRAL;
  const clamped = Math.max(-HEATMAP_RETURN_CLAMP_PCT, Math.min(HEATMAP_RETURN_CLAMP_PCT, gainPct));
  const t = Math.abs(clamped) / HEATMAP_RETURN_CLAMP_PCT;
  return clamped >= 0 ? mixHex(HEATMAP_NEUTRAL, HEATMAP_GAIN, t) : mixHex(HEATMAP_NEUTRAL, HEATMAP_LOSS, t);
}
