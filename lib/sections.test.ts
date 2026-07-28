import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDbForTesting, initSchema, getDb } from "./db";
import { insertChore } from "./chores-db";
import { getAllSupplies, completeSupplyRow } from "./supplies-db";
import { saveRecord } from "./emotion-cards-db";
import { todayISO } from "./chores";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["cleaning", "supplies", "emotion-cards", "portfolio"]);
    expect(SECTIONS.map((s) => s.href)).toEqual(["/cleaning", "/supplies", "/emotion-cards", "/portfolio"]);
  });

  test("portfolio still defaults to not ready", () => {
    const portfolio = SECTIONS.find((s) => s.id === "portfolio")!;
    expect(portfolio.getStatus()).toEqual({ ready: false });
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

describe("supplies section status", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports ready with a done message right after seeding (nothing overdue yet)", () => {
    const supplies = SECTIONS.find((s) => s.id === "supplies")!;
    expect(supplies.getStatus()).toEqual({ ready: true, label: "전부 완료" });
  });

  test("reports ready with an overdue count once an item is pushed into the past", () => {
    const [first] = getAllSupplies(getDb());
    completeSupplyRow(getDb(), first.id, "2000-01-01");
    const supplies = SECTIONS.find((s) => s.id === "supplies")!;
    expect(supplies.getStatus()).toEqual({ ready: true, label: "밀린 항목 1개" });
  });
});

describe("emotion-cards section status", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports not-yet-recorded before today's cards are saved", () => {
    const emotionCards = SECTIONS.find((s) => s.id === "emotion-cards")!;
    expect(emotionCards.getStatus()).toEqual({ ready: true, label: "아직 기록 전" });
  });

  test("reports complete once today's record is saved", () => {
    saveRecord(getDb(), todayISO(), [
      { name: "행복", emoji: "😊", color: "green" },
      { name: "슬픔", emoji: "😢", color: "blue" },
      { name: "화남", emoji: "😡", color: "red" },
    ]);
    const emotionCards = SECTIONS.find((s) => s.id === "emotion-cards")!;
    expect(emotionCards.getStatus()).toEqual({ ready: true, label: "오늘 기록 완료" });
  });
});
