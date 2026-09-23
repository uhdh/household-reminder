const PUBLIC_FINANCE_PATHS = new Set([
  "/finance",
  "/finance/spending",
  "/finance/spending/monthly",
  "/finance/spending/yearly",
]);

export function isPublicFinancePath(pathname: string): boolean {
  return PUBLIC_FINANCE_PATHS.has(pathname);
}

export function shouldProtectFinanceRequest({ pathname, method }: { pathname: string; method: string }): boolean {
  return method !== "GET" || !isPublicFinancePath(pathname);
}

export function shouldUseFinanceDemo({
  authEnabled,
  userId,
}: {
  authEnabled: boolean;
  userId: string | null;
}): boolean {
  return authEnabled && !userId;
}
