# 생필품 관리(`/supplies`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-07-28-supplies-management-design.md`에서 승인된 설계대로, `/supplies` 라우트에 21개 고정 생필품 카탈로그를 카테고리 컬럼 그리드로 보여주고 완료 처리만 가능하게 만든다.

**Architecture:** `/cleaning`과 동일한 계층(순수 함수 → `node:sqlite` DB 접근 → Server Action → Server Component 페이지 → Client Component 그리드)을 따르되, CRUD 없이 완료 처리(`completeSupply`)만 있고, 카테고리 컬럼 레이아웃을 유지한다.

**Tech Stack:** Next.js Server Actions, `node:sqlite`(`DatabaseSync`), `date-fns`, React (Client Component), Vitest + React Testing Library.

## Global Constraints

- 기존 `data/db.sqlite` 파일을 청소 관리와 공유한다 — 별도 DB 파일 없음.
- DB 경로 환경변수를 `CHORE_DB_PATH`에서 `APP_DB_PATH`로 개명한다.
- 주기는 `cycle_days` 단일 정수로 저장한다 (interval value+unit 방식 아님).
- 항목은 21개 고정 카탈로그다 — 추가/수정/삭제 UI/액션 없음, `completeSupply`만 존재.
- 카테고리 컬럼 레이아웃을 유지한다 (청소 관리의 단일 그리드와 다름).
- 카테고리 색상: bathroom `#4a90d9`, kitchen `#4caf7d`, bedroom `#e05a7e`, appliance `#2bb3a3`.
- 카테고리 표시 순서: 욕실용품 → 주방용품 → 침실&리빙 → 가전&설비.
- 최초 시드 시 `last_done_at`은 시드 실행일(오늘)로 채운다.
- e2e/브라우저 자동화 테스트는 만들지 않는다(YAGNI) — 구현 후 수동 확인으로 대체.

---

### Task 1: DB 경로 환경변수 개명 (`CHORE_DB_PATH` → `APP_DB_PATH`)

**Files:**
- Modify: `lib/db.ts:23-25` (`resolveDbPath`)
- Modify: `lib/db.test.ts:84,97` (파일 기반 DB 테스트)

**Interfaces:**
- Consumes: 없음 (순수 리네이밍)
- Produces: 이후 모든 태스크가 `APP_DB_PATH`라는 이름으로 DB 파일 경로를 안다.

- [ ] **Step 1: 테스트에서 환경변수 이름을 먼저 바꾼다**

`lib/db.test.ts`의 72-114행 블록에서 `CHORE_DB_PATH`를 `APP_DB_PATH`로 바꾼다:

```ts
  test("getDb() creates data directory and file-backed database without throwing", () => {
    // Point at a throwaway temp directory — never the project's real data/
    // directory, which holds the actual persistent db.sqlite.
    tempDir = path.join(os.tmpdir(), `cleaning-db-test-${Date.now()}`);
    const dbFile = path.join(tempDir, "db.sqlite");
    process.env.APP_DB_PATH = dbFile;
```

그리고 `afterEach`의 `delete process.env.CHORE_DB_PATH;`도 `delete process.env.APP_DB_PATH;`로 바꾼다.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/db.test.ts`
Expected: FAIL — `getDb()`가 여전히 `CHORE_DB_PATH`를 읽으므로, 테스트가 지정한 임시 경로(`APP_DB_PATH`)가 무시되고 실제 `data/db.sqlite`가 열려 `existsSync(dbFile)` 단언이 실패한다.

- [ ] **Step 3: 구현에서도 이름을 바꾼다**

`lib/db.ts`의 `resolveDbPath`:

```ts
function resolveDbPath(): string {
  return process.env.APP_DB_PATH ?? path.join(process.cwd(), "data", "db.sqlite");
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/db.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "refactor: rename CHORE_DB_PATH to APP_DB_PATH ahead of supplies port"
```

---

### Task 2: 생필품 상태 계산 순수 함수 (`lib/supplies.ts`)

**Files:**
- Create: `lib/supplies.ts`
- Create: `lib/supplies.test.ts`

**Interfaces:**
- Consumes: 없음 (leaf 모듈, `date-fns`만 사용)
- Produces:
  - `type SupplyCategory = "bathroom" | "kitchen" | "bedroom" | "appliance"`
  - `type SupplyStatus = { dueDate: string; daysRemaining: number; overdue: boolean; percent: number }`
  - `const SUPPLY_CATEGORIES: { id: SupplyCategory; label: string; color: string }[]`
  - `function computeSupplyStatus(lastDoneISO: string, cycleDays: number, todayISODate: string): SupplyStatus`
  - Task 3(`lib/db.ts`)은 `SupplyCategory` 타입을, Task 5(`supply-grid.tsx`)는 `SUPPLY_CATEGORIES`와 `SupplyStatus`를 이 파일에서 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/supplies.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { computeSupplyStatus } from "./supplies";

describe("computeSupplyStatus", () => {
  test("partway through the cycle", () => {
    const status = computeSupplyStatus("2026-07-01", 10, "2026-07-04");
    expect(status.dueDate).toBe("2026-07-11");
    expect(status.daysRemaining).toBe(7);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(30);
  });

  test("exactly due today counts as overdue", () => {
    const status = computeSupplyStatus("2026-07-01", 7, "2026-07-08");
    expect(status.dueDate).toBe("2026-07-08");
    expect(status.daysRemaining).toBe(0);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("past the due date reports negative daysRemaining and clamps percent at 100", () => {
    const status = computeSupplyStatus("2026-07-01", 5, "2026-07-10");
    expect(status.daysRemaining).toBe(-4);
    expect(status.overdue).toBe(true);
    expect(status.percent).toBe(100);
  });

  test("freshly seeded (last done today) is never overdue and starts at 0%", () => {
    const status = computeSupplyStatus("2026-07-27", 90, "2026-07-27");
    expect(status.daysRemaining).toBe(90);
    expect(status.overdue).toBe(false);
    expect(status.percent).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/supplies.test.ts`
Expected: FAIL with "Cannot find module './supplies'" (파일이 아직 없음)

- [ ] **Step 3: 최소 구현 작성**

`lib/supplies.ts`:

```ts
import { addDays, differenceInCalendarDays, parseISO, format } from "date-fns";

export type SupplyCategory = "bathroom" | "kitchen" | "bedroom" | "appliance";

export type SupplyStatus = {
  dueDate: string;
  daysRemaining: number;
  overdue: boolean;
  percent: number;
};

export const SUPPLY_CATEGORIES: { id: SupplyCategory; label: string; color: string }[] = [
  { id: "bathroom", label: "욕실용품", color: "#4a90d9" },
  { id: "kitchen", label: "주방용품", color: "#4caf7d" },
  { id: "bedroom", label: "침실&리빙", color: "#e05a7e" },
  { id: "appliance", label: "가전&설비", color: "#2bb3a3" },
];

function addDaysISO(fromISO: string, days: number): string {
  return format(addDays(parseISO(fromISO), days), "yyyy-MM-dd");
}

function daysBetween(fromISO: string, toISO: string): number {
  return differenceInCalendarDays(parseISO(toISO), parseISO(fromISO));
}

export function computeSupplyStatus(
  lastDoneISO: string,
  cycleDays: number,
  todayISODate: string
): SupplyStatus {
  const dueDate = addDaysISO(lastDoneISO, cycleDays);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  const elapsedDays = cycleDays - daysRemaining;
  const percent = Math.max(0, Math.min(100, Math.round((elapsedDays / cycleDays) * 100)));
  return { dueDate, daysRemaining, overdue: daysRemaining <= 0, percent };
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/supplies.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/supplies.ts lib/supplies.test.ts
git commit -m "feat: add pure supply due-date/status calculation"
```

---

### Task 3: DB 스키마 + 시드 + CRUD (`lib/db.ts` 확장)

**Files:**
- Modify: `lib/db.ts`
- Modify: `lib/db.test.ts`

**Interfaces:**
- Consumes: `SupplyCategory`(Task 2, `./supplies`), `todayISO`(기존 `./chores`)
- Produces:
  - `type SupplyRow = { id: number; category: SupplyCategory; name: string; icon: string; cycle_days: number; last_done_at: string; sort_order: number }`
  - `function getAllSupplies(database: DatabaseSync): SupplyRow[]`
  - `function completeSupplyRow(database: DatabaseSync, id: number, doneDateISO: string): void`
  - `initSchema(database)`가 이제 `supplies` 테이블도 만들고 비어있으면 21개 카탈로그를 시드한다.
  - Task 4(`app/supplies/actions.ts`), Task 6(`page.tsx`), Task 7(`lib/sections.ts`)이 이 함수들을 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/db.test.ts` 맨 위 import를 아래처럼 확장한다 (기존 import에 이어서):

```ts
import {
  initSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
  getDb,
  setDbForTesting,
  getAllSupplies,
  completeSupplyRow,
} from "./db";
import { todayISO } from "./chores";
```

파일 끝(`describe("lib/db file-backed database", ...)` 블록 뒤)에 새 `describe` 블록을 추가한다:

```ts
describe("lib/db supply catalog", () => {
  test("initSchema seeds exactly 21 supply rows spanning all 4 categories, dated today", () => {
    const db = freshDb();
    const rows = getAllSupplies(db);
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.category))).toEqual(
      new Set(["bathroom", "kitchen", "bedroom", "appliance"])
    );
    for (const row of rows) {
      expect(row.last_done_at).toBe(todayISO());
    }
  });

  test("seeding is idempotent - calling initSchema again does not duplicate rows", () => {
    const db = freshDb();
    initSchema(db);
    expect(getAllSupplies(db)).toHaveLength(21);
  });

  test("completeSupplyRow updates last_done_at for the given id", () => {
    const db = freshDb();
    const [first] = getAllSupplies(db);
    completeSupplyRow(db, first.id, "2026-07-01");
    const [updated] = getAllSupplies(db);
    expect(updated.last_done_at).toBe("2026-07-01");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/db.test.ts`
Expected: FAIL with "getAllSupplies is not a function" / "completeSupplyRow is not a function" (아직 구현 없음)

- [ ] **Step 3: 구현 작성**

`lib/db.ts` 상단 import 블록에 한 줄 추가:

```ts
import type { SupplyCategory } from "./supplies";
```

(이미 있는 `import type { IntervalUnit } from "./chores";` 바로 아래에 추가)

`lib/db.ts`에 아래 타입/상수/함수를 추가한다 (`ChoreRow`/`ChoreInput` 타입 정의 바로 아래에):

```ts
export type SupplyRow = {
  id: number;
  category: SupplyCategory;
  name: string;
  icon: string;
  cycle_days: number;
  last_done_at: string;
  sort_order: number;
};

type SupplyCatalogEntry = {
  category: SupplyCategory;
  name: string;
  icon: string;
  cycleDays: number;
};

const SUPPLY_CATALOG: SupplyCatalogEntry[] = [
  { category: "bathroom", name: "칫솔", icon: "🪥", cycleDays: 90 },
  { category: "bathroom", name: "면도기", icon: "🪒", cycleDays: 14 },
  { category: "bathroom", name: "샤워볼", icon: "🧽", cycleDays: 30 },
  { category: "bathroom", name: "수건", icon: "🏖️", cycleDays: 365 },
  { category: "bathroom", name: "변기솔", icon: "🪠", cycleDays: 180 },
  { category: "kitchen", name: "수세미", icon: "🧽", cycleDays: 14 },
  { category: "kitchen", name: "주방스펀지", icon: "🫧", cycleDays: 14 },
  { category: "kitchen", name: "행주", icon: "🧣", cycleDays: 30 },
  { category: "kitchen", name: "고무장갑", icon: "🧤", cycleDays: 60 },
  { category: "kitchen", name: "도마", icon: "🟫", cycleDays: 365 },
  { category: "kitchen", name: "전기포트", icon: "🫖", cycleDays: 730 },
  { category: "bedroom", name: "베개솜", icon: "☁️", cycleDays: 365 },
  { category: "bedroom", name: "베개커버(세탁)", icon: "🧺", cycleDays: 7 },
  { category: "bedroom", name: "이불(세탁)", icon: "🛌", cycleDays: 30 },
  { category: "bedroom", name: "매트리스", icon: "🛏️", cycleDays: 1825 },
  { category: "bedroom", name: "커튼(세탁)", icon: "🧵", cycleDays: 90 },
  { category: "bedroom", name: "향수", icon: "🌸", cycleDays: 730 },
  { category: "appliance", name: "멀티탭", icon: "🔌", cycleDays: 1095 },
  { category: "appliance", name: "공기청정기 필터", icon: "🌬️", cycleDays: 180 },
  { category: "appliance", name: "에어컨 필터", icon: "❄️", cycleDays: 14 },
  { category: "appliance", name: "세탁기 필터", icon: "💦", cycleDays: 90 },
];

function seedSuppliesIfEmpty(database: DatabaseSync): void {
  const { count } = database.prepare("SELECT COUNT(*) as count FROM supplies").get() as {
    count: number;
  };
  if (count > 0) return;
  const today = todayISO();
  const insert = database.prepare(
    "INSERT INTO supplies (category, name, icon, cycle_days, last_done_at, sort_order) VALUES (?, ?, ?, ?, ?, ?)"
  );
  SUPPLY_CATALOG.forEach((entry, index) => {
    insert.run(entry.category, entry.name, entry.icon, entry.cycleDays, today, index);
  });
}
```

`import { todayISO } from "./chores";` 한 줄도 상단에 추가한다 (`import type { IntervalUnit } from "./chores";`와 별개 줄).

`initSchema` 함수 본문 끝에 `supplies` 테이블 생성 + 시드 호출을 추가한다:

```ts
export function initSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month')),
      last_done_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL CHECK (category IN ('bathroom', 'kitchen', 'bedroom', 'appliance')),
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      last_done_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);
  seedSuppliesIfEmpty(database);
}
```

파일 끝(`deleteChoreRow` 함수 뒤)에 조회/완료 함수를 추가한다:

```ts
export function getAllSupplies(database: DatabaseSync): SupplyRow[] {
  return database.prepare("SELECT * FROM supplies ORDER BY sort_order").all() as unknown as SupplyRow[];
}

export function completeSupplyRow(database: DatabaseSync, id: number, doneDateISO: string): void {
  database.prepare("UPDATE supplies SET last_done_at = ? WHERE id = ?").run(doneDateISO, id);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/db.test.ts`
Expected: PASS (기존 chore 테스트 포함 전체 통과)

- [ ] **Step 5: 커밋**

```bash
git add lib/db.ts lib/db.test.ts
git commit -m "feat: add supplies schema, catalog seed, and row CRUD"
```

---

### Task 4: Server Action (`app/supplies/actions.ts`)

**Files:**
- Create: `app/supplies/actions.ts`
- Create: `app/supplies/actions.test.ts`

**Interfaces:**
- Consumes: `getDb`, `completeSupplyRow`, `getAllSupplies`(Task 3, `@/lib/db`)
- Produces: `async function completeSupply(id: number, doneDateISO: string): Promise<void>` — Task 6(`page.tsx`)이 이 함수를 `SupplyGrid`의 `completeAction` prop으로 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/supplies/actions.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getAllSupplies, getDb } from "@/lib/db";
import { completeSupply } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("completeSupply", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("sets last_done_at for the given id", async () => {
    const [first] = getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const updated = getAllSupplies(getDb()).find((r) => r.id === first.id)!;
    expect(updated.last_done_at).toBe("2026-07-01");
  });

  test("does not affect other rows", async () => {
    const [first, second] = getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const untouched = getAllSupplies(getDb()).find((r) => r.id === second.id)!;
    expect(untouched.last_done_at).not.toBe("2026-07-01");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- app/supplies/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'" (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`app/supplies/actions.ts`:

```ts
import { revalidatePath } from "next/cache";
import { getDb, completeSupplyRow } from "@/lib/db";

export async function completeSupply(id: number, doneDateISO: string): Promise<void> {
  "use server";
  completeSupplyRow(getDb(), id, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- app/supplies/actions.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/supplies/actions.ts app/supplies/actions.test.ts
git commit -m "feat: add supplies completeSupply Server Action"
```

---

### Task 5: 그리드 컴포넌트 (`app/supplies/supply-grid.tsx`)

**Files:**
- Create: `app/supplies/supply-grid.tsx`
- Create: `app/supplies/supply-grid.test.tsx`

**Interfaces:**
- Consumes: `SUPPLY_CATEGORIES`, `SupplyCategory`, `SupplyStatus`(Task 2, `@/lib/supplies`), `todayISO`(기존 `@/lib/chores`)
- Produces:
  - `type SupplyViewModel = { id: number; category: SupplyCategory; name: string; icon: string; status: SupplyStatus }`
  - `function SupplyGrid(props: { supplies: SupplyViewModel[]; completeAction: (id: number, doneDateISO: string) => Promise<void> }): JSX.Element`
  - Task 6(`page.tsx`)이 `SupplyViewModel`과 `SupplyGrid`를 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/supplies/supply-grid.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupplyGrid, type SupplyViewModel } from "./supply-grid";

const baseSupplies: SupplyViewModel[] = [
  {
    id: 1,
    category: "bathroom",
    name: "칫솔",
    icon: "🪥",
    status: { dueDate: "2026-07-30", daysRemaining: 3, overdue: false, percent: 57 },
  },
  {
    id: 2,
    category: "kitchen",
    name: "고무장갑",
    icon: "🧤",
    status: { dueDate: "2026-07-20", daysRemaining: -7, overdue: true, percent: 100 },
  },
];

describe("SupplyGrid rendering", () => {
  test("renders every supply's name, icon, and D-day label under its own category column", () => {
    render(<SupplyGrid supplies={baseSupplies} completeAction={vi.fn()} />);
    expect(screen.getByText("욕실용품")).toBeDefined();
    expect(screen.getByText("주방용품")).toBeDefined();
    expect(screen.getByText("칫솔")).toBeDefined();
    expect(screen.getByText("🪥")).toBeDefined();
    expect(screen.getByText("D-3")).toBeDefined();
    expect(screen.getByText("고무장갑")).toBeDefined();
    expect(screen.getByText("D+7")).toBeDefined();
  });

  test("shows an overdue badge only for overdue supplies", () => {
    render(<SupplyGrid supplies={baseSupplies} completeAction={vi.fn()} />);
    const cards = screen.getAllByRole("button", { name: /완료 처리/ });
    expect(cards[0].textContent).not.toContain("!");
    expect(cards[1].textContent).toContain("!");
  });
});

describe("SupplyGrid complete flow", () => {
  test("clicking a card opens a confirm toast, and confirming calls completeAction with the card's id", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn().mockResolvedValue(undefined);
    render(<SupplyGrid supplies={baseSupplies} completeAction={completeAction} />);

    await user.click(screen.getByRole("button", { name: "칫솔 완료 처리" }));
    expect(screen.getByText("칫솔 교체(관리) 완료로 표시할까요?")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "완료로 표시" }));
    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(completeAction.mock.calls[0][0]).toBe(1);
    expect(typeof completeAction.mock.calls[0][1]).toBe("string");
  });

  test("clicking cancel in the toast calls nothing", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn();
    render(<SupplyGrid supplies={baseSupplies} completeAction={completeAction} />);

    await user.click(screen.getByRole("button", { name: "칫솔 완료 처리" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(completeAction).not.toHaveBeenCalled();
    expect(screen.queryByText("칫솔 교체(관리) 완료로 표시할까요?")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- app/supplies/supply-grid.test.tsx`
Expected: FAIL with "Cannot find module './supply-grid'" (파일이 아직 없음)

- [ ] **Step 3: 구현 작성**

`app/supplies/supply-grid.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SUPPLY_CATEGORIES, type SupplyCategory, type SupplyStatus } from "@/lib/supplies";
import { todayISO } from "@/lib/chores";

export type SupplyViewModel = {
  id: number;
  category: SupplyCategory;
  name: string;
  icon: string;
  status: SupplyStatus;
};

type Props = {
  supplies: SupplyViewModel[];
  completeAction: (id: number, doneDateISO: string) => Promise<void>;
};

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function SupplyGrid({ supplies, completeAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const completingSupply = supplies.find((s) => s.id === completingId) ?? null;

  function openCompleteToast(supply: SupplyViewModel) {
    setCompletingId(supply.id);
    setDoneDate(todayISO());
    setCompleteError(null);
  }

  function closeToast() {
    setCompletingId(null);
    setCompleteError(null);
  }

  async function confirmComplete() {
    if (completingId === null || isCompleting) return;
    setIsCompleting(true);
    try {
      await completeAction(completingId, doneDate);
      setCompletingId(null);
      setCompleteError(null);
    } catch {
      setCompleteError("완료 처리에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {SUPPLY_CATEGORIES.map((category) => (
          <section
            key={category.id}
            className="flex-1 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-zinc-900"
          >
            <h2
              className="p-2 text-center text-sm font-bold text-white"
              style={{ background: category.color }}
            >
              {category.label}
            </h2>
            <ul className="grid grid-cols-2 gap-2 p-2">
              {supplies
                .filter((s) => s.category === category.id)
                .map((supply) => (
                  <li key={supply.id}>
                    <button
                      type="button"
                      aria-label={`${supply.name} 완료 처리`}
                      onClick={() => openCompleteToast(supply)}
                      className="relative flex w-full flex-col items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800"
                    >
                      {supply.status.overdue && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                          !
                        </span>
                      )}
                      <span className="text-2xl">{supply.icon}</span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                        {supply.name}
                      </span>
                      <span className="flex w-full items-center gap-1">
                        <span className="text-[9px] text-zinc-500">
                          {dayLabel(supply.status.daysRemaining)}
                        </span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${supply.status.percent}%`,
                              background: progressColor(supply.status.percent, supply.status.overdue),
                            }}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>

      {completingSupply && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingSupply.name} 교체(관리) 완료로 표시할까요?</p>
          {completeError && <p className="text-sm text-red-400">{completeError}</p>}
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
            <button type="button" onClick={closeToast} disabled={isCompleting}>
              취소
            </button>
            <button
              type="button"
              onClick={confirmComplete}
              disabled={isCompleting}
              className="font-semibold text-blue-400 disabled:opacity-50"
            >
              완료로 표시
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- app/supplies/supply-grid.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add app/supplies/supply-grid.tsx app/supplies/supply-grid.test.tsx
git commit -m "feat: add supply category-column grid with complete-toast flow"
```

---

### Task 6: 페이지 배선 (`app/supplies/page.tsx`)

**Files:**
- Create: `app/supplies/page.tsx`

**Interfaces:**
- Consumes: `getDb`, `getAllSupplies`(Task 3), `computeSupplyStatus`(Task 2), `todayISO`(기존 `@/lib/chores`), `SupplyGrid`/`SupplyViewModel`(Task 5), `completeSupply`(Task 4)
- Produces: `/supplies` 라우트가 실제로 렌더링됨. 별도 유닛 테스트는 두지 않는다 (`/cleaning`의 `page.tsx`도 동일하게 얇은 배선 코드라 전용 테스트가 없음 — 수동 확인으로 대체).

- [ ] **Step 1: 구현 작성**

`app/supplies/page.tsx`:

```tsx
import { getDb, getAllSupplies } from "@/lib/db";
import { computeSupplyStatus } from "@/lib/supplies";
import { todayISO } from "@/lib/chores";
import { SupplyGrid, type SupplyViewModel } from "./supply-grid";
import { completeSupply } from "./actions";

// Same reasoning as /cleaning: due-date status depends on today's date and a
// mutable local sqlite file, so caching this page would freeze badges/progress
// at build time.
export const dynamic = "force-dynamic";

export default function SuppliesPage() {
  const today = todayISO();
  const rows = getAllSupplies(getDb());

  const supplies: SupplyViewModel[] = rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    icon: row.icon,
    status: computeSupplyStatus(row.last_done_at, row.cycle_days, today),
  }));

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-2xl p-4">
        <h1 className="mb-4 text-xl font-bold">생필품 관리</h1>
        <SupplyGrid supplies={supplies} completeAction={completeSupply} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 타입체크 + 전체 테스트 실행**

Run: `npm test`
Expected: PASS (모든 기존 + 신규 테스트)

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add app/supplies/page.tsx
git commit -m "feat: wire /supplies page"
```

---

### Task 7: 홈 셸 상태 연동 (`lib/sections.ts`)

**Files:**
- Modify: `lib/sections.ts`
- Modify: `lib/sections.test.ts`

**Interfaces:**
- Consumes: `getAllSupplies`, `completeSupplyRow`(Task 3, `./db`), `computeSupplyStatus`(Task 2, `./supplies`)
- Produces: 홈 화면(`/`)의 "생필품 관리" 행이 실제 밀린 개수를 보여준다.

- [ ] **Step 1: 실패하는 테스트로 기존 기대값을 갱신한다**

`lib/sections.test.ts` 전체를 아래 내용으로 교체한다:

```ts
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  setDbForTesting,
  initSchema,
  insertChore,
  getDb,
  getAllSupplies,
  completeSupplyRow,
} from "./db";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["cleaning", "supplies", "emotion-cards", "portfolio"]);
    expect(SECTIONS.map((s) => s.href)).toEqual(["/cleaning", "/supplies", "/emotion-cards", "/portfolio"]);
  });

  test("emotion-cards/portfolio still default to not ready", () => {
    const notYetPorted = SECTIONS.filter((s) => s.id === "emotion-cards" || s.id === "portfolio");
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/sections.test.ts`
Expected: FAIL — "supplies section status" 블록의 두 테스트가 실패한다(`getStatus()`가 아직 `{ ready: false }`를 반환하므로 `{ ready: true, ... }` 기대값과 불일치).

- [ ] **Step 3: 구현 작성**

`lib/sections.ts`의 import 블록을 아래로 교체한다:

```ts
import { getDb, getAllChores, getAllSupplies } from "./db";
import { computeChoreStatus, todayISO } from "./chores";
import { computeSupplyStatus } from "./supplies";
```

`supplies` 섹션 정의를 아래로 교체한다:

```ts
  {
    id: "supplies",
    name: "생필품 관리",
    icon: "🧴",
    href: "/supplies",
    getStatus: () => {
      const today = todayISO();
      const overdueCount = getAllSupplies(getDb()).filter(
        (row) => computeSupplyStatus(row.last_done_at, row.cycle_days, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/sections.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/sections.ts lib/sections.test.ts
git commit -m "feat: wire /supplies Server Actions and real home-shell status"
```

---

### Task 8: 전체 테스트 + 수동 확인

**Files:** 없음 (검증 전용 태스크)

- [ ] **Step 1: 전체 테스트 스위트 + 타입체크 + 린트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS

Run: `npx tsc --noEmit`
Expected: 에러 없음

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 2: 개발 서버로 수동 확인**

Run: `npm run dev`

브라우저에서 다음을 확인한다 (스펙의 테스트 방침에 명시된 수동 QA 체크리스트):

1. `/`에서 "생필품 관리" 행이 "준비중"이 아니라 실제 상태("전부 완료" 등)를 보여주는지
2. `/supplies`에서 4개 카테고리 컬럼(욕실용품/주방용품/침실&리빙/가전&설비)이 각자의 색상 헤더와 함께 표시되는지
3. 항목 카드 클릭 → 하단 토스트 → 완료 처리 → 배지/진행률이 즉시 갱신되는지
4. 완료 처리 후 홈 화면(`/`)의 "생필품 관리" 배지 숫자도 갱신되는지
5. 라이트/다크 테마 양쪽에서 카드/컬럼 배경이 깨지지 않는지

문제가 없으면 이 태스크는 커밋할 코드 변경이 없으므로 커밋하지 않는다.
