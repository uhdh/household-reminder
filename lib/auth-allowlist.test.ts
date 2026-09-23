import { describe, expect, it } from "vitest";
import { isAllowedFinanceSignIn, isEmailAllowed, parseAllowedEmails } from "./auth-allowlist";

describe("parseAllowedEmails", () => {
  it("trims whitespace and lowercases entries, dropping empties", () => {
    expect(parseAllowedEmails(" A@Example.com , b@example.com ,,")).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns an empty list when unset", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails(null)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  it("matches case-insensitively", () => {
    expect(isEmailAllowed("A@Example.com", "a@example.com")).toBe(true);
  });

  it("ignores surrounding whitespace in the list and the email", () => {
    expect(isEmailAllowed(" a@example.com ", " a@example.com , b@example.com")).toBe(true);
  });

  it("fails closed when the allow list is empty or unset", () => {
    expect(isEmailAllowed("a@example.com", "")).toBe(false);
    expect(isEmailAllowed("a@example.com", undefined)).toBe(false);
  });

  it("rejects emails outside the list", () => {
    expect(isEmailAllowed("outsider@example.com", "a@example.com,b@example.com")).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isEmailAllowed(undefined, "a@example.com")).toBe(false);
  });
});

describe("isAllowedFinanceSignIn", () => {
  const allowedEmailsRaw = "a@example.com";

  it("allows a verified, listed email", () => {
    expect(isAllowedFinanceSignIn({ emailVerified: true, email: "A@Example.com", allowedEmailsRaw })).toBe(true);
  });

  it("rejects an unverified email even if listed", () => {
    expect(isAllowedFinanceSignIn({ emailVerified: false, email: "a@example.com", allowedEmailsRaw })).toBe(false);
  });

  it("rejects a verified email outside the list", () => {
    expect(isAllowedFinanceSignIn({ emailVerified: true, email: "outsider@example.com", allowedEmailsRaw })).toBe(false);
  });

  it("rejects everyone when the allow list is empty", () => {
    expect(isAllowedFinanceSignIn({ emailVerified: true, email: "a@example.com", allowedEmailsRaw: "" })).toBe(false);
  });
});
