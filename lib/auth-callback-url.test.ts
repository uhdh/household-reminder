import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "./auth-callback-url";

describe("sanitizeCallbackUrl", () => {
  it("allows a same-site relative path", () => {
    expect(sanitizeCallbackUrl("/finance/spending")).toBe("/finance/spending");
  });

  it("rejects a protocol-relative URL", () => {
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/finance");
  });

  it("rejects an absolute URL", () => {
    expect(sanitizeCallbackUrl("https://evil.com")).toBe("/finance");
  });

  it("rejects a backslash-prefixed path", () => {
    expect(sanitizeCallbackUrl("/\\evil.com")).toBe("/finance");
  });

  it("falls back to /finance for an empty value", () => {
    expect(sanitizeCallbackUrl(undefined)).toBe("/finance");
    expect(sanitizeCallbackUrl(null)).toBe("/finance");
    expect(sanitizeCallbackUrl("")).toBe("/finance");
  });
});
