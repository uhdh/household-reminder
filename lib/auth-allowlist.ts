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

export function isAllowedFinanceSignIn({
  emailVerified,
  email,
  allowedEmailsRaw,
}: {
  emailVerified: boolean | undefined | null;
  email: string | undefined | null;
  allowedEmailsRaw: string | undefined | null;
}): boolean {
  if (!emailVerified) return false;
  return isEmailAllowed(email, allowedEmailsRaw);
}
