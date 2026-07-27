import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDbForTesting, initSchema, insertChore, getDb } from "./db";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["cleaning", "supplies", "emotion-cards", "portfolio"]);
    expect(SECTIONS.map((s) => s.href)).toEqual(["/cleaning", "/supplies", "/emotion-cards", "/portfolio"]);
  });

  test("supplies/emotion-cards/portfolio still default to not ready", () => {
    const notYetPorted = SECTIONS.filter((s) => s.id !== "cleaning");
    for (const section of notYetPorted) {
      expect(section.getStatus()).toEqual({ ready: false });
    }
  });
});

describe("cleaning section status", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports ready with an overdue count when chores are overdue", () => {
    insertChore(getDb(), { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    const cleaning = SECTIONS.find((s) => s.id === "cleaning")!;
    expect(cleaning.getStatus()).toEqual({ ready: true, label: "밀린 항목 1개" });
  });

  test("reports ready with a done message when nothing is overdue", () => {
    const cleaning = SECTIONS.find((s) => s.id === "cleaning")!;
    expect(cleaning.getStatus()).toEqual({ ready: true, label: "전부 완료" });
  });
});
