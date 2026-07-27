import { addDays } from "./reminder.js";

const STORAGE_KEY = "household-reminder:last-done";
const SEED_MIN_PERCENT = 30;
const SEED_MAX_PERCENT = 80;

export function loadAll(store) {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAll(store, state) {
  store.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getLastDone(store, id) {
  const state = loadAll(store);
  return state[id] ?? null;
}

export function setLastDone(store, id, isoDate) {
  const state = loadAll(store);
  state[id] = isoDate;
  saveAll(store, state);
}

export function ensureInitialized(store, items, todayISODate) {
  const state = loadAll(store);
  let changed = false;
  for (const item of items) {
    if (!state[item.id]) {
      state[item.id] = seedLastDone(item, todayISODate);
      changed = true;
    }
  }
  if (changed) saveAll(store, state);
}

// Demo seed only: gives fresh installs a mix of progress bars (30~80%)
// instead of every card starting at 0%. Runs once per item, the first
// time it has no stored value.
function seedLastDone(item, todayISODate) {
  if (typeof item.cycleDays !== "number") return todayISODate;
  const percent = SEED_MIN_PERCENT + Math.floor(Math.random() * (SEED_MAX_PERCENT - SEED_MIN_PERCENT + 1));
  const elapsedDays = Math.round((item.cycleDays * percent) / 100);
  return addDays(todayISODate, -elapsedDays);
}
