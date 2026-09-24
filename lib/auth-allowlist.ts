// Google 로그인 허용 명단 판정. auth.ts의 callbacks.signIn과 lib/require-finance-user.ts가
// 이 순수 함수들을 공유한다 — 명단이 비었거나 미설정이면 전원 거부(fail-closed).
export function parseAllowedEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string | undefined | null, allowedEmailsRaw: string | undefined | null): boolean {
  const allowed = parseAllowedEmails(allowedEmailsRaw);
  if (allowed.length === 0) return false;
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}

// AUTH_OPEN_SIGNUP=true일 때만 명단 체크를 건너뛴다(가구 소속 여부는 온보딩/초대가 별도로 판정).
// 기본(미설정·그 외 값)은 기존처럼 명단 필수 - P4(운영 마이그레이션) 전까지의 안전장치.
export function isSignupOpen(openSignupRaw: string | undefined | null): boolean {
  return (openSignupRaw ?? "").trim().toLowerCase() === "true";
}

// 로그인 시점(email_verified 포함)과 매 요청 재확인(proxy.ts)이 공유하는 "접근 허용?" 판정.
export function isFinanceAccessAllowed({
  email,
  allowedEmailsRaw,
  openSignupRaw,
}: {
  email: string | undefined | null;
  allowedEmailsRaw: string | undefined | null;
  openSignupRaw: string | undefined | null;
}): boolean {
  if (isSignupOpen(openSignupRaw)) return !!email;
  return isEmailAllowed(email, allowedEmailsRaw);
}

export function isAllowedFinanceSignIn({
  emailVerified,
  email,
  allowedEmailsRaw,
  openSignupRaw,
}: {
  emailVerified: boolean | undefined | null;
  email: string | undefined | null;
  allowedEmailsRaw: string | undefined | null;
  openSignupRaw?: string | undefined | null;
}): boolean {
  if (!emailVerified) return false;
  return isFinanceAccessAllowed({ email, allowedEmailsRaw, openSignupRaw: openSignupRaw ?? null });
}
