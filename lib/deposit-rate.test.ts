import { describe, expect, test } from "vitest";
import { annualInterest, parseRatePct } from "./deposit-rate";

describe("parseRatePct", () => {
  test("빈 값은 지우기(null), 숫자·%·쉼표는 허용하고 소수 셋째 자리로 반올림한다", () => {
    expect(parseRatePct("")).toBeNull();
    expect(parseRatePct("  ")).toBeNull();
    expect(parseRatePct("3.5")).toBe(3.5);
    expect(parseRatePct("3.25%")).toBe(3.25);
    expect(parseRatePct("0")).toBe(0);
    expect(parseRatePct("2.12345")).toBe(2.123);
  });

  test("문자·음수·100 초과는 invalid", () => {
    expect(parseRatePct("abc")).toBe("invalid");
    expect(parseRatePct("-1")).toBe("invalid");
    expect(parseRatePct("100.1")).toBe("invalid");
  });
});

describe("annualInterest", () => {
  test("금리가 있으면 금액×금리, 없으면 null", () => {
    expect(annualInterest(10_000_000, 3.5)).toBe(350_000);
    expect(annualInterest(10_000_000, null)).toBeNull();
  });
});
