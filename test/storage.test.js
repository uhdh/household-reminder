import { test } from "node:test";
import assert from "node:assert/strict";
import { loadAll, getLastDone, setLastDone, ensureInitialized } from "../storage.js";

function createMockStore() {
  const data = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

test("getLastDone returns null when nothing stored", () => {
  const store = createMockStore();
  assert.equal(getLastDone(store, "toothbrush"), null);
});

test("setLastDone persists a value retrievable by getLastDone", () => {
  const store = createMockStore();
  setLastDone(store, "toothbrush", "2026-07-01");
  assert.equal(getLastDone(store, "toothbrush"), "2026-07-01");
});

test("setLastDone does not overwrite other ids", () => {
  const store = createMockStore();
  setLastDone(store, "toothbrush", "2026-07-01");
  setLastDone(store, "razor", "2026-07-10");
  assert.equal(getLastDone(store, "toothbrush"), "2026-07-01");
  assert.equal(getLastDone(store, "razor"), "2026-07-10");
});

test("ensureInitialized sets today for items with no stored value", () => {
  const store = createMockStore();
  ensureInitialized(store, [{ id: "a" }, { id: "b" }], "2026-07-27");
  assert.equal(getLastDone(store, "a"), "2026-07-27");
  assert.equal(getLastDone(store, "b"), "2026-07-27");
});

test("ensureInitialized does not overwrite an existing value", () => {
  const store = createMockStore();
  setLastDone(store, "a", "2026-01-01");
  ensureInitialized(store, [{ id: "a" }], "2026-07-27");
  assert.equal(getLastDone(store, "a"), "2026-01-01");
});

test("loadAll returns an empty object for corrupted JSON", () => {
  const store = createMockStore();
  store.setItem("household-reminder:last-done", "{not json");
  assert.deepEqual(loadAll(store), {});
});
