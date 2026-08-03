import { describe, expect, test } from "vitest";
import { topNWithOther } from "./finance-format";

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
