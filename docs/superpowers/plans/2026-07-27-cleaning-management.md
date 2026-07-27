# 청소 관리 (`/cleaning`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/cleaning` route — a card grid of chores (icon, name, D-day label, progress bar, overdue badge) backed by SQLite, with complete/create/update/delete, and wire the home shell's "청소 관리" row to show a real overdue count.

**Architecture:** `lib/chores.ts` holds pure due-date/status math (no I/O). `lib/db.ts` wraps `node:sqlite` with schema + row-level CRUD functions that take an explicit `DatabaseSync` instance (so tests inject `:memory:`). `app/cleaning/actions.ts` is a thin `'use server'` layer: parse/validate `FormData`, call `lib/db.ts`, `revalidatePath`. `app/cleaning/chore-grid.tsx` is a `'use client'` presentational+interactive component driven entirely by props (chores array + action callbacks) — no direct DB access. `app/cleaning/page.tsx` is the server component gluing DB reads to `ChoreGrid` and the four actions.

**Tech Stack:** Next.js 16.2.12 (App Router), React 19, TypeScript, Tailwind CSS v4, `node:sqlite` (Node 24 built-in), `date-fns`, Vitest + React Testing Library.

## Global Constraints

- Next.js in this repo is version 16.2.12 with breaking changes vs. older Next.js — check `node_modules/next/dist/docs/01-app/` for anything not covered verbatim below (already checked: `01-getting-started/07-mutating-data.md` for Server Actions).
- No categories — chores are a single flat list (per spec, reversing the earlier icon-grid direction).
- No undo — fixing a mistake means editing the item's last-done date directly.
- No login/multi-user, no realtime/polling.
- Storage is `node:sqlite`, not `better-sqlite3` — no native addon install. See `docs/superpowers/specs/2026-07-27-cleaning-management-design.md` for why.
- `getStatus()` on `lib/sections.ts`'s `Section` type is synchronous (established in the home-shell plan) — the cleaning status lookup must stay synchronous too (`node:sqlite`'s `DatabaseSync` is synchronous, so this holds without change).
- Visual style follows 생필품 관리's card design (icon + name + D-day label + progress bar + overdue badge), not the abandoned `design/chore-planner-mockup.html` icon grid.
- Testing: Vitest + React Testing Library only, no e2e in this plan.

---

### Task 1: `lib/chores.ts` — pure due-date/status calculation

**Files:**
- Create: `lib/chores.ts`
- Create: `lib/chores.test.ts`
- Modify: `package.json` (add `date-fns` dependency)

**Interfaces:**
- Produces: `export type IntervalUnit = "day" | "week" | "month"`
- Produces: `export type ChoreStatus = { dueDate: string; daysRemaining: number; overdue: boolean; percent: number }`
- Produces: `export function todayISO(now?: Date): string` — returns `"yyyy-MM-dd"`
- Produces: `export function computeChoreStatus(lastDoneISO: string | null, intervalValue: number, intervalUnit: IntervalUnit, todayISODate: string): ChoreStatus`

- [ ] **Step 1: Install `date-fns`**

Run: `npm install date-fns`

- [ ] **Step 2: Write the failing tests**

```ts
// lib/chores.test.ts
import { describe, expect, test } from "vitest";
import { computeChoreStatus, todayISO } from "./chores";

describe("todayISO", () => {
  test("formats a Date as yyyy-MM-dd", () => {
    expect(todayISO(new Date(2026, 6, 27))).toBe("2026-07-27");
  });
});

describe("computeChoreStatus", () => {
  test("day unit: partway through the interval", () => {
    const status = computeChoreStatus("2026-07-01", 3, "day", "2026-07-02");
    expect(status.dueDate).toBe("2026-07-04");
    expect(status.daysRemaining).toBe(2);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(33);
  });

  test("week unit: exactly due today counts as overdue", () => {
    const status = computeChoreStatus("2026-07-01", 1, "week", "2026-07-08");
    expect(status.dueDate).toBe("2026-07-08");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("month unit: calendar-accurate, clamps to shorter month", () => {
    const status = computeChoreStatus("2026-01-31", 1, "month", "2026-02-01");
    expect(status.dueDate).toBe("2026-02-28");
  });

  test("null last-done date is always immediately overdue", () => {
    const status = computeChoreStatus(null, 1, "week", "2026-07-27");
    expect(status.dueDate).toBe("2026-07-27");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("past the due date reports a positive overdue count via negative daysRemaining", () => {
    const status = computeChoreStatus("2026-07-01", 3, "day", "2026-07-10");
    expect(status.daysRemaining).toBe(-3);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/chores.test.ts`
Expected: FAIL — `Cannot find module './chores'`

- [ ] **Step 4: Write the implementation**

```ts
// lib/chores.ts
import { addDays, addWeeks, addMonths, differenceInCalendarDays, parseISO, format } from "date-fns";

export type IntervalUnit = "day" | "week" | "month";

export type ChoreStatus = {
  dueDate: string;
  daysRemaining: number;
  overdue: boolean;
  percent: number;
};

export function todayISO(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

function addInterval(fromISO: string, value: number, unit: IntervalUnit): string {
  const date = parseISO(fromISO);
  const result =
    unit === "day" ? addDays(date, value) : unit === "week" ? addWeeks(date, value) : addMonths(date, value);
  return format(result, "yyyy-MM-dd");
}

function daysBetween(fromISO: string, toISO: string): number {
  return differenceInCalendarDays(parseISO(toISO), parseISO(fromISO));
}

export function computeChoreStatus(
  lastDoneISO: string | null,
  intervalValue: number,
  intervalUnit: IntervalUnit,
  todayISODate: string
): ChoreStatus {
  if (lastDoneISO === null) {
    return { dueDate: todayISODate, daysRemaining: 0, overdue: true, percent: 100 };
  }

  const dueDate = addInterval(lastDoneISO, intervalValue, intervalUnit);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  const totalDays = daysBetween(lastDoneISO, dueDate);
  const elapsedDays = totalDays - daysRemaining;
  const percent = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));

  return { dueDate, daysRemaining, overdue: daysRemaining <= 0, percent };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/chores.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/chores.ts lib/chores.test.ts
git commit -m "feat: add pure chore due-date/status calculation"
```

---

### Task 2: `lib/db.ts` — `node:sqlite` schema + row CRUD

**Files:**
- Create: `lib/db.ts`
- Create: `lib/db.test.ts`
- Modify: `.gitignore` (add `data/` — the local SQLite file directory)

**Interfaces:**
- Consumes: `IntervalUnit` from `lib/chores.ts` (Task 1)
- Produces: `export type ChoreRow = { id: number; name: string; icon: string; interval_value: number; interval_unit: IntervalUnit; last_done_at: string | null; created_at: string }`
- Produces: `export type ChoreInput = { name: string; icon: string; intervalValue: number; intervalUnit: IntervalUnit }`
- Produces: `export function initSchema(database: DatabaseSync): void`
- Produces: `export function getDb(): DatabaseSync` — memoized, file-backed at `data/db.sqlite`
- Produces: `export function setDbForTesting(database: import("node:sqlite").DatabaseSync | null): void` — overrides what `getDb()` returns; pass `null` to clear the override
- Produces: `export function getAllChores(database: DatabaseSync): ChoreRow[]`
- Produces: `export function insertChore(database: DatabaseSync, input: ChoreInput): ChoreRow`
- Produces: `export function updateChoreRow(database: DatabaseSync, id: number, input: ChoreInput): void`
- Produces: `export function completeChoreRow(database: DatabaseSync, id: number, doneDateISO: string): void`
- Produces: `export function deleteChoreRow(database: DatabaseSync, id: number): void`

- [ ] **Step 1: Add `data/` to `.gitignore`**

Add this line under a new `# local sqlite db` heading in `.gitignore`:

```
# local sqlite db
data/
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/db.test.ts
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, test } from "vitest";
import {
  initSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
} from "./db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  return db;
}

describe("lib/db chore CRUD", () => {
  test("insertChore creates a row with null last_done_at and returns it", () => {
    const db = freshDb();
    const row = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    expect(row.name).toBe("빨래");
    expect(row.icon).toBe("🧺");
    expect(row.interval_value).toBe(1);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBeNull();
    expect(typeof row.created_at).toBe("string");
  });

  test("getAllChores returns every inserted row, ordered by id", () => {
    const db = freshDb();
    insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    insertChore(db, { name: "설거지", icon: "🍽️", intervalValue: 1, intervalUnit: "day" });
    const rows = getAllChores(db);
    expect(rows.map((r) => r.name)).toEqual(["빨래", "설거지"]);
  });

  test("updateChoreRow changes name/icon/interval but not last_done_at", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    completeChoreRow(db, created.id, "2026-07-01");
    updateChoreRow(db, created.id, { name: "손빨래", icon: "🧴", intervalValue: 2, intervalUnit: "week" });
    const [row] = getAllChores(db);
    expect(row.name).toBe("손빨래");
    expect(row.icon).toBe("🧴");
    expect(row.interval_value).toBe(2);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBe("2026-07-01");
  });

  test("completeChoreRow sets last_done_at", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    completeChoreRow(db, created.id, "2026-07-27");
    const [row] = getAllChores(db);
    expect(row.last_done_at).toBe("2026-07-27");
  });

  test("deleteChoreRow removes the row", () => {
    const db = freshDb();
    const created = insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    deleteChoreRow(db, created.id);
    expect(getAllChores(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/db.test.ts`
Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 4: Write the implementation**

```ts
// lib/db.ts
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { IntervalUnit } from "./chores";

export type ChoreRow = {
  id: number;
  name: string;
  icon: string;
  interval_value: number;
  interval_unit: IntervalUnit;
  last_done_at: string | null;
  created_at: string;
};

export type ChoreInput = {
  name: string;
  icon: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

const DB_PATH = path.join(process.cwd(), "data", "db.sqlite");

let dbInstance: DatabaseSync | null = null;
let testOverride: DatabaseSync | null = null;

export function initSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL,
      last_done_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

export function getDb(): DatabaseSync {
  if (testOverride) return testOverride;
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function setDbForTesting(database: DatabaseSync | null): void {
  testOverride = database;
}

export function getAllChores(database: DatabaseSync): ChoreRow[] {
  return database.prepare("SELECT * FROM chores ORDER BY id").all() as unknown as ChoreRow[];
}

export function insertChore(database: DatabaseSync, input: ChoreInput): ChoreRow {
  const createdAt = new Date().toISOString();
  const info = database
    .prepare(
      "INSERT INTO chores (name, icon, interval_value, interval_unit, last_done_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
    )
    .run(input.name, input.icon, input.intervalValue, input.intervalUnit, createdAt);
  return database
    .prepare("SELECT * FROM chores WHERE id = ?")
    .get(info.lastInsertRowid) as unknown as ChoreRow;
}

export function updateChoreRow(database: DatabaseSync, id: number, input: ChoreInput): void {
  database
    .prepare("UPDATE chores SET name = ?, icon = ?, interval_value = ?, interval_unit = ? WHERE id = ?")
    .run(input.name, input.icon, input.intervalValue, input.intervalUnit, id);
}

export function completeChoreRow(database: DatabaseSync, id: number, doneDateISO: string): void {
  database.prepare("UPDATE chores SET last_done_at = ? WHERE id = ?").run(doneDateISO, id);
}

export function deleteChoreRow(database: DatabaseSync, id: number): void {
  database.prepare("DELETE FROM chores WHERE id = ?").run(id);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run lib/db.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add .gitignore lib/db.ts lib/db.test.ts
git commit -m "feat: add node:sqlite schema and chore row CRUD"
```

---

### Task 3: `app/cleaning/actions.ts` — Server Actions

**Files:**
- Create: `app/cleaning/actions.ts`
- Create: `app/cleaning/actions.test.ts`

**Interfaces:**
- Consumes: `getDb`, `setDbForTesting`, `insertChore`, `updateChoreRow`, `completeChoreRow`, `deleteChoreRow`, `ChoreInput` from `lib/db.ts` (Task 2); `IntervalUnit` from `lib/chores.ts` (Task 1)
- Produces: `export function parseChoreForm(formData: FormData): ChoreInput | { error: string }` (exported for direct unit testing)
- Produces: `export async function createChore(formData: FormData): Promise<{ error?: string }>`
- Produces: `export async function updateChore(id: number, formData: FormData): Promise<{ error?: string }>`
- Produces: `export async function completeChore(id: number, doneDateISO: string): Promise<void>`
- Produces: `export async function deleteChore(id: number): Promise<void>`

- [ ] **Step 1: Write the failing tests**

```ts
// app/cleaning/actions.test.ts
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getAllChores, getDb } from "@/lib/db";
import { parseChoreForm, createChore, updateChore, completeChore, deleteChore } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function formDataOf(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("parseChoreForm", () => {
  test("rejects an empty name", () => {
    const result = parseChoreForm(
      formDataOf({ name: "  ", icon: "🧺", intervalValue: "1", intervalUnit: "week" })
    );
    expect(result).toEqual({ error: "이름을 입력해주세요." });
  });

  test("rejects a non-integer interval value", () => {
    const result = parseChoreForm(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "abc", intervalUnit: "week" })
    );
    expect(result).toEqual({ error: "주기는 1 이상의 정수여야 합니다." });
  });

  test("parses valid input", () => {
    const result = parseChoreForm(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "2", intervalUnit: "week" })
    );
    expect(result).toEqual({ name: "빨래", icon: "🧺", intervalValue: 2, intervalUnit: "week" });
  });
});

describe("Server Actions against an in-memory db", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("createChore inserts a row on valid input", async () => {
    const result = await createChore(
      formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" })
    );
    expect(result).toEqual({});
    expect(getAllChores(getDb())).toHaveLength(1);
  });

  test("createChore returns an error and inserts nothing on invalid input", async () => {
    const result = await createChore(formDataOf({ name: "", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    expect(result.error).toBeTruthy();
    expect(getAllChores(getDb())).toHaveLength(0);
  });

  test("completeChore sets last_done_at", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await completeChore(row.id, "2026-07-27");
    const [updated] = getAllChores(getDb());
    expect(updated.last_done_at).toBe("2026-07-27");
  });

  test("updateChore changes fields", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await updateChore(row.id, formDataOf({ name: "손빨래", icon: "🧴", intervalValue: "3", intervalUnit: "day" }));
    const [updated] = getAllChores(getDb());
    expect(updated.name).toBe("손빨래");
    expect(updated.interval_unit).toBe("day");
  });

  test("deleteChore removes the row", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = getAllChores(getDb());
    await deleteChore(row.id);
    expect(getAllChores(getDb())).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/cleaning/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`

- [ ] **Step 3: Write the implementation**

```ts
// app/cleaning/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  getDb,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
  type ChoreInput,
} from "@/lib/db";
import type { IntervalUnit } from "@/lib/chores";

const INTERVAL_UNITS: IntervalUnit[] = ["day", "week", "month"];

export function parseChoreForm(formData: FormData): ChoreInput | { error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const icon = String(formData.get("icon") ?? "").trim();
  const intervalValueRaw = String(formData.get("intervalValue") ?? "");
  const intervalUnit = String(formData.get("intervalUnit") ?? "") as IntervalUnit;

  if (!name) return { error: "이름을 입력해주세요." };
  if (!icon) return { error: "이모지를 입력해주세요." };

  const intervalValue = Number(intervalValueRaw);
  if (!Number.isInteger(intervalValue) || intervalValue < 1) {
    return { error: "주기는 1 이상의 정수여야 합니다." };
  }
  if (!INTERVAL_UNITS.includes(intervalUnit)) {
    return { error: "주기 단위가 올바르지 않습니다." };
  }

  return { name, icon, intervalValue, intervalUnit };
}

export async function createChore(formData: FormData): Promise<{ error?: string }> {
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  insertChore(getDb(), parsed);
  revalidatePath("/cleaning");
  return {};
}

export async function updateChore(id: number, formData: FormData): Promise<{ error?: string }> {
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  updateChoreRow(getDb(), id, parsed);
  revalidatePath("/cleaning");
  return {};
}

export async function completeChore(id: number, doneDateISO: string): Promise<void> {
  completeChoreRow(getDb(), id, doneDateISO);
  revalidatePath("/cleaning");
}

export async function deleteChore(id: number): Promise<void> {
  deleteChoreRow(getDb(), id);
  revalidatePath("/cleaning");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/cleaning/actions.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/cleaning/actions.ts app/cleaning/actions.test.ts
git commit -m "feat: add cleaning Server Actions with validation"
```

---

### Task 4: `app/cleaning/chore-grid.tsx` — card grid + complete flow

**Files:**
- Create: `app/cleaning/chore-grid.tsx`
- Create: `app/cleaning/chore-grid.test.tsx`

**Interfaces:**
- Consumes: `IntervalUnit`, `ChoreStatus` from `lib/chores.ts` (Task 1)
- Produces: `export type ChoreViewModel = { id: number; name: string; icon: string; intervalValue: number; intervalUnit: IntervalUnit; status: ChoreStatus }`
- Produces: `export function ChoreGrid(props: { chores: ChoreViewModel[]; completeAction: (id: number, doneDateISO: string) => Promise<void>; createAction: (formData: FormData) => Promise<{ error?: string }>; updateAction: (id: number, formData: FormData) => Promise<{ error?: string }>; deleteAction: (id: number) => Promise<void> })`
- This task covers rendering + the complete-toast flow only. Task 5 adds the add/edit/delete form on top of this same component.

- [ ] **Step 1: Write the failing tests**

```tsx
// app/cleaning/chore-grid.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoreGrid, type ChoreViewModel } from "./chore-grid";

const baseChores: ChoreViewModel[] = [
  {
    id: 1,
    name: "빨래",
    icon: "🧺",
    intervalValue: 1,
    intervalUnit: "week",
    status: { dueDate: "2026-07-30", daysRemaining: 3, overdue: false, percent: 57 },
  },
  {
    id: 2,
    name: "화장실 청소",
    icon: "🚽",
    intervalValue: 2,
    intervalUnit: "week",
    status: { dueDate: "2026-07-20", daysRemaining: -7, overdue: true, percent: 100 },
  },
];

function noop() {
  return Promise.resolve({});
}

describe("ChoreGrid rendering", () => {
  test("renders every chore's name, icon, and D-day label", () => {
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />
    );
    expect(screen.getByText("빨래")).toBeDefined();
    expect(screen.getByText("🧺")).toBeDefined();
    expect(screen.getByText("D-3")).toBeDefined();
    expect(screen.getByText("화장실 청소")).toBeDefined();
    expect(screen.getByText("D+7")).toBeDefined();
  });

  test("shows an overdue badge only for overdue chores", () => {
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />
    );
    const cards = screen.getAllByRole("button", { name: /완료 처리/ });
    expect(cards[0].textContent).not.toContain("!");
    expect(cards[1].textContent).toContain("!");
  });
});

describe("ChoreGrid complete flow", () => {
  test("clicking a card opens a confirm toast, and confirming calls completeAction with the card's id", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoreGrid
        chores={baseChores}
        completeAction={completeAction}
        createAction={noop}
        updateAction={noop}
        deleteAction={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "빨래 완료 처리" }));
    expect(screen.getByText("빨래 완료로 표시할까요?")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "완료로 표시" }));
    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(completeAction.mock.calls[0][0]).toBe(1);
    expect(typeof completeAction.mock.calls[0][1]).toBe("string");
  });

  test("clicking cancel in the toast calls nothing", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn();
    render(
      <ChoreGrid
        chores={baseChores}
        completeAction={completeAction}
        createAction={noop}
        updateAction={noop}
        deleteAction={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "빨래 완료 처리" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(completeAction).not.toHaveBeenCalled();
    expect(screen.queryByText("빨래 완료로 표시할까요?")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/cleaning/chore-grid.test.tsx`
Expected: FAIL — `Cannot find module './chore-grid'`

- [ ] **Step 3: Install `@testing-library/user-event`**

Run: `npm install -D @testing-library/user-event`

- [ ] **Step 4: Write the implementation**

```tsx
// app/cleaning/chore-grid.tsx
"use client";

import { useState } from "react";
import type { IntervalUnit, ChoreStatus } from "@/lib/chores";
import { todayISO } from "@/lib/chores";

export type ChoreViewModel = {
  id: number;
  name: string;
  icon: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  status: ChoreStatus;
};

type Props = {
  chores: ChoreViewModel[];
  completeAction: (id: number, doneDateISO: string) => Promise<void>;
  createAction: (formData: FormData) => Promise<{ error?: string }>;
  updateAction: (id: number, formData: FormData) => Promise<{ error?: string }>;
  deleteAction: (id: number) => Promise<void>;
};

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function ChoreGrid({ chores, completeAction, createAction, updateAction, deleteAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");

  const completingChore = chores.find((c) => c.id === completingId) ?? null;

  function openCompleteToast(chore: ChoreViewModel) {
    setCompletingId(chore.id);
    setDoneDate(todayISO());
  }

  function closeToast() {
    setCompletingId(null);
  }

  async function confirmComplete() {
    if (completingId === null) return;
    await completeAction(completingId, doneDate);
    setCompletingId(null);
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {chores.map((chore) => (
          <li key={chore.id}>
            <button
              type="button"
              aria-label={`${chore.name} 완료 처리`}
              onClick={() => openCompleteToast(chore)}
              className="relative flex w-full flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {chore.status.overdue && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  !
                </span>
              )}
              <span className="text-3xl">{chore.icon}</span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{chore.name}</span>
              <span className="flex w-full items-center gap-1">
                <span className="text-[10px] text-zinc-500">{dayLabel(chore.status.daysRemaining)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${chore.status.percent}%`,
                      background: progressColor(chore.status.percent, chore.status.overdue),
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {completingChore && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingChore.name} 완료로 표시할까요?</p>
          <label>
            완료한 날짜
            <input
              type="date"
              value={doneDate}
              onChange={(e) => setDoneDate(e.target.value)}
              className="ml-2 rounded bg-zinc-800 px-1 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeToast}>
              취소
            </button>
            <button type="button" onClick={confirmComplete} className="font-semibold text-blue-400">
              완료로 표시
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/cleaning/chore-grid.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/cleaning/chore-grid.tsx app/cleaning/chore-grid.test.tsx
git commit -m "feat: add chore card grid with complete-toast flow"
```

---

### Task 5: `app/cleaning/chore-grid.tsx` — add/edit/delete form

**Files:**
- Modify: `app/cleaning/chore-grid.tsx`
- Modify: `app/cleaning/chore-grid.test.tsx`

**Interfaces:**
- No new exports — extends the same `ChoreGrid` component and props from Task 4.

- [ ] **Step 1: Write the failing tests (append to the existing describe blocks)**

```tsx
// append to app/cleaning/chore-grid.test.tsx

describe("ChoreGrid add flow", () => {
  test("the + tile opens a create form; submitting valid input calls createAction", async () => {
    const user = userEvent.setup();
    const createAction = vi.fn().mockResolvedValue({});
    render(
      <ChoreGrid chores={[]} completeAction={vi.fn()} createAction={createAction} updateAction={noop} deleteAction={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "새로운 집안일 추가" }));
    await user.type(screen.getByLabelText("이름"), "빨래");
    await user.type(screen.getByLabelText("이모지"), "🧺");
    await user.clear(screen.getByLabelText("주기 값"));
    await user.type(screen.getByLabelText("주기 값"), "1");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(createAction).toHaveBeenCalledTimes(1);
    const submittedFormData = createAction.mock.calls[0][0] as FormData;
    expect(submittedFormData.get("name")).toBe("빨래");
    expect(submittedFormData.get("icon")).toBe("🧺");
  });

  test("shows an empty-state message when there are no chores", () => {
    render(<ChoreGrid chores={[]} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />);
    expect(screen.getByText("아직 등록된 집안일이 없어요")).toBeDefined();
  });
});

describe("ChoreGrid edit/delete flow", () => {
  test("the edit button opens a pre-filled form; submitting calls updateAction with the chore's id", async () => {
    const user = userEvent.setup();
    const updateAction = vi.fn().mockResolvedValue({});
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={updateAction} deleteAction={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "빨래 수정" }));
    expect(screen.getByLabelText("이름")).toHaveProperty("value", "빨래");

    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updateAction).toHaveBeenCalledTimes(1);
    expect(updateAction.mock.calls[0][0]).toBe(1);
  });

  test("the delete button in the edit form calls deleteAction with the chore's id", async () => {
    const user = userEvent.setup();
    const deleteAction = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={deleteAction} />
    );

    await user.click(screen.getByRole("button", { name: "빨래 수정" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(deleteAction).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run app/cleaning/chore-grid.test.tsx`
Expected: FAIL on the 4 new tests — no "+" tile, no edit button, no form exist yet.

- [ ] **Step 3: Extend the implementation**

Replace the full contents of `app/cleaning/chore-grid.tsx` with:

```tsx
// app/cleaning/chore-grid.tsx
"use client";

import { useState } from "react";
import type { IntervalUnit, ChoreStatus } from "@/lib/chores";
import { todayISO } from "@/lib/chores";

export type ChoreViewModel = {
  id: number;
  name: string;
  icon: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  status: ChoreStatus;
};

type Props = {
  chores: ChoreViewModel[];
  completeAction: (id: number, doneDateISO: string) => Promise<void>;
  createAction: (formData: FormData) => Promise<{ error?: string }>;
  updateAction: (id: number, formData: FormData) => Promise<{ error?: string }>;
  deleteAction: (id: number) => Promise<void>;
};

type FormState = { mode: "create" } | { mode: "edit"; chore: ChoreViewModel };

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function ChoreGrid({ chores, completeAction, createAction, updateAction, deleteAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const completingChore = chores.find((c) => c.id === completingId) ?? null;

  function openCompleteToast(chore: ChoreViewModel) {
    setCompletingId(chore.id);
    setDoneDate(todayISO());
  }

  function closeToast() {
    setCompletingId(null);
  }

  async function confirmComplete() {
    if (completingId === null) return;
    await completeAction(completingId, doneDate);
    setCompletingId(null);
  }

  function openCreateForm() {
    setFormError(null);
    setFormState({ mode: "create" });
  }

  function openEditForm(chore: ChoreViewModel) {
    setFormError(null);
    setFormState({ mode: "edit", chore });
  }

  function closeForm() {
    setFormState(null);
    setFormError(null);
  }

  async function submitForm(formData: FormData) {
    if (!formState) return;
    const result =
      formState.mode === "create" ? await createAction(formData) : await updateAction(formState.chore.id, formData);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    setFormState(null);
    setFormError(null);
  }

  async function handleDelete() {
    if (!formState || formState.mode !== "edit") return;
    await deleteAction(formState.chore.id);
    setFormState(null);
  }

  return (
    <div>
      {chores.length === 0 && <p>아직 등록된 집안일이 없어요</p>}

      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {chores.map((chore) => (
          <li key={chore.id} className="relative">
            <button
              type="button"
              aria-label={`${chore.name} 수정`}
              onClick={() => openEditForm(chore)}
              className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500 text-xs text-white"
            >
              ✎
            </button>
            <button
              type="button"
              aria-label={`${chore.name} 완료 처리`}
              onClick={() => openCompleteToast(chore)}
              className="relative flex w-full flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {chore.status.overdue && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  !
                </span>
              )}
              <span className="text-3xl">{chore.icon}</span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{chore.name}</span>
              <span className="flex w-full items-center gap-1">
                <span className="text-[10px] text-zinc-500">{dayLabel(chore.status.daysRemaining)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${chore.status.percent}%`,
                      background: progressColor(chore.status.percent, chore.status.overdue),
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-label="새로운 집안일 추가"
            onClick={openCreateForm}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-zinc-300 p-3 text-zinc-400 dark:border-zinc-700"
          >
            <span className="text-3xl">+</span>
            <span className="text-sm">추가</span>
          </button>
        </li>
      </ul>

      {completingChore && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingChore.name} 완료로 표시할까요?</p>
          <label>
            완료한 날짜
            <input
              type="date"
              value={doneDate}
              onChange={(e) => setDoneDate(e.target.value)}
              className="ml-2 rounded bg-zinc-800 px-1 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeToast}>
              취소
            </button>
            <button type="button" onClick={confirmComplete} className="font-semibold text-blue-400">
              완료로 표시
            </button>
          </div>
        </div>
      )}

      {formState && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35">
          <form
            action={submitForm}
            className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-zinc-900"
          >
            <h2 className="mb-2 text-base font-bold">{formState.mode === "create" ? "새로운 집안일" : "항목 수정"}</h2>

            {formError && <p className="mb-2 text-sm text-red-600">{formError}</p>}

            <label className="mb-2 flex items-center justify-between gap-2">
              이름
              <input
                name="name"
                type="text"
                defaultValue={formState.mode === "edit" ? formState.chore.name : ""}
                className="flex-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-2 flex items-center justify-between gap-2">
              이모지
              <input
                name="icon"
                type="text"
                defaultValue={formState.mode === "edit" ? formState.chore.icon : ""}
                className="w-16 rounded border border-zinc-300 px-2 py-1 text-center dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-2 flex items-center justify-between gap-2">
              주기 값
              <input
                name="intervalValue"
                type="number"
                min={1}
                defaultValue={formState.mode === "edit" ? formState.chore.intervalValue : 1}
                className="w-16 rounded border border-zinc-300 px-2 py-1 text-center dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-3 flex items-center justify-between gap-2">
              주기 단위
              <select
                name="intervalUnit"
                defaultValue={formState.mode === "edit" ? formState.chore.intervalUnit : "week"}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="day">일</option>
                <option value="week">주</option>
                <option value="month">개월</option>
              </select>
            </label>

            <div className="flex justify-between">
              <div>
                {formState.mode === "edit" && (
                  <button type="button" onClick={handleDelete} className="text-red-600">
                    삭제
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeForm}>
                  취소
                </button>
                <button type="submit" className="font-semibold text-blue-600">
                  저장
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/cleaning/chore-grid.test.tsx`
Expected: PASS (10 tests total)

- [ ] **Step 5: Commit**

```bash
git add app/cleaning/chore-grid.tsx app/cleaning/chore-grid.test.tsx
git commit -m "feat: add create/edit/delete form to chore grid"
```

---

### Task 6: `app/cleaning/page.tsx` wiring + home shell status integration

**Files:**
- Create: `app/cleaning/page.tsx`
- Modify: `lib/sections.ts` (cleaning section's `getStatus`)
- Modify: `lib/sections.test.ts` (update the cleaning-section expectation)

**Interfaces:**
- Consumes: `getDb`, `getAllChores` from `lib/db.ts`; `computeChoreStatus`, `todayISO` from `lib/chores.ts`; `ChoreGrid`, `ChoreViewModel` from `./chore-grid`; `createChore`, `updateChore`, `completeChore`, `deleteChore` from `./actions`

- [ ] **Step 1: Write the failing test for the updated `lib/sections.ts` cleaning entry**

Replace the "every section defaults to not ready" test in `lib/sections.test.ts` with:

```ts
// lib/sections.test.ts (full replacement)
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
```

- [ ] **Step 2: Run tests to verify the cleaning-section tests fail**

Run: `npx vitest run lib/sections.test.ts`
Expected: FAIL — cleaning's `getStatus()` still returns `{ ready: false }`.

- [ ] **Step 3: Update `lib/sections.ts`'s cleaning entry**

In `lib/sections.ts`, add the imports at the top and replace only the `cleaning` entry's `getStatus`:

```ts
// add to the top of lib/sections.ts
import { getDb, getAllChores } from "./db";
import { computeChoreStatus, todayISO } from "./chores";
```

```ts
// replace the "cleaning" object's getStatus in the SECTIONS array
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: () => {
      const today = todayISO();
      const overdueCount = getAllChores(getDb()).filter(
        (row) => computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/sections.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full suite once — `app/home-view.test.tsx`'s default-render test now touches the real (empty) file DB**

Run: `npm run test`
Expected: all tests still PASS. The existing "renders the real default SECTIONS" test in `app/home-view.test.tsx` will, as a side effect, create an empty `data/db.sqlite` (harmless, gitignored per Task 2's `.gitignore` change) — it asserts only section count/greeting text, not cleaning's specific label, so it is unaffected by this change.

- [ ] **Step 6: Write `app/cleaning/page.tsx`**

```tsx
// app/cleaning/page.tsx
import { getDb, getAllChores } from "@/lib/db";
import { computeChoreStatus, todayISO } from "@/lib/chores";
import { ChoreGrid, type ChoreViewModel } from "./chore-grid";
import { createChore, updateChore, completeChore, deleteChore } from "./actions";

export default function CleaningPage() {
  const today = todayISO();
  const rows = getAllChores(getDb());

  const chores: ChoreViewModel[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    status: computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today),
  }));

  return (
    <main className="mx-auto max-w-2xl p-4">
      <h1 className="mb-4 text-xl font-bold">청소 관리</h1>
      <ChoreGrid
        chores={chores}
        completeAction={completeChore}
        createAction={createChore}
        updateAction={updateChore}
        deleteAction={deleteChore}
      />
    </main>
  );
}
```

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/cleaning`, and confirm:
- Empty state message shows with no chores
- "+ 추가" creates a chore that then appears in the grid
- Clicking a chore opens the complete toast; confirming updates its D-day label and progress bar
- The edit (✎) button opens a pre-filled form; saving updates the card; deleting removes it
- Go back to `/` (home) and confirm the "청소 관리" row now shows a real "밀린 항목 N개" or "전부 완료" label instead of "준비중", and is a clickable link to `/cleaning`

- [ ] **Step 8: Run lint, typecheck, and the full test suite one more time**

Run: `npm run lint`
Expected: no errors.

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run test`
Expected: all tests passing.

- [ ] **Step 9: Commit**

```bash
git add app/cleaning/page.tsx lib/sections.ts lib/sections.test.ts
git commit -m "feat: wire /cleaning page and real home-shell status"
```
