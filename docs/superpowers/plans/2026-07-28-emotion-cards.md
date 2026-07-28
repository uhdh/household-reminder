# 감정카드(`/emotion-cards`) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/superpowers/specs/2026-07-28-emotion-cards-design.md`에서 승인된 설계대로, `/emotion-cards` 아래 5개 라우트(오늘 상태/선택/결과/히스토리/히스토리 상세)를 구현하고, 그 기반으로 `lib/db.ts`를 도메인별로 분리한다.

**Architecture:** 1단계로 기존 `lib/db.ts`(청소+생필품 혼재)를 연결 전용 `lib/db.ts` + `lib/chores-db.ts` + `lib/supplies-db.ts`로 순수 리팩터(동작 변경 없음)한 뒤, 2단계로 그 위에 `lib/emotions.ts`(정적 카탈로그) + `lib/emotion-cards-db.ts`(신규 테이블) + Server Actions + Server/Client Component를 얹는다. `/cleaning`, `/supplies`와 동일한 계층 구조를 따른다.

**Tech Stack:** Next.js 16(App Router, `params`/`searchParams`는 Promise), Server Actions, `node:sqlite`(`DatabaseSync`), `date-fns`(+ `date-fns/locale`의 `ko`), React 19, Vitest + React Testing Library.

## Global Constraints

- 배우자 공유 기능은 만들지 않는다 — 단일 기록 스트림.
- `framer-motion`/`shadcn`/`@base-ui/react`/`lucide-react`는 쓰지 않는다 — 애니메이션은 Tailwind `transition-*` 클래스로 재구현.
- 페이지 전체 배경/텍스트/다크모드는 우리집의 zinc 팔레트 관례(`bg-zinc-50 dark:bg-black` 등)를 따르고, 감정별 6색 팔레트(`COLORS`)는 카드 배경/테두리/글자색에만 쓴다.
- `emotion_records`는 하루당 정확히 3행(`position` 1~3), 재저장 시 그 날짜의 기존 행을 지우고 새로 3행을 넣는 "전체 교체" 방식.
- `custom_emotions`는 이름이 유니크, 이모지는 항상 `💭`, 색상은 항상 `purple`.
- `lib/db.ts` 분리 리팩터는 **동작을 바꾸지 않는다** — 리팩터 직후 기존 청소/생필품 테스트가 그대로 통과해야 한다(회귀 없음이 유일한 성공 기준).
- e2e/브라우저 자동화 테스트는 만들지 않는다(YAGNI) — 구현 후 수동 확인으로 대체.

---

### Task 1: `lib/db.ts` 분리 리팩터 (동작 변경 없음)

**Files:**
- Create: `lib/chores-db.ts`
- Create: `lib/supplies-db.ts`
- Modify: `lib/db.ts` (연결 전용으로 축소)
- Create: `lib/chores-db.test.ts` (기존 `lib/db.test.ts`의 chore CRUD 테스트 이동)
- Create: `lib/supplies-db.test.ts` (기존 `lib/db.test.ts`의 supply catalog 테스트 이동)
- Modify: `lib/db.test.ts` (file-backed 테스트만 남기고, `initSchema` 조합 테스트 추가)
- Modify: `app/cleaning/page.tsx:1`, `app/cleaning/actions.ts:1-9`, `app/cleaning/actions.test.ts:3`
- Modify: `app/supplies/page.tsx:1`, `app/supplies/actions.ts:1-2`, `app/supplies/actions.test.ts:3`
- Modify: `lib/sections.ts:1`, `lib/sections.test.ts:1-11`

**Interfaces:**
- Consumes: 없음 (순수 파일 이동)
- Produces: `lib/chores-db.ts`가 `ChoreRow`, `ChoreInput`, `initChoresSchema(db)`, `getAllChores(db)`, `insertChore(db, input)`, `updateChoreRow(db, id, input)`, `completeChoreRow(db, id, doneDateISO)`, `deleteChoreRow(db, id)`를 내보낸다. `lib/supplies-db.ts`가 `SupplyRow`, `initSuppliesSchema(db)`, `getAllSupplies(db)`, `completeSupplyRow(db, id, doneDateISO)`를 내보낸다. `lib/db.ts`는 `getDb()`, `setDbForTesting(db)`, `initSchema(db)`(두 스키마를 순서대로 호출)만 남긴다. Task 3이 `lib/db.ts`의 `initSchema`에 세 번째 호출을 추가한다.

- [ ] **Step 1: `lib/chores-db.ts` 생성**

```ts
import { DatabaseSync } from "node:sqlite";
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

export function initChoresSchema(database: DatabaseSync): void {
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

- [ ] **Step 2: `lib/supplies-db.ts` 생성**

```ts
import { DatabaseSync } from "node:sqlite";
import type { SupplyCategory } from "./supplies";
import { todayISO } from "./chores";

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

export function initSuppliesSchema(database: DatabaseSync): void {
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

export function getAllSupplies(database: DatabaseSync): SupplyRow[] {
  return database.prepare("SELECT * FROM supplies ORDER BY sort_order").all() as unknown as SupplyRow[];
}

export function completeSupplyRow(database: DatabaseSync, id: number, doneDateISO: string): void {
  database.prepare("UPDATE supplies SET last_done_at = ? WHERE id = ?").run(doneDateISO, id);
}
```

- [ ] **Step 3: `lib/db.ts`를 연결 전용으로 축소**

전체 내용을 아래로 교체:

```ts
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { initChoresSchema } from "./chores-db";
import { initSuppliesSchema } from "./supplies-db";

function resolveDbPath(): string {
  return process.env.APP_DB_PATH ?? path.join(process.cwd(), "data", "db.sqlite");
}

let dbInstance: DatabaseSync | null = null;
let testOverride: DatabaseSync | null = null;

export function initSchema(database: DatabaseSync): void {
  initChoresSchema(database);
  initSuppliesSchema(database);
}

export function getDb(): DatabaseSync {
  if (testOverride) return testOverride;
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    dbInstance = new DatabaseSync(dbPath);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function setDbForTesting(database: DatabaseSync | null): void {
  testOverride = database;
}
```

- [ ] **Step 4: 테스트 파일 분리**

`lib/chores-db.test.ts` 생성:

```ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  initChoresSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
} from "./chores-db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initChoresSchema(db);
  return db;
}

describe("lib/chores-db CRUD", () => {
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

`lib/supplies-db.test.ts` 생성:

```ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import { initSuppliesSchema, getAllSupplies, completeSupplyRow } from "./supplies-db";
import { todayISO } from "./chores";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initSuppliesSchema(db);
  return db;
}

describe("lib/supplies-db catalog", () => {
  test("initSuppliesSchema seeds exactly 21 supply rows spanning all 4 categories, dated today", () => {
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

  test("seeding is idempotent - calling initSuppliesSchema again does not duplicate rows", () => {
    const db = freshDb();
    initSuppliesSchema(db);
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

`lib/db.test.ts` 전체 내용을 아래로 교체 (file-backed 테스트는 그대로 유지, chore/supply CRUD 테스트는 제거하고 `initSchema` 조합 테스트로 대체):

```ts
import { DatabaseSync } from "node:sqlite";
import { rmSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, afterEach } from "vitest";
import { initSchema, getDb, setDbForTesting } from "./db";
import { getAllChores } from "./chores-db";
import { getAllSupplies } from "./supplies-db";

describe("initSchema", () => {
  test("creates both the chores and supplies tables in one call", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    expect(getAllChores(db)).toEqual([]);
    expect(getAllSupplies(db)).toHaveLength(21);
  });
});

describe("lib/db file-backed database", () => {
  let tempDir: string | null = null;
  let openedDb: DatabaseSync | null = null;

  afterEach(() => {
    // Always restore clean state, even if an assertion above failed.
    // Close the sqlite connection first — on Windows the file handle stays
    // locked until closed, which would make rmSync below fail with EPERM.
    if (openedDb) {
      openedDb.close();
      openedDb = null;
    }
    delete process.env.APP_DB_PATH;
    setDbForTesting(null);
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDir = null;
  });

  test("getDb() creates data directory and file-backed database without throwing", () => {
    // Point at a throwaway temp directory — never the project's real data/
    // directory, which holds the actual persistent db.sqlite.
    tempDir = path.join(os.tmpdir(), `cleaning-db-test-${Date.now()}`);
    const dbFile = path.join(tempDir, "db.sqlite");
    process.env.APP_DB_PATH = dbFile;

    // Reset test override to allow the real getDb() to work
    setDbForTesting(null);

    // Call the real getDb() - should create directory and open database
    const db = getDb();
    openedDb = db;
    expect(db).toBeDefined();

    // Verify it works
    const rows = getAllChores(db);
    expect(rows).toHaveLength(0);

    // Verify the file was created
    expect(existsSync(dbFile)).toBe(true);
  });
});
```

- [ ] **Step 5: 소비자 파일들의 import 경로 갱신**

`app/cleaning/page.tsx` 1번째 줄 `import { getDb, getAllChores } from "@/lib/db";`를:

```ts
import { getDb } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
```

`app/cleaning/actions.ts` 상단 import 블록(`getDb, insertChore, updateChoreRow, completeChoreRow, deleteChoreRow, type ChoreInput`를 `@/lib/db`에서 가져오던 부분)을:

```ts
import { getDb } from "@/lib/db";
import {
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
  type ChoreInput,
} from "@/lib/chores-db";
```

`app/cleaning/actions.test.ts` 3번째 줄 `import { initSchema, setDbForTesting, getAllChores, getDb } from "@/lib/db";`를:

```ts
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
```

`app/supplies/page.tsx` 1번째 줄 `import { getDb, getAllSupplies } from "@/lib/db";`를:

```ts
import { getDb } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
```

`app/supplies/actions.ts` 2번째 줄 `import { getDb, completeSupplyRow } from "@/lib/db";`를:

```ts
import { getDb } from "@/lib/db";
import { completeSupplyRow } from "@/lib/supplies-db";
```

`app/supplies/actions.test.ts` 3번째 줄 `import { initSchema, setDbForTesting, getAllSupplies, getDb } from "@/lib/db";`를:

```ts
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
```

`lib/sections.ts` 1번째 줄 `import { getDb, getAllChores, getAllSupplies } from "./db";`를:

```ts
import { getDb } from "./db";
import { getAllChores } from "./chores-db";
import { getAllSupplies } from "./supplies-db";
```

`lib/sections.test.ts` 3~10번째 줄의 `./db` import 블록을:

```ts
import { setDbForTesting, initSchema, getDb } from "./db";
import { insertChore } from "./chores-db";
import { getAllSupplies, completeSupplyRow } from "./supplies-db";
```

- [ ] **Step 6: 전체 테스트 실행 — 회귀 없음 확인**

Run: `npm test`
Expected: 모든 테스트 PASS (기존 54개가 이동/재구성되어 55개가 됨 — `lib/db.test.ts`에 `initSchema` 조합 테스트 1개가 새로 추가됨). 실패가 하나라도 있으면 import 경로 오탈자를 의심할 것.

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 7: 커밋**

```bash
git add lib/db.ts lib/chores-db.ts lib/supplies-db.ts lib/db.test.ts lib/chores-db.test.ts lib/supplies-db.test.ts app/cleaning/page.tsx app/cleaning/actions.ts app/cleaning/actions.test.ts app/supplies/page.tsx app/supplies/actions.ts app/supplies/actions.test.ts lib/sections.ts lib/sections.test.ts
git commit -m "refactor: split lib/db.ts into per-domain chores-db/supplies-db modules"
```

---

### Task 2: 감정 카탈로그 (`lib/emotions.ts`)

**Files:**
- Create: `lib/emotions.ts`
- Create: `lib/emotions.test.ts`

**Interfaces:**
- Consumes: 없음 (leaf 모듈)
- Produces: `type EmotionColor = "green" | "pink" | "blue" | "red" | "yellow" | "purple"`, `interface Emotion { name: string; emoji: string; color: EmotionColor }`, `const EMOTIONS: Emotion[]`(37개), `const COLORS: Record<EmotionColor, { bg: string; border: string; text: string }>`, `const DEFINITIONS: Record<string, string>`. Task 3~6이 `Emotion`/`EmotionColor`/`COLORS`/`DEFINITIONS`/`EMOTIONS`를 이 파일에서 직접 가져다 쓰고, Task 7~9는 Task 3~6이 만든 컴포넌트/함수를 통해 간접적으로 의존한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
import { describe, expect, test } from "vitest";
import { EMOTIONS, DEFINITIONS } from "./emotions";

describe("EMOTIONS catalog", () => {
  test("has 37 preset emotions with no duplicate names, each with a definition", () => {
    expect(EMOTIONS).toHaveLength(37);
    const names = new Set(EMOTIONS.map((e) => e.name));
    expect(names.size).toBe(37);
    for (const emotion of EMOTIONS) {
      expect(DEFINITIONS[emotion.name]).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/emotions.test.ts`
Expected: FAIL with "Cannot find module './emotions'"

- [ ] **Step 3: 최소 구현 작성**

```ts
export type EmotionColor = "green" | "pink" | "blue" | "red" | "yellow" | "purple";

export interface Emotion {
  name: string;
  emoji: string;
  color: EmotionColor;
}

export const EMOTIONS: Emotion[] = [
  // 행복 (Green)
  { name: "행복", emoji: "😊", color: "green" },
  { name: "기쁨", emoji: "😄", color: "green" },
  { name: "감사", emoji: "🙏", color: "green" },
  { name: "편안함", emoji: "😌", color: "green" },
  { name: "희망", emoji: "🌱", color: "green" },
  { name: "자신감", emoji: "😎", color: "green" },
  { name: "뿌듯함", emoji: "😁", color: "green" },
  { name: "만족", emoji: "☺️", color: "green" },

  // 사랑 (Pink)
  { name: "사랑", emoji: "🥰", color: "pink" },
  { name: "설렘", emoji: "🤩", color: "pink" },
  { name: "존중", emoji: "🤝", color: "pink" },
  { name: "자랑스러움", emoji: "🥹", color: "pink" },

  // 슬픔 (Blue)
  { name: "슬픔", emoji: "😢", color: "blue" },
  { name: "외로움", emoji: "🥺", color: "blue" },
  { name: "서운함", emoji: "😞", color: "blue" },
  { name: "속상함", emoji: "😔", color: "blue" },
  { name: "그리움", emoji: "🫶", color: "blue" },
  { name: "우울", emoji: "😭", color: "blue" },

  // 분노 (Red)
  { name: "화남", emoji: "😡", color: "red" },
  { name: "짜증", emoji: "😤", color: "red" },
  { name: "분노", emoji: "🤬", color: "red" },
  { name: "억울함", emoji: "🫤", color: "red" },
  { name: "답답함", emoji: "😣", color: "red" },

  // 불안 (Yellow)
  { name: "불안", emoji: "😰", color: "yellow" },
  { name: "걱정", emoji: "😟", color: "yellow" },
  { name: "긴장", emoji: "😬", color: "yellow" },
  { name: "두려움", emoji: "😨", color: "yellow" },
  { name: "부담", emoji: "🫢", color: "yellow" },

  // 중립 (Purple)
  { name: "피곤함", emoji: "😴", color: "purple" },
  { name: "멍함", emoji: "😶", color: "purple" },
  { name: "혼란", emoji: "😵‍💫", color: "purple" },
  { name: "고민", emoji: "🤔", color: "purple" },
  { name: "집중", emoji: "🧐", color: "purple" },
  { name: "놀람", emoji: "😲", color: "purple" },
  { name: "심심함", emoji: "🥱", color: "purple" },
  { name: "무기력", emoji: "🫠", color: "purple" },
  { name: "담담함", emoji: "😐", color: "purple" },
];

export const COLORS: Record<EmotionColor, { bg: string; border: string; text: string }> = {
  green: { bg: "#E8F1EA", border: "#8FB89D", text: "#3F6B4C" },
  pink: { bg: "#FCE9F1", border: "#E38FBC", text: "#A03D72" },
  blue: { bg: "#E9F1F7", border: "#8FB0D1", text: "#3F5F7C" },
  red: { bg: "#FCEAE0", border: "#DE8A63", text: "#95452A" },
  yellow: { bg: "#FBF3E1", border: "#DDB463", text: "#8C6A2C" },
  purple: { bg: "#F0EBF3", border: "#B29CC0", text: "#6B4F7A" },
};

export const DEFINITIONS: Record<string, string> = {
  행복: "지금 이 순간이 즐겁고 좋게 느껴지는 마음",
  기쁨: "원하던 일이 이루어져 마음이 환해지는 느낌",
  감사: "누군가 또는 무언가가 고맙게 느껴지는 마음",
  편안함: "몸과 마음이 느긋하고 안정된 상태",
  희망: "앞으로 좋아질 거라는 기대가 차오르는 마음",
  자신감: "내 힘으로 잘 해낼 수 있다고 느끼는 마음",
  뿌듯함: "스스로 해낸 일에 만족스럽고 흐뭇한 느낌",
  만족: "지금 가진 것으로 충분하다고 느끼는 마음",
  사랑: "누군가를 향한 다정하고 애틋한 마음",
  설렘: "기대와 두근거림이 함께 차오르는 마음",
  존중: "상대를 있는 그대로 소중히 여기는 마음",
  자랑스러움: "누군가 혹은 나 자신이 대견하게 느껴지는 마음",
  슬픔: "마음이 무겁고 눈물이 날 것 같은 느낌",
  외로움: "쓸쓸하거나 혼자 있는 느낌",
  서운함: "기대한 만큼 되지 않아 섭섭한 마음",
  속상함: "일이 마음처럼 되지 않아 마음이 상한 느낌",
  그리움: "누군가 또는 무언가가 보고 싶은 마음",
  우울: "기운이 없고 마음이 가라앉는 느낌",
  화남: "무언가에 욱하고 치미는 마음",
  짜증: "사소한 일에도 신경이 곤두서는 느낌",
  분노: "속에서 크게 끓어오르는 강한 화",
  억울함: "부당하게 느껴져 답답하고 속상한 마음",
  답답함: "속이 꽉 막힌 듯 갑갑한 느낌",
  불안: "마음이 조마조마하고 진정되지 않는 느낌",
  걱정: "일이 잘못될까 봐 마음이 쓰이는 상태",
  긴장: "몸과 마음이 잔뜩 곤두서 있는 느낌",
  두려움: "무섭거나 겁이 나는 마음",
  부담: "짊어진 무게가 무겁게 느껴지는 마음",
  피곤함: "몸과 마음의 기운이 다 빠진 상태",
  멍함: "생각이 잠시 멈춘 듯 텅 빈 느낌",
  혼란: "생각이 뒤엉켜 정리가 안 되는 상태",
  고민: "어떻게 해야 할지 계속 생각하게 되는 마음",
  집중: "한 가지에 마음이 온전히 쏠려 있는 상태",
  놀람: "예상치 못한 일에 마음이 덜컥하는 느낌",
  심심함: "딱히 할 일이 없어 무료한 느낌",
  무기력: "아무것도 하고 싶지 않은 축 처진 마음",
  담담함: "동요 없이 잔잔하게 가라앉아 있는 마음",
};
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/emotions.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/emotions.ts lib/emotions.test.ts
git commit -m "feat: add emotion catalog (37 presets, colors, definitions)"
```

---

### Task 3: 감정카드 DB 스키마 + CRUD (`lib/emotion-cards-db.ts`)

**Files:**
- Create: `lib/emotion-cards-db.ts`
- Create: `lib/emotion-cards-db.test.ts`
- Modify: `lib/db.ts` (`initSchema`에 세 번째 호출 추가)

**Interfaces:**
- Consumes: `Emotion`, `EmotionColor`(Task 2, `./emotions`)
- Produces: `initEmotionCardsSchema(db)`, `getCustomEmotions(db): Emotion[]`, `insertCustomEmotion(db, name: string, existing: Emotion[]): Emotion`, `getRecord(db, date: string): Emotion[] | undefined`, `saveRecord(db, date: string, emotions: Emotion[]): void`, `getAllRecordsDesc(db): { date: string; cards: Emotion[] }[]`. Task 4(Server Actions), Task 7/8(페이지), Task 9(`lib/sections.ts`)가 이 함수들을 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/emotion-cards-db.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { describe, expect, test } from "vitest";
import {
  initEmotionCardsSchema,
  getCustomEmotions,
  insertCustomEmotion,
  getRecord,
  saveRecord,
  getAllRecordsDesc,
} from "./emotion-cards-db";

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  initEmotionCardsSchema(db);
  return db;
}

describe("custom emotions", () => {
  test("insertCustomEmotion adds a new emotion with default emoji/color", () => {
    const db = freshDb();
    const emotion = insertCustomEmotion(db, "허탈함", []);
    expect(emotion).toEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(getCustomEmotions(db)).toEqual([emotion]);
  });

  test("insertCustomEmotion returns the existing match instead of duplicating", () => {
    const db = freshDb();
    const existing = [{ name: "행복", emoji: "😊", color: "green" as const }];
    const emotion = insertCustomEmotion(db, "행복", existing);
    expect(emotion).toEqual(existing[0]);
    expect(getCustomEmotions(db)).toHaveLength(0);
  });
});

describe("emotion records", () => {
  const cards = [
    { name: "행복", emoji: "😊", color: "green" as const },
    { name: "슬픔", emoji: "😢", color: "blue" as const },
    { name: "화남", emoji: "😡", color: "red" as const },
  ];

  test("getRecord returns undefined when nothing is saved for the date", () => {
    const db = freshDb();
    expect(getRecord(db, "2026-07-28")).toBeUndefined();
  });

  test("saveRecord then getRecord round-trips the 3 cards in order", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-28", cards);
    expect(getRecord(db, "2026-07-28")).toEqual(cards);
  });

  test("saveRecord replaces the previous 3 rows for the same date, not append", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-28", cards);
    const replacement = [
      { name: "걱정", emoji: "😟", color: "yellow" as const },
      { name: "고민", emoji: "🤔", color: "purple" as const },
      { name: "놀람", emoji: "😲", color: "purple" as const },
    ];
    saveRecord(db, "2026-07-28", replacement);
    expect(getRecord(db, "2026-07-28")).toEqual(replacement);
  });

  test("getAllRecordsDesc groups rows by date, most recent first", () => {
    const db = freshDb();
    saveRecord(db, "2026-07-01", cards);
    saveRecord(db, "2026-07-28", cards);
    const records = getAllRecordsDesc(db);
    expect(records.map((r) => r.date)).toEqual(["2026-07-28", "2026-07-01"]);
    expect(records[0].cards).toEqual(cards);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/emotion-cards-db.test.ts`
Expected: FAIL with "Cannot find module './emotion-cards-db'"

- [ ] **Step 3: 구현 작성**

`lib/emotion-cards-db.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import type { Emotion, EmotionColor } from "./emotions";

export function initEmotionCardsSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_emotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL CHECK (color IN ('green','pink','blue','red','yellow','purple')),
      created_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS emotion_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(date, position)
    )
  `);
}

export function getCustomEmotions(database: DatabaseSync): Emotion[] {
  return database
    .prepare("SELECT name, emoji, color FROM custom_emotions ORDER BY id")
    .all() as unknown as Emotion[];
}

export function insertCustomEmotion(database: DatabaseSync, name: string, existing: Emotion[]): Emotion {
  const found = existing.find((e) => e.name === name);
  if (found) return found;

  const emotion: Emotion = { name, emoji: "💭", color: "purple" };
  const createdAt = new Date().toISOString();
  database
    .prepare("INSERT INTO custom_emotions (name, emoji, color, created_at) VALUES (?, ?, ?, ?)")
    .run(emotion.name, emotion.emoji, emotion.color, createdAt);
  return emotion;
}

export function getRecord(database: DatabaseSync, date: string): Emotion[] | undefined {
  const rows = database
    .prepare("SELECT name, emoji, color FROM emotion_records WHERE date = ? ORDER BY position")
    .all(date) as unknown as Emotion[];
  return rows.length === 3 ? rows : undefined;
}

export function saveRecord(database: DatabaseSync, date: string, emotions: Emotion[]): void {
  database.prepare("DELETE FROM emotion_records WHERE date = ?").run(date);
  const insert = database.prepare(
    "INSERT INTO emotion_records (date, position, name, emoji, color) VALUES (?, ?, ?, ?, ?)"
  );
  emotions.forEach((emotion, index) => {
    insert.run(date, index + 1, emotion.name, emotion.emoji, emotion.color);
  });
}

export function getAllRecordsDesc(database: DatabaseSync): { date: string; cards: Emotion[] }[] {
  const rows = database
    .prepare("SELECT date, position, name, emoji, color FROM emotion_records ORDER BY date DESC, position ASC")
    .all() as unknown as { date: string; position: number; name: string; emoji: string; color: EmotionColor }[];

  const byDate = new Map<string, Emotion[]>();
  for (const row of rows) {
    const cards = byDate.get(row.date) ?? [];
    cards.push({ name: row.name, emoji: row.emoji, color: row.color });
    byDate.set(row.date, cards);
  }
  return Array.from(byDate.entries()).map(([date, cards]) => ({ date, cards }));
}
```

`lib/db.ts`를 두 군데만 수정한다 (Task 1에서 만든 `initChoresSchema`/`initSuppliesSchema` import는 그대로 두고 건드리지 않는다):

1. 기존 `import { initSuppliesSchema } from "./supplies-db";` 줄 바로 아래에 한 줄 추가:

```ts
import { initEmotionCardsSchema } from "./emotion-cards-db";
```

2. 기존 `initSchema` 함수 본문(`initChoresSchema(database); initSuppliesSchema(database);`) 끝에 한 줄 추가:

```ts
export function initSchema(database: DatabaseSync): void {
  initChoresSchema(database);
  initSuppliesSchema(database);
  initEmotionCardsSchema(database);
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/emotion-cards-db.test.ts`
Expected: PASS

Run: `npm test`
Expected: 전체 PASS (Task 1 이후 55개 + Task 2에서 추가된 1개 + 이번 태스크에서 추가되는 6개 = 62개)

- [ ] **Step 5: 커밋**

```bash
git add lib/emotion-cards-db.ts lib/emotion-cards-db.test.ts lib/db.ts
git commit -m "feat: add custom-emotion and emotion-record DB schema/CRUD"
```

---

### Task 4: Server Actions (`app/emotion-cards/actions.ts`)

**Files:**
- Create: `app/emotion-cards/actions.ts`
- Create: `app/emotion-cards/actions.test.ts`

**Interfaces:**
- Consumes: `getDb`(`@/lib/db`), `EMOTIONS`/`Emotion`(Task 2, `@/lib/emotions`), `getCustomEmotions`/`insertCustomEmotion`/`getRecord`/`saveRecord`(Task 3, `@/lib/emotion-cards-db`)
- Produces: `async function addCustomEmotion(name: string): Promise<{ emotion?: Emotion; error?: string }>`, `async function saveRecord(date: string, emotions: Emotion[]): Promise<{ error?: string }>`. Task 6(`emotion-select.tsx`)이 이 두 함수를 props로 받고, Task 7이 이 파일에서 import해서 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/emotion-cards/actions.test.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getRecord, getCustomEmotions } from "@/lib/emotion-cards-db";
import { addCustomEmotion, saveRecord } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Server Actions against an in-memory db", () => {
  beforeEach(() => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("addCustomEmotion rejects an empty name", async () => {
    const result = await addCustomEmotion("   ");
    expect(result.error).toBeTruthy();
    expect(getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("addCustomEmotion inserts a new custom emotion and returns it", async () => {
    const result = await addCustomEmotion("허탈함");
    expect(result.emotion).toEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(getCustomEmotions(getDb())).toHaveLength(1);
  });

  test("addCustomEmotion returns the existing preset match instead of duplicating", async () => {
    const result = await addCustomEmotion("행복");
    expect(result.emotion).toEqual({ name: "행복", emoji: "😊", color: "green" });
    expect(getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("saveRecord rejects fewer than 3 emotions", async () => {
    const result = await saveRecord("2026-07-28", [{ name: "행복", emoji: "😊", color: "green" }]);
    expect(result.error).toBeTruthy();
    expect(getRecord(getDb(), "2026-07-28")).toBeUndefined();
  });

  test("saveRecord saves exactly 3 emotions for the date", async () => {
    const emotions = [
      { name: "행복", emoji: "😊", color: "green" as const },
      { name: "슬픔", emoji: "😢", color: "blue" as const },
      { name: "화남", emoji: "😡", color: "red" as const },
    ];
    const result = await saveRecord("2026-07-28", emotions);
    expect(result).toEqual({});
    expect(getRecord(getDb(), "2026-07-28")).toEqual(emotions);
  });

  test("saveRecord replaces an existing record for the same date", async () => {
    const first = [
      { name: "행복", emoji: "😊", color: "green" as const },
      { name: "슬픔", emoji: "😢", color: "blue" as const },
      { name: "화남", emoji: "😡", color: "red" as const },
    ];
    const second = [
      { name: "걱정", emoji: "😟", color: "yellow" as const },
      { name: "고민", emoji: "🤔", color: "purple" as const },
      { name: "놀람", emoji: "😲", color: "purple" as const },
    ];
    await saveRecord("2026-07-28", first);
    await saveRecord("2026-07-28", second);
    expect(getRecord(getDb(), "2026-07-28")).toEqual(second);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- app/emotion-cards/actions.test.ts`
Expected: FAIL with "Cannot find module './actions'"

- [ ] **Step 3: 구현 작성**

`app/emotion-cards/actions.ts`:

```ts
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { EMOTIONS, type Emotion } from "@/lib/emotions";
import {
  getCustomEmotions,
  insertCustomEmotion,
  saveRecord as saveRecordRow,
} from "@/lib/emotion-cards-db";

const MAX_NAME_LENGTH = 6;

export async function addCustomEmotion(name: string): Promise<{ emotion?: Emotion; error?: string }> {
  "use server";
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return { error: "이름을 입력해주세요." };

  const existing = [...EMOTIONS, ...getCustomEmotions(getDb())];
  const emotion = insertCustomEmotion(getDb(), trimmed, existing);
  return { emotion };
}

export async function saveRecord(date: string, emotions: Emotion[]): Promise<{ error?: string }> {
  "use server";
  if (emotions.length !== 3) {
    return { error: "카드를 정확히 3장 선택해주세요." };
  }
  saveRecordRow(getDb(), date, emotions);
  revalidatePath("/emotion-cards");
  revalidatePath("/emotion-cards/history");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- app/emotion-cards/actions.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/emotion-cards/actions.ts app/emotion-cards/actions.test.ts
git commit -m "feat: add emotion-cards addCustomEmotion/saveRecord Server Actions"
```

---

### Task 5: 카드 표시 컴포넌트 (`app/emotion-cards/cards-view.tsx`)

**Files:**
- Create: `app/emotion-cards/cards-view.tsx`
- Create: `app/emotion-cards/cards-view.test.tsx`

**Interfaces:**
- Consumes: `Emotion`, `COLORS`, `DEFINITIONS`(Task 2, `@/lib/emotions`)
- Produces: `function CardsView(props: { label: string; cards: Emotion[] }): JSX.Element`. Task 8(`result`/`history/[date]` 페이지)이 이 컴포넌트를 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardsView } from "./cards-view";
import type { Emotion } from "@/lib/emotions";

const cards: Emotion[] = [
  { name: "행복", emoji: "😊", color: "green" },
  { name: "슬픔", emoji: "😢", color: "blue" },
  { name: "화남", emoji: "😡", color: "red" },
];

describe("CardsView", () => {
  test("renders the label and all three cards", () => {
    render(<CardsView label="나" cards={cards} />);
    expect(screen.getByText("나")).toBeDefined();
    expect(screen.getByText("행복")).toBeDefined();
    expect(screen.getByText("😊")).toBeDefined();
    expect(screen.getByText("슬픔")).toBeDefined();
    expect(screen.getByText("화남")).toBeDefined();
  });

  test("tapping a card opens an overlay with its name and definition", async () => {
    const user = userEvent.setup();
    render(<CardsView label="나" cards={cards} />);
    await user.click(screen.getByRole("button", { name: /행복/ }));
    expect(screen.getByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeDefined();
  });

  test("clicking the overlay backdrop closes it", async () => {
    const user = userEvent.setup();
    render(<CardsView label="나" cards={cards} />);
    await user.click(screen.getByRole("button", { name: /행복/ }));
    expect(screen.getByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeDefined();
    await user.click(screen.getByTestId("card-overlay-backdrop"));
    expect(screen.queryByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- app/emotion-cards/cards-view.test.tsx`
Expected: FAIL with "Cannot find module './cards-view'"

- [ ] **Step 3: 구현 작성**

`app/emotion-cards/cards-view.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Emotion } from "@/lib/emotions";
import { COLORS, DEFINITIONS } from "@/lib/emotions";

type Props = {
  label: string;
  cards: Emotion[];
};

export function CardsView({ label, cards }: Props) {
  const [expanded, setExpanded] = useState<Emotion | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-bold text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="flex gap-2.5">
        {cards.map((card) => (
          <button
            key={card.name}
            type="button"
            onClick={() => setExpanded(card)}
            className="flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-4"
            style={{ background: COLORS[card.color].bg, border: `1px solid ${COLORS[card.color].border}` }}
          >
            <div className="text-2xl">{card.emoji}</div>
            <div className="text-[13px] font-semibold" style={{ color: COLORS[card.color].text }}>
              {card.name}
            </div>
          </button>
        ))}
      </div>

      {expanded && (
        <div
          data-testid="card-overlay-backdrop"
          onClick={() => setExpanded(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-7 transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[300px] flex-col items-center gap-4 rounded-[28px] px-8 py-11 transition-all duration-200"
            style={{
              background: COLORS[expanded.color].bg,
              border: `1px solid ${COLORS[expanded.color].border}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div className="text-[76px] leading-none">{expanded.emoji}</div>
            <div className="text-[22px] font-bold" style={{ color: COLORS[expanded.color].text }}>
              {expanded.name}
            </div>
            <div className="text-center text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {DEFINITIONS[expanded.name] ?? ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- app/emotion-cards/cards-view.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/emotion-cards/cards-view.tsx app/emotion-cards/cards-view.test.tsx
git commit -m "feat: add emotion CardsView with tap-to-expand overlay"
```

---

### Task 6: 카드 선택 컴포넌트 (`app/emotion-cards/emotion-select.tsx`)

**Files:**
- Create: `app/emotion-cards/emotion-select.tsx`
- Create: `app/emotion-cards/emotion-select.test.tsx`

**Interfaces:**
- Consumes: `EMOTIONS`, `Emotion`, `COLORS`(Task 2, `@/lib/emotions`); `addCustomEmotion`/`saveRecord`의 함수 시그니처(Task 4)를 props 타입으로만 참조(실제 import는 하지 않음 — 페이지가 주입)
- Produces: `function EmotionSelect(props: { today: string; initialSelected: Emotion[]; initialCustomEmotions: Emotion[]; backHref: string; addCustomEmotionAction: (name: string) => Promise<{ emotion?: Emotion; error?: string }>; saveRecordAction: (date: string, emotions: Emotion[]) => Promise<{ error?: string }> }): JSX.Element`. Task 7의 `select/page.tsx`가 이 컴포넌트에 Task 4의 두 액션을 그대로 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`app/emotion-cards/emotion-select.test.tsx`:

```tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmotionSelect } from "./emotion-select";

function noopSave() {
  return Promise.resolve({});
}
function noopAdd() {
  return Promise.resolve({ emotion: { name: "허탈함", emoji: "💭", color: "purple" as const } });
}

describe("EmotionSelect selection limit", () => {
  test("selecting a 4th card while 3 are already selected is ignored", async () => {
    const user = userEvent.setup();
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={noopSave}
      />
    );
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    await user.click(screen.getByRole("button", { name: /편안함 선택/ }));
    expect(screen.getByText("3/3")).toBeDefined();
    expect(screen.getByRole("button", { name: /편안함 선택/ }).getAttribute("aria-pressed")).toBe("false");
  });

  test("완료 button is disabled until exactly 3 are selected", async () => {
    const user = userEvent.setup();
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={noopSave}
      />
    );
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", false);
  });
});

describe("EmotionSelect complete flow", () => {
  test("clicking 완료 with 3 selected calls saveRecordAction with today's date and the 3 emotions", async () => {
    const user = userEvent.setup();
    const saveRecordAction = vi.fn().mockResolvedValue({});
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={saveRecordAction}
      />
    );
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    await user.click(screen.getByRole("button", { name: "완료" }));
    expect(saveRecordAction).toHaveBeenCalledTimes(1);
    expect(saveRecordAction.mock.calls[0][0]).toBe("2026-07-28");
    expect(saveRecordAction.mock.calls[0][1].map((e: { name: string }) => e.name)).toEqual([
      "행복",
      "기쁨",
      "감사",
    ]);
  });
});

describe("EmotionSelect custom emotion flow", () => {
  test("the + tile opens a sheet; adding a name calls addCustomEmotionAction and selects the result", async () => {
    const user = userEvent.setup();
    const addCustomEmotionAction = vi
      .fn()
      .mockResolvedValue({ emotion: { name: "허탈함", emoji: "💭", color: "purple" } });
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={addCustomEmotionAction}
        saveRecordAction={noopSave}
      />
    );
    await user.click(screen.getByRole("button", { name: "새 감정 추가" }));
    await user.type(screen.getByLabelText("감정 이름"), "허탈함");
    await user.click(screen.getByRole("button", { name: "추가" }));
    expect(addCustomEmotionAction).toHaveBeenCalledWith("허탈함");
    expect(screen.getByText("1/3")).toBeDefined();
    expect(screen.getByRole("button", { name: /허탈함 선택/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- app/emotion-cards/emotion-select.test.tsx`
Expected: FAIL with "Cannot find module './emotion-select'"

- [ ] **Step 3: 구현 작성**

`app/emotion-cards/emotion-select.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMOTIONS, COLORS, type Emotion } from "@/lib/emotions";

type Props = {
  today: string;
  initialSelected: Emotion[];
  initialCustomEmotions: Emotion[];
  backHref: string;
  addCustomEmotionAction: (name: string) => Promise<{ emotion?: Emotion; error?: string }>;
  saveRecordAction: (date: string, emotions: Emotion[]) => Promise<{ error?: string }>;
};

export function EmotionSelect({
  today,
  initialSelected,
  initialCustomEmotions,
  backHref,
  addCustomEmotionAction,
  saveRecordAction,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Emotion[]>(initialSelected);
  const [customEmotions, setCustomEmotions] = useState<Emotion[]>(initialCustomEmotions);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetName, setSheetName] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allEmotions = [...EMOTIONS, ...customEmotions];
  const canComplete = selected.length === 3;

  function toggle(emotion: Emotion) {
    setSelected((prev) => {
      const exists = prev.some((e) => e.name === emotion.name);
      if (exists) return prev.filter((e) => e.name !== emotion.name);
      if (prev.length >= 3) return prev;
      return [...prev, emotion];
    });
  }

  function closeSheet() {
    setSheetOpen(false);
    setSheetName("");
    setSheetError(null);
  }

  async function handleAddCustom() {
    const trimmed = sheetName.trim();
    if (!trimmed) return;
    const result = await addCustomEmotionAction(trimmed);
    if (result.error || !result.emotion) {
      setSheetError(result.error ?? "추가에 실패했어요.");
      return;
    }
    const emotion = result.emotion;
    if (!customEmotions.some((e) => e.name === emotion.name)) {
      setCustomEmotions((prev) => [...prev, emotion]);
    }
    closeSheet();
    toggle(emotion);
  }

  async function handleComplete() {
    if (!canComplete || isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveRecordAction(today, selected);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      router.push("/emotion-cards/result");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="flex items-center gap-3.5 px-5 pt-4 pb-2">
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={() => router.push(backHref)}
          className="text-xl leading-none text-zinc-500 dark:text-zinc-400"
        >
          ←
        </button>
        <div className="flex-1 text-base font-bold text-zinc-900 dark:text-zinc-50">감정 선택</div>
        <div className="text-sm font-semibold text-orange-600">{selected.length}/3</div>
      </div>

      <div className="px-5 pb-3 text-sm text-zinc-500 dark:text-zinc-400">
        지금 마음에 가장 가까운 카드 3장을 골라주세요
      </div>

      {saveError && <p className="px-5 pb-2 text-sm text-red-600">{saveError}</p>}

      <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-auto px-4 pb-6">
        {allEmotions.map((emotion) => {
          const isSelected = selected.some((e) => e.name === emotion.name);
          const col = COLORS[emotion.color];
          return (
            <button
              key={emotion.name}
              type="button"
              aria-label={`${emotion.name} 선택`}
              aria-pressed={isSelected}
              onClick={() => toggle(emotion)}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl px-1.5 pt-3.5 pb-2.5 transition-transform duration-150"
              style={{
                background: col.bg,
                border: `2px solid ${isSelected ? col.border : "transparent"}`,
                transform: isSelected ? "scale(1.05)" : "scale(1)",
              }}
            >
              {isSelected && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: col.border }}
                >
                  ✓
                </span>
              )}
              <div className="text-2xl leading-none">{emotion.emoji}</div>
              <div className="text-xs font-semibold" style={{ color: col.text }}>
                {emotion.name}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="새 감정 추가"
          onClick={() => setSheetOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-300 px-1.5 pt-3.5 pb-2.5 dark:border-zinc-700"
        >
          <span className="text-2xl leading-none text-zinc-400">+</span>
          <span className="text-xs font-semibold text-zinc-400">추가하기</span>
        </button>
      </div>

      <div className="sticky bottom-0 bg-zinc-50 px-5 pt-3.5 pb-5 dark:bg-black">
        <button
          type="button"
          disabled={!canComplete || isSaving}
          onClick={handleComplete}
          className="w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          완료
        </button>
      </div>

      {sheetOpen && (
        <div
          data-testid="add-emotion-sheet-backdrop"
          onClick={closeSheet}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 transition-opacity duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl bg-white px-6 pt-7 pb-8 transition-transform duration-200 dark:bg-zinc-900"
          >
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-50">나만의 감정 추가하기</div>
            {sheetError && <p className="text-sm text-red-600">{sheetError}</p>}
            <input
              autoFocus
              aria-label="감정 이름"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value.slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustom();
              }}
              placeholder="예: 허탈함, 뭉클함..."
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={closeSheet}
                className="flex-1 rounded-2xl bg-zinc-200 py-3.5 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!sheetName.trim()}
                onClick={handleAddCustom}
                className="flex-1 rounded-2xl bg-orange-600 py-3.5 font-bold text-white disabled:bg-zinc-300"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- app/emotion-cards/emotion-select.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add app/emotion-cards/emotion-select.tsx app/emotion-cards/emotion-select.test.tsx
git commit -m "feat: add emotion selection grid with custom-emotion sheet"
```

---

### Task 7: 오늘 상태 + 선택 페이지 배선

**Files:**
- Create: `app/emotion-cards/page.tsx`
- Create: `app/emotion-cards/select/page.tsx`

**Interfaces:**
- Consumes: `getDb`(`@/lib/db`), `getRecord`/`getCustomEmotions`(Task 3, `@/lib/emotion-cards-db`), `todayISO`(기존 `@/lib/chores`), `EmotionSelect`(Task 6), `addCustomEmotion`/`saveRecord`(Task 4)
- Produces: `/emotion-cards`, `/emotion-cards/select` 라우트가 렌더링됨. 별도 유닛 테스트는 두지 않는다(`/cleaning`, `/supplies`의 `page.tsx`와 동일한 관례 — 얇은 배선 코드).

- [ ] **Step 1: `app/emotion-cards/page.tsx` 작성**

```tsx
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";

export const dynamic = "force-dynamic";

export default function EmotionCardsPage() {
  const today = todayISO();
  const submitted = getRecord(getDb(), today) !== undefined;
  const todayLabel = format(parseISO(today), "M월 d일 EEEE", { locale: ko });

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-6 p-5">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">감정카드</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            말 대신, 감정 카드 3장으로 오늘의 마음을 전해요
          </p>
        </div>

        {submitted ? (
          <>
            <div className="rounded-2xl bg-white p-5 dark:bg-zinc-900">
              <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">✅ 오늘 기록 완료</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">오늘 하루도 잘 기록했어요</p>
            </div>
            <Link
              href="/emotion-cards/result"
              className="rounded-2xl bg-orange-600 py-4 text-center text-base font-bold text-white"
            >
              오늘 결과 보기
            </Link>
          </>
        ) : (
          <Link
            href="/emotion-cards/select"
            className="rounded-2xl bg-orange-600 py-4 text-center text-base font-bold text-white"
          >
            감정 선택하기
          </Link>
        )}

        <Link href="/emotion-cards/history" className="text-sm text-zinc-500 dark:text-zinc-400">
          📅 기록 보기
        </Link>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: `app/emotion-cards/select/page.tsx` 작성**

```tsx
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getRecord, getCustomEmotions } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { EmotionSelect } from "../emotion-select";
import { addCustomEmotion, saveRecord } from "../actions";

export const dynamic = "force-dynamic";

export default async function SelectPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const isEdit = edit === "1";
  const today = todayISO();
  const existing = getRecord(getDb(), today);

  if (existing && !isEdit) {
    redirect("/emotion-cards/result");
  }

  const customEmotions = getCustomEmotions(getDb());

  return (
    <EmotionSelect
      today={today}
      initialSelected={isEdit ? (existing ?? []) : []}
      initialCustomEmotions={customEmotions}
      backHref={isEdit ? "/emotion-cards/result" : "/emotion-cards"}
      addCustomEmotionAction={addCustomEmotion}
      saveRecordAction={saveRecord}
    />
  );
}
```

- [ ] **Step 3: 타입체크 + 전체 테스트 실행**

Run: `npm test`
Expected: PASS (모든 기존 + 신규 테스트)

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add app/emotion-cards/page.tsx app/emotion-cards/select/page.tsx
git commit -m "feat: wire /emotion-cards and /emotion-cards/select pages"
```

---

### Task 8: 결과 + 히스토리 페이지 배선

**Files:**
- Create: `app/emotion-cards/result/page.tsx`
- Create: `app/emotion-cards/history/page.tsx`
- Create: `app/emotion-cards/history/[date]/page.tsx`

**Interfaces:**
- Consumes: `getDb`(`@/lib/db`), `getRecord`/`getAllRecordsDesc`(Task 3, `@/lib/emotion-cards-db`), `todayISO`(`@/lib/chores`), `CardsView`(Task 5)
- Produces: `/emotion-cards/result`, `/emotion-cards/history`, `/emotion-cards/history/[date]` 라우트가 렌더링됨. 별도 유닛 테스트는 두지 않는다(Task 7과 동일한 이유).

- [ ] **Step 1: `app/emotion-cards/result/page.tsx` 작성**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { CardsView } from "../cards-view";

export const dynamic = "force-dynamic";

export default function ResultPage() {
  const today = todayISO();
  const cards = getRecord(getDb(), today);

  if (!cards) {
    redirect("/emotion-cards");
  }

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">오늘의 마음</h1>
          <Link href="/emotion-cards/select?edit=1" className="text-sm font-semibold text-orange-600">
            수정하기
          </Link>
        </div>
        <CardsView label="나" cards={cards} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: `app/emotion-cards/history/page.tsx` 작성**

```tsx
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getAllRecordsDesc } from "@/lib/emotion-cards-db";

export const dynamic = "force-dynamic";

export default function HistoryPage() {
  const records = getAllRecordsDesc(getDb());

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-2.5 p-5">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">기록</h1>
        {records.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-400">아직 기록이 없어요</p>
        )}
        {records.map((record) => (
          <Link
            key={record.date}
            href={`/emotion-cards/history/${record.date}`}
            className="flex items-center justify-between rounded-2xl bg-white px-4.5 py-4 dark:bg-zinc-900"
          >
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              {format(parseISO(record.date), "M월 d일 (EEEEE)", { locale: ko })}
            </span>
            <span className="flex gap-1.5">
              {record.cards.map((card, i) => (
                <span
                  key={i}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-zinc-100 text-lg dark:bg-zinc-800"
                >
                  {card.emoji}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: `app/emotion-cards/history/[date]/page.tsx` 작성**

```tsx
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getRecord } from "@/lib/emotion-cards-db";
import { CardsView } from "../../cards-view";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const cards = ISO_DATE_RE.test(date) ? getRecord(getDb(), date) : undefined;

  if (!cards) {
    redirect("/emotion-cards/history");
  }

  const dateLabel = format(parseISO(date), "M월 d일 EEEE", { locale: ko });

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{dateLabel}</h1>
        <CardsView label="나" cards={cards} />
      </main>
    </div>
  );
}
```

- [ ] **Step 4: 타입체크 + 전체 테스트 실행**

Run: `npm test`
Expected: PASS (모든 기존 + 신규 테스트)

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/emotion-cards/result/page.tsx app/emotion-cards/history/page.tsx "app/emotion-cards/history/[date]/page.tsx"
git commit -m "feat: wire /emotion-cards result and history pages"
```

---

### Task 9: 홈 셸 연동 (`lib/sections.ts`)

**Files:**
- Modify: `lib/sections.ts`
- Modify: `lib/sections.test.ts`

**Interfaces:**
- Consumes: `getRecord`(Task 3, `./emotion-cards-db`), `todayISO`(`./chores`)
- Produces: 홈 화면(`/`)의 "감정카드" 행이 오늘 기록 여부를 보여준다.

- [ ] **Step 1: 실패하는 테스트로 기존 기대값을 갱신한다**

`lib/sections.test.ts` 전체를 아래 내용으로 교체:

```ts
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npm test -- lib/sections.test.ts`
Expected: FAIL — "emotion-cards section status" 블록의 두 테스트가 실패한다(`getStatus()`가 아직 `{ ready: false }`를 반환하므로 `{ ready: true, ... }` 기대값과 불일치).

- [ ] **Step 3: 구현 작성**

`lib/sections.ts`의 import 블록에 한 줄 추가:

```ts
import { getRecord } from "./emotion-cards-db";
```

`emotion-cards` 섹션 정의를 아래로 교체:

```ts
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: () => {
      const hasToday = getRecord(getDb(), todayISO()) !== undefined;
      return hasToday
        ? { ready: true, label: "오늘 기록 완료" }
        : { ready: true, label: "아직 기록 전" };
    },
  },
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npm test -- lib/sections.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/sections.ts lib/sections.test.ts
git commit -m "feat: wire real emotion-cards home-shell status"
```

---

### Task 10: 전체 테스트 + 수동 확인

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

1. `/`에서 "감정카드" 행이 "준비중"이 아니라 실제 상태("아직 기록 전" 등)를 보여주는지
2. `/emotion-cards` → "감정 선택하기" → `/emotion-cards/select`에서 37개 프리셋 카드가 zinc/다크모드 셸 안에 색상별로 표시되는지
3. 카드 3장을 고르면 "완료" 버튼이 활성화되고, 4번째를 눌러도 무시되는지
4. "+ 추가하기"로 커스텀 감정을 만들면 그리드에 즉시 반영되고 자동으로 선택되는지
5. "완료" 클릭 → `/emotion-cards/result`로 이동, 카드 3장 표시, 카드 탭 시 확대 오버레이(정의 텍스트 포함)가 뜨는지, 배경 클릭 시 닫히는지
6. "수정하기" → 기존 3장이 미리 선택된 채로 `/select?edit=1`이 열리는지
7. `/emotion-cards/history`에서 오늘 기록이 목록에 뜨고, 클릭하면 `/emotion-cards/history/[date]`로 이동해 같은 카드가 보이는지
8. 완료 처리 후 홈 화면(`/`)의 "감정카드" 배지가 "오늘 기록 완료"로 갱신되는지
9. 라이트/다크 테마 양쪽에서 페이지 배경/카드가 깨지지 않는지

문제가 없으면 이 태스크는 커밋할 코드 변경이 없으므로 커밋하지 않는다.
