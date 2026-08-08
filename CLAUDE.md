# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, build-tool-free web page (Korean UI) that reminds users when to replace/clean 21
household items (toothbrush, razor, AC filter, etc.). Items are grouped into 4 category
columns; clicking a card opens a confirmation toast to mark it "done today" (or a chosen past
date), which resets its cycle. All state lives in `localStorage` — there is no backend, no
build step, and no npm dependencies. Open `index.html` directly in a browser (or serve the
folder with any static file server) to run it.

## Commands

- Run all tests: `npm test` (equivalent to `node --test`)
- Run a single test file: `node --test test/reminder.test.js`
- No lint/build/typecheck scripts exist — `package.json` only defines `test`.

## Architecture

Four ES modules, loaded via `<script type="module" src="app.js">` in `index.html` — no
bundler, no transpilation:

- **`data.js`** — static data only: `CATEGORIES` (id/label, column order = array order) and
  `ITEMS` (id, category, name, icon, `cycleDays`). `id` doubles as the `localStorage` key per
  item, so it must stay unique and stable.
- **`reminder.js`** — pure date/status functions, no DOM or storage access: `todayISO`,
  `addDays`, `daysBetween`, `computeStatus(lastDoneISO, cycleDays, todayISODate)`. This is the
  only place cycle math happens. `computeStatus` treats `cycleDays === null` as a
  condition-based item (no D-day, no overdue badge, no progress bar) — supported by the code
  even though no current item in `data.js` uses it.
- **`storage.js`** — thin `localStorage` wrapper keyed under `"household-reminder:last-done"`,
  storing `{ [itemId]: "YYYY-MM-DD" }`. `ensureInitialized` seeds any item with no stored value
  on first load; the seed is intentionally randomized to 30–80% of its cycle (`seedLastDone`)
  purely so a fresh install shows a mix of progress bars instead of every card starting at 0% —
  don't "fix" this into a deterministic value without checking why it's there.
- **`app.js`** — the entry point (runs top-level on import). Builds the board DOM from
  `CATEGORIES`/`ITEMS`, wires the click → confirmation toast → `setLastDone` → re-render flow,
  and computes progress-bar color/width from `computeStatus`'s output. This is the only module
  that touches the DOM or `window`; it takes `store = window.localStorage` and passes it into
  `storage.js` functions (which is also why `storage.js` tests can pass a mock store instead of
  real `localStorage`).

Data flow is one-directional: `data.js` (static) → `reminder.js` (pure calc, fed by
`storage.js` reads) → `app.js` (renders, writes back through `storage.js` on user action) →
re-render.

### Tests

`test/*.test.js` mirrors the root modules 1:1 (`data.test.js`, `reminder.test.js`,
`storage.test.js`) using Node's built-in `node:test` + `node:assert/strict` — no test
framework dependency. `storage.test.js` uses a hand-rolled mock store
(`{ getItem, setItem }`) rather than real `localStorage`, since tests run under plain Node.
`app.js` (the DOM layer) has no automated tests by design — it's verified manually in a
browser.

### Planning docs

`docs/superpowers/specs/` and `docs/superpowers/plans/` hold the original design spec and
implementation plan from this project's initial build. They are historical: later commits
diverged from them (e.g. the spec's "개인관리" category and 30-item/`script.js` naming were
dropped down to the current 4 categories / 21 items / `data.js`+`app.js` split). Treat the
actual code as the source of truth over these docs.
