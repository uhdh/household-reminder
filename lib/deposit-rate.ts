/**
 * 금리 입력값 해석. 빈 값 = 금리 지우기(null), 0~100 사이 숫자(소수 셋째 자리까지 반올림) = 저장할 값,
 * 그 밖(문자·음수·100 초과) = "invalid". "%"와 쉼표는 허용한다.
 */
export function parseRatePct(raw: string): number | null | "invalid" {
  const text = raw.replaceAll(",", "").replace("%", "").trim();
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > 100) return "invalid";
  return Math.round(value * 1000) / 1000;
}

/** 연 예상 이자(세전, 단리). 금리가 없으면 null. */
export function annualInterest(amount: number, ratePct: number | null): number | null {
  return ratePct === null ? null : Math.round((amount * ratePct) / 100);
}
