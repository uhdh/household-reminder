// 로그인 후 이동할 경로 정제. 열린 리다이렉트를 막기 위해 같은 사이트 상대경로("/"로 시작하고
// "//"나 "/\"로 시작하지 않는 경로)만 허용하고, 그 외(절대 URL, 빈 값 등)는 안전한 기본값으로 보낸다.
export function sanitizeCallbackUrl(raw: string | undefined | null, fallback = "/finance"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
