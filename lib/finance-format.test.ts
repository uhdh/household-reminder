import { describe, expect, test } from "vitest";
import {
  formatManwon,
  formatSignedPct,
  isAllocationTargetSumValid,
  sumTargetPct,
  topNWithOther,
} from "./finance-format";

describe("topNWithOther", () => {
  test("returns entries unchanged when within the limit", () => {
    const entries: [string, number][] = [
      ["식비", 300],
      ["교통비", 100],
    ];
    expect(topNWithOther(entries, 5)).toEqual([
      ["식비", 300],
      ["교통비", 100],
    ]);
  });

  test("sorts descending and folds the tail into an other bucket", () => {
    const entries: [string, number][] = [
      ["교통비", 100],
      ["식비", 300],
      ["관광", 50],
      ["선물", 20],
      ["생활용품", 70],
      ["문화", 10],
    ];
    expect(topNWithOther(entries, 3)).toEqual([
      ["식비", 300],
      ["교통비", 100],
      ["생활용품", 70],
      ["기타", 80],
    ]);
  });

  test("omits the other bucket when the tail sums to zero", () => {
    const entries: [string, number][] = [
      ["식비", 300],
      ["교통비", 100],
      ["관광", 0],
    ];
    expect(topNWithOther(entries, 2)).toEqual([
      ["식비", 300],
      ["교통비", 100],
    ]);
  });

  test("merges the overflow into an existing category that already has the other label's name", () => {
    const entries: [string, number][] = [
      ["식비", 300],
      ["교통비", 100],
      ["기타", 50],
      ["관광", 40],
      ["선물", 20],
      ["문화", 10],
    ];
    expect(topNWithOther(entries, 3)).toEqual([
      ["식비", 300],
      ["교통비", 100],
      ["기타", 120],
    ]);
  });

  test("supports a custom other label", () => {
    const entries: [string, number][] = [
      ["식비", 300],
      ["교통비", 100],
      ["관광", 50],
    ];
    expect(topNWithOther(entries, 1, "나머지")).toEqual([
      ["식비", 300],
      ["나머지", 150],
    ]);
  });
});

describe("formatManwon", () => {
  test("rounds a tiny negative amount to 0 without a minus sign", () => {
    expect(formatManwon(-1000)).toBe("0만원");
  });

  test("keeps the minus sign for amounts that round to a nonzero value", () => {
    expect(formatManwon(-2_880_000)).toBe("-288만원");
  });

  test("formats a positive amount", () => {
    expect(formatManwon(2_880_000)).toBe("288만원");
  });
});

describe("formatSignedPct", () => {
  test("drops the sign when a tiny negative value rounds to zero", () => {
    expect(formatSignedPct(-0.04)).toBe("0.0%");
  });

  test("keeps the minus sign for a value that rounds to a nonzero negative", () => {
    expect(formatSignedPct(-0.4)).toBe("-0.4%");
  });

  test("adds a plus sign for positive values", () => {
    expect(formatSignedPct(12.34)).toBe("+12.3%");
  });

  test("supports a custom suffix", () => {
    expect(formatSignedPct(-0.02, 1, "%p")).toBe("0.0%p");
  });
});

describe("isAllocationTargetSumValid", () => {
  test("accepts exactly 100", () => {
    expect(isAllocationTargetSumValid(sumTargetPct([90, 5, 5]))).toBe(true);
  });

  test("accepts small floating point drift within tolerance", () => {
    expect(isAllocationTargetSumValid(99.95)).toBe(true);
  });

  test("rejects a sum that overshoots 100 like the reported 119.5% bug", () => {
    expect(isAllocationTargetSumValid(sumTargetPct([90, 19.5, 7.3, 2.7]))).toBe(false);
  });
});
