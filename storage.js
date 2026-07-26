const STORAGE_KEY = "household-reminder:last-done";

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
      state[item.id] = todayISODate;
      changed = true;
    }
  }
  if (changed) saveAll(store, state);
}
