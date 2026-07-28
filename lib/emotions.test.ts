import { describe, expect, test } from "vitest";
import { EMOTIONS, DEFINITIONS } from "./emotions";

describe("EMOTIONS catalog", () => {
  test("has 37 preset emotions with no duplicate names, each with a definition", () => {
    expect(EMOTIONS).toHaveLength(37);
    const names = new Set(EMOTIONS.map((e) => e.name));
    expect(names.size).toBe(37);
    for (const emotion of EMOTIONS) {
      expect(DEFINITIONS[emotion.name]).toBeTruthy();
    }
  });
});
