import { describe, expect, test } from "vitest";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "cleaning",
      "supplies",
      "emotion-cards",
      "portfolio",
    ]);
    expect(SECTIONS.map((s) => s.href)).toEqual([
      "/cleaning",
      "/supplies",
      "/emotion-cards",
      "/portfolio",
    ]);
  });

  test("every section defaults to not ready", () => {
    for (const section of SECTIONS) {
      expect(section.getStatus()).toEqual({ ready: false });
    }
  });
});
