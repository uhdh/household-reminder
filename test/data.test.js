import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, CATEGORIES } from "../data.js";

test("has exactly 21 items", () => {
  assert.equal(ITEMS.length, 21);
});

test("every item has required fields", () => {
  for (const item of ITEMS) {
    assert.equal(typeof item.id, "string");
    assert.ok(item.id.length > 0);
    assert.ok(
      CATEGORIES.some((c) => c.id === item.category),
      `unknown category for ${item.id}`
    );
    assert.equal(typeof item.name, "string");
    assert.equal(typeof item.icon, "string");
    assert.ok(
      item.cycleDays === null ||
        (Number.isInteger(item.cycleDays) && item.cycleDays > 0)
    );
  }
});

test("ids are unique", () => {
  const ids = ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no items have null cycleDays", () => {
  const nullItems = ITEMS.filter((i) => i.cycleDays === null).map((i) => i.id);
  assert.deepEqual(nullItems, []);
});

test("has exactly 5 categories matching the image columns", () => {
  assert.deepEqual(
    CATEGORIES.map((c) => c.id),
    ["bathroom", "kitchen", "bedroom", "personal", "appliance"]
  );
});
