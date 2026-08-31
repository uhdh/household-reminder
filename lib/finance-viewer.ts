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
  clerkEnabled,
  userId,
}: {
  clerkEnabled: boolean;
  userId: string | null;
}): boolean {
  return clerkEnabled && !userId;
}
