import { describe, expect, it } from "vitest";
import { isPublicFinancePath, shouldProtectFinanceRequest, shouldUseFinanceDemo } from "./finance-viewer";

describe("finance viewer access", () => {
  it.each([
    "/finance",
    "/finance/spending",
    "/finance/spending/monthly",
    "/finance/spending/yearly",
  ])("keeps %s public for the sample experience", (pathname) => {
    expect(isPublicFinancePath(pathname)).toBe(true);
  });

  it.each([
    "/finance/upload",
    "/finance/spending/settings",
    "/finance/spending/monthly/details",
  ])("keeps %s protected", (pathname) => {
    expect(isPublicFinancePath(pathname)).toBe(false);
  });

  it("uses demo data only for signed-out viewers when auth is enabled", () => {
    expect(shouldUseFinanceDemo({ authEnabled: true, userId: null })).toBe(true);
    expect(shouldUseFinanceDemo({ authEnabled: true, userId: "user@example.com" })).toBe(false);
    expect(shouldUseFinanceDemo({ authEnabled: false, userId: null })).toBe(false);
  });

  it("keeps public samples read-only while protecting mutations and private pages", () => {
    expect(shouldProtectFinanceRequest({ pathname: "/finance/spending", method: "GET" })).toBe(false);
    expect(shouldProtectFinanceRequest({ pathname: "/finance/spending", method: "POST" })).toBe(true);
    expect(shouldProtectFinanceRequest({ pathname: "/finance/upload", method: "GET" })).toBe(true);
  });
});
