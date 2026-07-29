# node:sqlite → Neon Postgres 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `node:sqlite`(로컬 파일) 기반 저장소를 Neon Postgres + Drizzle ORM으로 교체해서, Vercel 서버리스에서 `/cleaning`·`/supplies`·`/emotion-cards`가 간헐적으로 500을 내는 `ENOENT` 버그를 없앤다.

**Architecture:** `lib/db.ts`가 `getDb()`/`setDbForTesting()`으로 Drizzle 인스턴스를 노출하는 구조는 유지하되, 내부 드라이버를 `node:sqlite`의 `DatabaseSync`에서 `drizzle-orm/neon-http`(프로덕션)로 바꾼다. `lib/{chores,supplies,emotion-cards}-db.ts`는 각자 `pgTable` 스키마 + 비동기 CRUD 함수를 갖는 기존 모듈 분리를 그대로 유지한다. 테스트는 `drizzle-orm/pglite`(in-memory Postgres)로 실제 Neon과 동일한 SQL 방언을 쓰면서 네트워크 없이 돈다.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, `drizzle-orm` + `drizzle-kit`, `@neondatabase/serverless`, `@electric-sql/pglite`(devDependency), Vitest + Testing Library(기존 그대로).

## Global Constraints

- 날짜 컬럼은 전부 ISO 문자열(`text`) 유지 — `timestamp` 타입으로 바꾸지 않는다(스펙: `docs/superpowers/specs/2026-07-29-neon-postgres-migration-design.md` "스키마 변환").
- **스펙 대비 의도적 변경 1건**: 스펙 문서는 enum류 컬럼(`interval_unit`/`category`/`color`)에 `pgEnum`을 쓰라고 적었지만, 이 플랜에서는 대신 `text()` + Drizzle `check()` 제약을 쓴다. 이유: PGlite 테스트에서 매 테스트 스위트가 아니라 **같은 db 인스턴스에 `initXSchema`를 두 번 호출하는 기존 시딩-멱등성 테스트**(`supplies-db.test.ts`)가 있는데, Postgres는 `CREATE TYPE ... IF NOT EXISTS`를 지원하지 않아 `pgEnum`을 쓰면 두 번째 호출에서 예외가 난다. `text` + `CREATE TABLE IF NOT EXISTS ... CHECK (...)`는 테이블 전체가 이미 있으면 통째로 스킵되므로 기존처럼 멱등적이다. 값 제약을 강제한다는 스펙의 의도는 `check()`로도 동일하게 달성된다.
- 기존 프로덕션 sqlite 데이터는 이전하지 않는다(사용자 결정). `drizzle-kit push`로 Neon에 빈 스키마를 새로 만든다.
- 각 태스크는 자신이 건드리는 테스트 파일만 통과하면 된다(`npx vitest run <파일>`). 전체 스위트(`npm test`)는 저장소 계층 전환이 다 끝나는 마지막 태스크(Task 9)에서만 녹색이면 된다 — 중간 태스크 시점에 다른 파일이 아직 옛 동기 API를 참조해 전체 스위트가 빨간 것은 정상이다.
- Task 10~11은 사용자가 Neon 프로젝트를 만들고 `DATABASE_URL`을 제공해야 진행 가능하다 — 코드 변경이 아니라 실제 인프라에 접근하는 단계이므로, 그 값을 받기 전까지 실행을 멈추고 사용자에게 물어본다.

---

### Task 1: 저장소 기반 + 청소 관리(chores) 도메인 전환

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json` (의존성 추가 — `npm install`로 처리, 직접 버전 문자열을 쓰지 않는다)
- Modify: `lib/db.ts`
- Modify: `lib/chores-db.ts`
- Modify: `lib/chores-db.test.ts`
- Modify: `lib/db.test.ts`

**Interfaces:**
- Consumes: 없음(이 태스크가 최초 진입점)
- Produces:
  - `lib/db.ts`: `export type AppDb = PgDatabase<any, any, any>`, `export function getDb(): AppDb`, `export function setDbForTesting(database: AppDb | null): void`, `export async function initSchema(database: AppDb): Promise<void>`(현재는 `initChoresSchema`만 호출 — Task 2/3에서 확장)
  - `lib/chores-db.ts`: `export const chores` (pgTable), `export type ChoreRow`, `export type ChoreInput`, `export async function initChoresSchema(database: AppDb): Promise<void>`, `export async function getAllChores(database: AppDb): Promise<ChoreRow[]>`, `export async function insertChore(database: AppDb, input: ChoreInput): Promise<ChoreRow>`, `export async function updateChoreRow(database: AppDb, id: number, input: ChoreInput): Promise<void>`, `export async function completeChoreRow(database: AppDb, id: number, doneDateISO: string): Promise<void>`, `export async function deleteChoreRow(database: AppDb, id: number): Promise<void>`

- [ ] **Step 1: 의존성 설치**

Run:
```bash
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit @electric-sql/pglite dotenv
```

- [ ] **Step 2: `drizzle.config.ts` 작성**

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: ["./lib/chores-db.ts", "./lib/supplies-db.ts", "./lib/emotion-cards-db.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 3: `lib/chores-db.test.ts`를 실패하는 새 테스트로 교체(PGlite 기반)**

```ts
import { describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "./db";
import {
  initChoresSchema,
  getAllChores,
  insertChore,
  updateChoreRow,
  completeChoreRow,
  deleteChoreRow,
} from "./chores-db";

async function freshDb(): Promise<AppDb> {
  const db = drizzle();
  await initChoresSchema(db);
  return db;
}

describe("lib/chores-db CRUD", () => {
  test("insertChore creates a row with null last_done_at and returns it", async () => {
    const db = await freshDb();
    const row = await insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    expect(row.name).toBe("빨래");
    expect(row.icon).toBe("🧺");
    expect(row.interval_value).toBe(1);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBeNull();
    expect(typeof row.created_at).toBe("string");
  });

  test("getAllChores returns every inserted row, ordered by id", async () => {
    const db = await freshDb();
    await insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    await insertChore(db, { name: "설거지", icon: "🍽️", intervalValue: 1, intervalUnit: "day" });
    const rows = await getAllChores(db);
    expect(rows.map((r) => r.name)).toEqual(["빨래", "설거지"]);
  });

  test("updateChoreRow changes name/icon/interval but not last_done_at", async () => {
    const db = await freshDb();
    const created = await insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    await completeChoreRow(db, created.id, "2026-07-01");
    await updateChoreRow(db, created.id, { name: "손빨래", icon: "🧴", intervalValue: 2, intervalUnit: "week" });
    const [row] = await getAllChores(db);
    expect(row.name).toBe("손빨래");
    expect(row.icon).toBe("🧴");
    expect(row.interval_value).toBe(2);
    expect(row.interval_unit).toBe("week");
    expect(row.last_done_at).toBe("2026-07-01");
  });

  test("completeChoreRow sets last_done_at", async () => {
    const db = await freshDb();
    const created = await insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    await completeChoreRow(db, created.id, "2026-07-27");
    const [row] = await getAllChores(db);
    expect(row.last_done_at).toBe("2026-07-27");
  });

  test("deleteChoreRow removes the row", async () => {
    const db = await freshDb();
    const created = await insertChore(db, { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    await deleteChoreRow(db, created.id);
    expect(await getAllChores(db)).toHaveLength(0);
  });
});
```

- [ ] **Step 4: 테스트가 실패하는지 확인(아직 구현 전이므로 컴파일/런타임 에러가 나야 정상)**

Run: `npx vitest run lib/chores-db.test.ts`
Expected: FAIL (옛 `chores-db.ts`가 `DatabaseSync`를 기대하는 동기 함수라 타입/런타임 에러)

- [ ] **Step 5: `lib/chores-db.ts`를 Drizzle 기반으로 재작성**

```ts
import { pgTable, serial, text, integer, check } from "drizzle-orm/pg-core";
import { sql, eq, asc } from "drizzle-orm";
import type { AppDb } from "./db";
import type { IntervalUnit } from "./chores";

export const chores = pgTable(
  "chores",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: text("interval_unit").notNull(),
    lastDoneAt: text("last_done_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [check("chores_interval_unit_check", sql`${table.intervalUnit} IN ('day', 'week', 'month')`)]
);

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

function toRow(r: typeof chores.$inferSelect): ChoreRow {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    interval_value: r.intervalValue,
    interval_unit: r.intervalUnit as IntervalUnit,
    last_done_at: r.lastDoneAt,
    created_at: r.createdAt,
  };
}

export async function initChoresSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS chores (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      interval_value INTEGER NOT NULL,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('day', 'week', 'month')),
      last_done_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

export async function getAllChores(database: AppDb): Promise<ChoreRow[]> {
  const rows = await database.select().from(chores).orderBy(asc(chores.id));
  return rows.map(toRow);
}

export async function insertChore(database: AppDb, input: ChoreInput): Promise<ChoreRow> {
  const createdAt = new Date().toISOString();
  const [row] = await database
    .insert(chores)
    .values({
      name: input.name,
      icon: input.icon,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
      lastDoneAt: null,
      createdAt,
    })
    .returning();
  return toRow(row);
}

export async function updateChoreRow(database: AppDb, id: number, input: ChoreInput): Promise<void> {
  await database
    .update(chores)
    .set({
      name: input.name,
      icon: input.icon,
      intervalValue: input.intervalValue,
      intervalUnit: input.intervalUnit,
    })
    .where(eq(chores.id, id));
}

export async function completeChoreRow(database: AppDb, id: number, doneDateISO: string): Promise<void> {
  await database.update(chores).set({ lastDoneAt: doneDateISO }).where(eq(chores.id, id));
}

export async function deleteChoreRow(database: AppDb, id: number): Promise<void> {
  await database.delete(chores).where(eq(chores.id, id));
}
```

- [ ] **Step 6: `lib/db.ts`를 Neon/Drizzle 기반으로 재작성**

```ts
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { initChoresSchema } from "./chores-db";

export type AppDb = PgDatabase<any, any, any>;

let dbInstance: AppDb | null = null;
let testOverride: AppDb | null = null;

export function getDb(): AppDb {
  if (testOverride) return testOverride;
  if (!dbInstance) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    dbInstance = drizzleNeon({ client: neon(url) });
  }
  return dbInstance;
}

export function setDbForTesting(database: AppDb | null): void {
  testOverride = database;
}

export async function initSchema(database: AppDb): Promise<void> {
  await initChoresSchema(database);
}
```

- [ ] **Step 7: `lib/db.test.ts`를 PGlite 기반으로 교체**

옛 파일의 "file-backed database" 테스트는 로컬 sqlite 파일 존재 여부를 검증하던 테스트라 더 이상 의미가 없다(Neon은 로컬 파일이 없다) — 삭제하고, `getDb()`의 새 계약(override 우선, 없으면 `DATABASE_URL` 필요)을 검증하는 테스트로 바꾼다.

```ts
import { describe, expect, test, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import { initSchema, getDb, setDbForTesting } from "./db";
import { getAllChores } from "./chores-db";

describe("initSchema", () => {
  test("creates the chores table", async () => {
    const db = drizzle();
    await initSchema(db);
    expect(await getAllChores(db)).toEqual([]);
  });
});

describe("getDb()", () => {
  afterEach(() => {
    setDbForTesting(null);
    delete process.env.DATABASE_URL;
  });

  test("returns the test override when one is set, without needing DATABASE_URL", () => {
    delete process.env.DATABASE_URL;
    const db = drizzle();
    setDbForTesting(db);
    expect(getDb()).toBe(db);
  });

  test("throws a clear error when DATABASE_URL is not set and no override exists", () => {
    delete process.env.DATABASE_URL;
    expect(() => getDb()).toThrow("DATABASE_URL is not set");
  });
});
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `npx vitest run lib/chores-db.test.ts lib/db.test.ts`
Expected: PASS (전체 스위트 `npm test`는 아직 다른 파일들이 옛 API를 써서 빨갛다 — 정상)

- [ ] **Step 9: 커밋**

```bash
git add drizzle.config.ts package.json package-lock.json lib/db.ts lib/chores-db.ts lib/chores-db.test.ts lib/db.test.ts
git commit -m "feat: migrate lib/db.ts and chores-db to Drizzle + Neon/PGlite"
```

---

### Task 2: 생필품 관리(supplies) 도메인 전환

**Files:**
- Modify: `lib/db.ts` (initSchema에 `initSuppliesSchema` 추가)
- Modify: `lib/supplies-db.ts`
- Modify: `lib/supplies-db.test.ts`
- Modify: `lib/db.test.ts` (initSchema 테스트에 supplies 시딩 검증 추가)

**Interfaces:**
- Consumes: `AppDb` (Task 1의 `lib/db.ts`), `todayISO` (`lib/chores.ts`, 기존), `SupplyCategory` (`lib/supplies.ts`, 기존)
- Produces: `lib/supplies-db.ts`: `export const supplies` (pgTable), `export type SupplyRow`, `export async function initSuppliesSchema(database: AppDb): Promise<void>`, `export async function getAllSupplies(database: AppDb): Promise<SupplyRow[]>`, `export async function completeSupplyRow(database: AppDb, id: number, doneDateISO: string): Promise<void>`

- [ ] **Step 1: `lib/supplies-db.test.ts`를 PGlite 기반으로 교체**

```ts
import { describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "./db";
import { initSuppliesSchema, getAllSupplies, completeSupplyRow } from "./supplies-db";
import { todayISO } from "./chores";

async function freshDb(): Promise<AppDb> {
  const db = drizzle();
  await initSuppliesSchema(db);
  return db;
}

describe("lib/supplies-db catalog", () => {
  test("initSuppliesSchema seeds exactly 21 supply rows spanning all 4 categories, dated today", async () => {
    const db = await freshDb();
    const rows = await getAllSupplies(db);
    expect(rows).toHaveLength(21);
    expect(new Set(rows.map((r) => r.category))).toEqual(
      new Set(["bathroom", "kitchen", "bedroom", "appliance"])
    );
    for (const row of rows) {
      expect(row.last_done_at).toBe(todayISO());
    }
  });

  test("seeding is idempotent - calling initSuppliesSchema again does not duplicate rows", async () => {
    const db = await freshDb();
    await initSuppliesSchema(db);
    expect(await getAllSupplies(db)).toHaveLength(21);
  });

  test("completeSupplyRow updates last_done_at for the given id", async () => {
    const db = await freshDb();
    const [first] = await getAllSupplies(db);
    await completeSupplyRow(db, first.id, "2026-07-01");
    const [updated] = await getAllSupplies(db);
    expect(updated.last_done_at).toBe("2026-07-01");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/supplies-db.test.ts`
Expected: FAIL

- [ ] **Step 3: `lib/supplies-db.ts`를 Drizzle 기반으로 재작성**

```ts
import { pgTable, serial, text, integer, check } from "drizzle-orm/pg-core";
import { sql, eq, asc } from "drizzle-orm";
import type { AppDb } from "./db";
import type { SupplyCategory } from "./supplies";
import { todayISO } from "./chores";

export const supplies = pgTable(
  "supplies",
  {
    id: serial("id").primaryKey(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    cycleDays: integer("cycle_days").notNull(),
    lastDoneAt: text("last_done_at").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    check("supplies_category_check", sql`${table.category} IN ('bathroom', 'kitchen', 'bedroom', 'appliance')`),
  ]
);

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

function toRow(r: typeof supplies.$inferSelect): SupplyRow {
  return {
    id: r.id,
    category: r.category as SupplyCategory,
    name: r.name,
    icon: r.icon,
    cycle_days: r.cycleDays,
    last_done_at: r.lastDoneAt,
    sort_order: r.sortOrder,
  };
}

async function seedSuppliesIfEmpty(database: AppDb): Promise<void> {
  const [{ count }] = await database.select({ count: sql<number>`count(*)::int` }).from(supplies);
  if (count > 0) return;
  const today = todayISO();
  await database.insert(supplies).values(
    SUPPLY_CATALOG.map((entry, index) => ({
      category: entry.category,
      name: entry.name,
      icon: entry.icon,
      cycleDays: entry.cycleDays,
      lastDoneAt: today,
      sortOrder: index,
    }))
  );
}

export async function initSuppliesSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS supplies (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL CHECK (category IN ('bathroom', 'kitchen', 'bedroom', 'appliance')),
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      cycle_days INTEGER NOT NULL,
      last_done_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    )
  `);
  await seedSuppliesIfEmpty(database);
}

export async function getAllSupplies(database: AppDb): Promise<SupplyRow[]> {
  const rows = await database.select().from(supplies).orderBy(asc(supplies.sortOrder));
  return rows.map(toRow);
}

export async function completeSupplyRow(database: AppDb, id: number, doneDateISO: string): Promise<void> {
  await database.update(supplies).set({ lastDoneAt: doneDateISO }).where(eq(supplies.id, id));
}
```

- [ ] **Step 4: `lib/db.ts`의 `initSchema`에 supplies 추가**

`lib/db.ts`에서 다음과 같이 수정:

```ts
import { initChoresSchema } from "./chores-db";
import { initSuppliesSchema } from "./supplies-db";
```

```ts
export async function initSchema(database: AppDb): Promise<void> {
  await initChoresSchema(database);
  await initSuppliesSchema(database);
}
```

- [ ] **Step 5: `lib/db.test.ts`의 `initSchema` 테스트를 supplies도 검증하도록 확장**

```ts
import { getAllSupplies } from "./supplies-db";
```

```ts
describe("initSchema", () => {
  test("creates the chores and supplies tables in one call", async () => {
    const db = drizzle();
    await initSchema(db);
    expect(await getAllChores(db)).toEqual([]);
    expect(await getAllSupplies(db)).toHaveLength(21);
  });
});
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run lib/supplies-db.test.ts lib/db.test.ts`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/db.ts lib/db.test.ts lib/supplies-db.ts lib/supplies-db.test.ts
git commit -m "feat: migrate supplies-db to Drizzle + Neon/PGlite"
```

---

### Task 3: 감정카드(emotion-cards) 도메인 전환

**Files:**
- Modify: `lib/db.ts` (initSchema에 `initEmotionCardsSchema` 추가)
- Modify: `lib/emotion-cards-db.ts`
- Modify: `lib/emotion-cards-db.test.ts`

**Interfaces:**
- Consumes: `AppDb` (`lib/db.ts`), `Emotion`/`EmotionColor` (`lib/emotions.ts`, 기존)
- Produces: `lib/emotion-cards-db.ts`: `export const customEmotions`, `export const emotionRecords` (pgTable), `export async function initEmotionCardsSchema(database: AppDb): Promise<void>`, `export async function getCustomEmotions(database: AppDb): Promise<Emotion[]>`, `export async function insertCustomEmotion(database: AppDb, name: string, existing: Emotion[]): Promise<Emotion>`, `export async function getRecord(database: AppDb, date: string): Promise<Emotion[] | undefined>`, `export async function saveRecord(database: AppDb, date: string, emotions: Emotion[]): Promise<void>`, `export async function getAllRecordsDesc(database: AppDb): Promise<{ date: string; cards: Emotion[] }[]>`

- [ ] **Step 1: `lib/emotion-cards-db.test.ts`를 PGlite 기반으로 교체**

```ts
import { describe, expect, test } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "./db";
import {
  initEmotionCardsSchema,
  getCustomEmotions,
  insertCustomEmotion,
  getRecord,
  saveRecord,
  getAllRecordsDesc,
} from "./emotion-cards-db";

async function freshDb(): Promise<AppDb> {
  const db = drizzle();
  await initEmotionCardsSchema(db);
  return db;
}

describe("custom emotions", () => {
  test("insertCustomEmotion adds a new emotion with default emoji/color", async () => {
    const db = await freshDb();
    const emotion = await insertCustomEmotion(db, "허탈함", []);
    expect(emotion).toStrictEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(await getCustomEmotions(db)).toStrictEqual([emotion]);
  });

  test("insertCustomEmotion returns the existing match instead of duplicating", async () => {
    const db = await freshDb();
    const existing = [{ name: "행복", emoji: "😊", color: "green" as const }];
    const emotion = await insertCustomEmotion(db, "행복", existing);
    expect(emotion).toStrictEqual(existing[0]);
    expect(await getCustomEmotions(db)).toHaveLength(0);
  });
});

describe("emotion records", () => {
  const cards = [
    { name: "행복", emoji: "😊", color: "green" as const },
    { name: "슬픔", emoji: "😢", color: "blue" as const },
    { name: "화남", emoji: "😡", color: "red" as const },
  ];

  test("getRecord returns undefined when nothing is saved for the date", async () => {
    const db = await freshDb();
    expect(await getRecord(db, "2026-07-28")).toBeUndefined();
  });

  test("saveRecord then getRecord round-trips the 3 cards in order", async () => {
    const db = await freshDb();
    await saveRecord(db, "2026-07-28", cards);
    expect(await getRecord(db, "2026-07-28")).toStrictEqual(cards);
  });

  test("saveRecord replaces the previous 3 rows for the same date, not append", async () => {
    const db = await freshDb();
    await saveRecord(db, "2026-07-28", cards);
    const replacement = [
      { name: "걱정", emoji: "😟", color: "yellow" as const },
      { name: "고민", emoji: "🤔", color: "purple" as const },
      { name: "놀람", emoji: "😲", color: "purple" as const },
    ];
    await saveRecord(db, "2026-07-28", replacement);
    expect(await getRecord(db, "2026-07-28")).toStrictEqual(replacement);
  });

  test("getAllRecordsDesc groups rows by date, most recent first", async () => {
    const db = await freshDb();
    await saveRecord(db, "2026-07-01", cards);
    await saveRecord(db, "2026-07-28", cards);
    const records = await getAllRecordsDesc(db);
    expect(records.map((r) => r.date)).toEqual(["2026-07-28", "2026-07-01"]);
    expect(records[0].cards).toStrictEqual(cards);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/emotion-cards-db.test.ts`
Expected: FAIL

- [ ] **Step 3: `lib/emotion-cards-db.ts`를 Drizzle 기반으로 재작성**

```ts
import { pgTable, serial, text, integer, check, unique } from "drizzle-orm/pg-core";
import { sql, eq, asc, desc } from "drizzle-orm";
import type { AppDb } from "./db";
import type { Emotion, EmotionColor } from "./emotions";

export const customEmotions = pgTable(
  "custom_emotions",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "custom_emotions_color_check",
      sql`${table.color} IN ('green','pink','blue','red','yellow','purple')`
    ),
  ]
);

export const emotionRecords = pgTable(
  "emotion_records",
  {
    id: serial("id").primaryKey(),
    date: text("date").notNull(),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull(),
    color: text("color").notNull(),
  },
  (table) => [
    check("emotion_records_position_check", sql`${table.position} IN (1, 2, 3)`),
    unique("emotion_records_date_position_unique").on(table.date, table.position),
  ]
);

export async function initEmotionCardsSchema(database: AppDb): Promise<void> {
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS custom_emotions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL CHECK (color IN ('green','pink','blue','red','yellow','purple')),
      created_at TEXT NOT NULL
    )
  `);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS emotion_records (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(date, position)
    )
  `);
}

export async function getCustomEmotions(database: AppDb): Promise<Emotion[]> {
  const rows = await database
    .select({ name: customEmotions.name, emoji: customEmotions.emoji, color: customEmotions.color })
    .from(customEmotions)
    .orderBy(asc(customEmotions.id));
  return rows.map((row) => ({ name: row.name, emoji: row.emoji, color: row.color as EmotionColor }));
}

export async function insertCustomEmotion(database: AppDb, name: string, existing: Emotion[]): Promise<Emotion> {
  const found = existing.find((e) => e.name === name);
  if (found) return found;

  const emotion: Emotion = { name, emoji: "💭", color: "purple" };
  const createdAt = new Date().toISOString();
  await database.insert(customEmotions).values({
    name: emotion.name,
    emoji: emotion.emoji,
    color: emotion.color,
    createdAt,
  });
  return emotion;
}

export async function getRecord(database: AppDb, date: string): Promise<Emotion[] | undefined> {
  const rows = await database
    .select({ name: emotionRecords.name, emoji: emotionRecords.emoji, color: emotionRecords.color })
    .from(emotionRecords)
    .where(eq(emotionRecords.date, date))
    .orderBy(asc(emotionRecords.position));
  if (rows.length !== 3) return undefined;
  return rows.map((row) => ({ name: row.name, emoji: row.emoji, color: row.color as EmotionColor }));
}

export async function saveRecord(database: AppDb, date: string, emotions: Emotion[]): Promise<void> {
  await database.delete(emotionRecords).where(eq(emotionRecords.date, date));
  await database.insert(emotionRecords).values(
    emotions.map((emotion, index) => ({
      date,
      position: index + 1,
      name: emotion.name,
      emoji: emotion.emoji,
      color: emotion.color,
    }))
  );
}

export async function getAllRecordsDesc(database: AppDb): Promise<{ date: string; cards: Emotion[] }[]> {
  const rows = await database
    .select({
      date: emotionRecords.date,
      position: emotionRecords.position,
      name: emotionRecords.name,
      emoji: emotionRecords.emoji,
      color: emotionRecords.color,
    })
    .from(emotionRecords)
    .orderBy(desc(emotionRecords.date), asc(emotionRecords.position));

  const byDate = new Map<string, Emotion[]>();
  for (const row of rows) {
    const cards = byDate.get(row.date) ?? [];
    cards.push({ name: row.name, emoji: row.emoji, color: row.color as EmotionColor });
    byDate.set(row.date, cards);
  }
  return Array.from(byDate.entries()).map(([date, cards]) => ({ date, cards }));
}
```

- [ ] **Step 4: `lib/db.ts`의 `initSchema`에 emotion-cards 추가**

```ts
import { initEmotionCardsSchema } from "./emotion-cards-db";
```

```ts
export async function initSchema(database: AppDb): Promise<void> {
  await initChoresSchema(database);
  await initSuppliesSchema(database);
  await initEmotionCardsSchema(database);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run lib/emotion-cards-db.test.ts lib/db.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/db.ts lib/emotion-cards-db.ts lib/emotion-cards-db.test.ts
git commit -m "feat: migrate emotion-cards-db to Drizzle + Neon/PGlite"
```

---

### Task 4: `lib/sections.ts` 비동기 전환

**Files:**
- Modify: `lib/sections.ts`
- Modify: `lib/sections.test.ts`

**Interfaces:**
- Consumes: `getAllChores`/`getAllSupplies`/`getRecord`(Task 1-3, 이제 모두 `Promise` 반환), `getDb`/`setDbForTesting`/`initSchema`(`lib/db.ts`)
- Produces: `lib/sections.ts`: `export type Section = { id: string; name: string; icon: string; href: string; getStatus: () => Promise<SectionStatus> }`, `export const SECTIONS: Section[]` (기존과 동일한 4개 항목, `getStatus`만 비동기)

- [ ] **Step 1: `lib/sections.test.ts`를 PGlite 기반으로 교체**

```ts
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { setDbForTesting, initSchema, getDb } from "./db";
import { insertChore } from "./chores-db";
import { getAllSupplies, completeSupplyRow } from "./supplies-db";
import { saveRecord } from "./emotion-cards-db";
import { todayISO } from "./chores";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["cleaning", "supplies", "emotion-cards", "budget"]);
    expect(SECTIONS.map((s) => s.href)).toEqual([
      "/cleaning",
      "/supplies",
      "/emotion-cards",
      "https://couple-finance-dusky.vercel.app",
    ]);
  });

  test("budget is an always-ready external link", async () => {
    const budget = SECTIONS.find((s) => s.id === "budget")!;
    expect(await budget.getStatus()).toEqual({ ready: true, label: "바로가기" });
  });
});

describe("cleaning section status", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports ready with an overdue count when chores are overdue", async () => {
    await insertChore(getDb(), { name: "빨래", icon: "🧺", intervalValue: 1, intervalUnit: "week" });
    const cleaning = SECTIONS.find((s) => s.id === "cleaning")!;
    expect(await cleaning.getStatus()).toEqual({ ready: true, label: "밀린 항목 1개" });
  });

  test("reports ready with a done message when nothing is overdue", async () => {
    const cleaning = SECTIONS.find((s) => s.id === "cleaning")!;
    expect(await cleaning.getStatus()).toEqual({ ready: true, label: "전부 완료" });
  });
});

describe("supplies section status", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports ready with a done message right after seeding (nothing overdue yet)", async () => {
    const supplies = SECTIONS.find((s) => s.id === "supplies")!;
    expect(await supplies.getStatus()).toEqual({ ready: true, label: "전부 완료" });
  });

  test("reports ready with an overdue count once an item is pushed into the past", async () => {
    const [first] = await getAllSupplies(getDb());
    await completeSupplyRow(getDb(), first.id, "2000-01-01");
    const supplies = SECTIONS.find((s) => s.id === "supplies")!;
    expect(await supplies.getStatus()).toEqual({ ready: true, label: "밀린 항목 1개" });
  });
});

describe("emotion-cards section status", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("reports not-yet-recorded before today's cards are saved", async () => {
    const emotionCards = SECTIONS.find((s) => s.id === "emotion-cards")!;
    expect(await emotionCards.getStatus()).toEqual({ ready: true, label: "아직 기록 전" });
  });

  test("reports complete once today's record is saved", async () => {
    await saveRecord(getDb(), todayISO(), [
      { name: "행복", emoji: "😊", color: "green" },
      { name: "슬픔", emoji: "😢", color: "blue" },
      { name: "화남", emoji: "😡", color: "red" },
    ]);
    const emotionCards = SECTIONS.find((s) => s.id === "emotion-cards")!;
    expect(await emotionCards.getStatus()).toEqual({ ready: true, label: "오늘 기록 완료" });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run lib/sections.test.ts`
Expected: FAIL (`getStatus()`가 아직 동기라 `await`한 값이 `Promise`가 아니라 그냥 객체라서 `toEqual` 비교는 사실 통과할 수도 있지만, `SECTIONS`가 여전히 옛 `getDb()`/동기 쿼리를 호출하므로 타입 에러 또는 `getAllChores` 등이 Promise를 반환해 `.filter`가 깨져서 실패한다)

- [ ] **Step 3: `lib/sections.ts`를 비동기로 재작성**

```ts
import { getDb } from "./db";
import { getAllChores } from "./chores-db";
import { getAllSupplies } from "./supplies-db";
import { computeChoreStatus, todayISO } from "./chores";
import { computeSupplyStatus } from "./supplies";
import { getRecord } from "./emotion-cards-db";

export type SectionStatus = { ready: false } | { ready: true; label: string };

export type Section = {
  id: string;
  name: string;
  icon: string;
  href: string;
  getStatus: () => Promise<SectionStatus>;
};

export const SECTIONS: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: async () => {
      const today = todayISO();
      const rows = await getAllChores(getDb());
      const overdueCount = rows.filter(
        (row) => computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
  {
    id: "supplies",
    name: "생필품 관리",
    icon: "🧴",
    href: "/supplies",
    getStatus: async () => {
      const today = todayISO();
      const rows = await getAllSupplies(getDb());
      const overdueCount = rows.filter(
        (row) => computeSupplyStatus(row.last_done_at, row.cycle_days, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: async () => {
      const hasToday = (await getRecord(getDb(), todayISO())) !== undefined;
      return hasToday
        ? { ready: true, label: "오늘 기록 완료" }
        : { ready: true, label: "아직 기록 전" };
    },
  },
  {
    id: "budget",
    name: "가계부",
    icon: "💰",
    href: "https://couple-finance-dusky.vercel.app",
    getStatus: async () => ({ ready: true, label: "바로가기" }),
  },
];
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run lib/sections.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/sections.ts lib/sections.test.ts
git commit -m "feat: make Section.getStatus async for Drizzle-backed queries"
```

---

### Task 5: `HomeView` 비동기 전환

**Files:**
- Modify: `app/home-view.tsx`
- Modify: `app/home-view.test.tsx`

**Interfaces:**
- Consumes: `Section`/`SectionStatus`/`SECTIONS` (`lib/sections.ts`, Task 4), `initSchema`/`setDbForTesting` (`lib/db.ts`)
- Produces: `app/home-view.tsx`: `export async function HomeView({ sections }: { sections?: Section[] }): Promise<JSX.Element>` (시그니처만 async로 바뀜, JSX 마크업은 동일)

- [ ] **Step 1: `app/home-view.test.tsx`를 async 호출 방식으로 교체**

`HomeView`가 async 함수가 되면 `render(<HomeView />)`처럼 JSX로 렌더링할 수 없다(테스트 환경의 일반 `ReactDOM` 렌더러는 async 컴포넌트를 지원하지 않음 — Next.js의 RSC 파이프라인에서만 가능). 대신 함수를 직접 호출해서 나온 JSX를 렌더링한다: `render(await HomeView({ sections: mockSections }))`.

```tsx
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { drizzle } from "drizzle-orm/pglite";
import { HomeView } from "./home-view";
import { initSchema, setDbForTesting } from "@/lib/db";
import type { Section } from "@/lib/sections";

const mockSections: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: async () => ({ ready: true, label: "3" }),
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: async () => ({ ready: false }),
  },
];

describe("HomeView", () => {
  test("renders every section's name and icon", async () => {
    render(await HomeView({ sections: mockSections }));
    expect(screen.getByText("청소 관리")).toBeDefined();
    expect(screen.getByText("🧹")).toBeDefined();
    expect(screen.getByText("감정카드")).toBeDefined();
    expect(screen.getByText("💌")).toBeDefined();
  });

  test("a ready section renders as a link to its route, showing its status label", async () => {
    render(await HomeView({ sections: mockSections }));
    const link = screen.getByRole("link", { name: /청소 관리/ });
    expect(link.getAttribute("href")).toBe("/cleaning");
    expect(screen.getByText("3")).toBeDefined();
  });

  test("a not-ready section shows a 준비중 badge and is not a link", async () => {
    render(await HomeView({ sections: mockSections }));
    expect(screen.getByText("준비중")).toBeDefined();
    expect(screen.queryByRole("link", { name: /감정카드/ })).toBeNull();
  });

  test("an external (http) href opens in a new tab with rel=noopener noreferrer", async () => {
    const externalSections: Section[] = [
      {
        id: "budget",
        name: "가계부",
        icon: "💰",
        href: "https://couple-finance-dusky.vercel.app",
        getStatus: async () => ({ ready: true, label: "바로가기" }),
      },
    ];
    render(await HomeView({ sections: externalSections }));
    const link = screen.getByRole("link", { name: /가계부/ });
    expect(link.getAttribute("href")).toBe("https://couple-finance-dusky.vercel.app");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("HomeView with the real default SECTIONS", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("renders the real default SECTIONS when no sections prop is given", async () => {
    render(await HomeView({}));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("우리집 👋")).toBeDefined();
  });
});
```

> 마지막 테스트는 실제 `SECTIONS`(청소/생필품/감정카드/가계부)를 렌더링하는데, 앞의 3개는 실제로 DB를 조회하므로 `setDbForTesting`으로 PGlite를 주입해야 한다. 이전(sqlite) 버전에서는 이 테스트가 override 없이 실행돼 실제로 로컬 `data/db.sqlite` 파일을 만들며 통과했는데, Neon 전환 후에는 override 없이 `getDb()`를 부르면 `DATABASE_URL is not set` 에러가 나서 반드시 override가 필요하다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run app/home-view.test.tsx`
Expected: FAIL (`HomeView`가 아직 동기라 `await HomeView(...)`이 JSX를 감싼 Promise가 아니라 그냥 JSX를 반환 — 하지만 `render(await ...)`은 JSX를 받아도 정상 동작하므로 실제로는 `section.getStatus()`가 실제 sync 함수라 mock의 `async` 버전과 시그니처가 안 맞아 TypeScript 컴파일 에러가 난다)

- [ ] **Step 3: `app/home-view.tsx`를 async로 재작성**

```tsx
import Link from "next/link";
import { SECTIONS, type Section, type SectionStatus } from "@/lib/sections";

function formatToday() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function SectionRow({
  section,
  status,
}: {
  section: Section;
  status: SectionStatus;
}) {
  const card = (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900 ${status.ready ? "" : "opacity-60 shadow-none"}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
        {section.icon}
      </span>
      <span className="flex-1 font-semibold text-zinc-900 dark:text-zinc-50">
        {section.name}
      </span>
      {status.ready ? (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {status.label}
        </span>
      ) : (
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          준비중
        </span>
      )}
    </div>
  );

  if (!status.ready) {
    return <div>{card}</div>;
  }

  const isExternal = section.href.startsWith("http");

  return (
    <Link
      href={section.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {card}
    </Link>
  );
}

export async function HomeView({
  sections = SECTIONS,
}: {
  sections?: Section[];
}) {
  const statuses = await Promise.all(sections.map((section) => section.getStatus()));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-1 flex-col px-5 py-10">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatToday()}
        </p>
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          우리집 👋
        </h1>
        <ul className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <li key={section.id}>
              <SectionRow section={section} status={statuses[index]} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
```

`app/page.tsx`는 변경할 필요 없다 — `<HomeView />`처럼 JSX로 쓰는 한, async 서버 컴포넌트는 Next.js RSC 렌더러가 알아서 await한다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run app/home-view.test.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add app/home-view.tsx app/home-view.test.tsx
git commit -m "feat: make HomeView async to await Drizzle-backed section statuses"
```

---

### Task 6: `/cleaning` 호출부 비동기 전환

**Files:**
- Modify: `app/cleaning/page.tsx`
- Modify: `app/cleaning/actions.ts`
- Modify: `app/cleaning/actions.test.ts`

**Interfaces:**
- Consumes: `getAllChores`/`insertChore`/`updateChoreRow`/`completeChoreRow`/`deleteChoreRow` (Task 1, 모두 `Promise` 반환), `getDb`/`initSchema`/`setDbForTesting` (`lib/db.ts`)
- Produces: 없음(최종 소비 지점 — 이 도메인의 마지막 레이어)

- [ ] **Step 1: `app/cleaning/actions.test.ts`를 PGlite 기반으로 교체**

```ts
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllChores } from "@/lib/chores-db";
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
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
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
    expect(await getAllChores(getDb())).toHaveLength(1);
  });

  test("createChore returns an error and inserts nothing on invalid input", async () => {
    const result = await createChore(formDataOf({ name: "", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    expect(result.error).toBeTruthy();
    expect(await getAllChores(getDb())).toHaveLength(0);
  });

  test("completeChore sets last_done_at", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = await getAllChores(getDb());
    await completeChore(row.id, "2026-07-27");
    const [updated] = await getAllChores(getDb());
    expect(updated.last_done_at).toBe("2026-07-27");
  });

  test("updateChore changes fields", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = await getAllChores(getDb());
    await updateChore(row.id, formDataOf({ name: "손빨래", icon: "🧴", intervalValue: "3", intervalUnit: "day" }));
    const [updated] = await getAllChores(getDb());
    expect(updated.name).toBe("손빨래");
    expect(updated.interval_unit).toBe("day");
  });

  test("deleteChore removes the row", async () => {
    await createChore(formDataOf({ name: "빨래", icon: "🧺", intervalValue: "1", intervalUnit: "week" }));
    const [row] = await getAllChores(getDb());
    await deleteChore(row.id);
    expect(await getAllChores(getDb())).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run app/cleaning/actions.test.ts`
Expected: FAIL

- [ ] **Step 3: `app/cleaning/actions.ts`에 `await` 추가**

```ts
export async function createChore(formData: FormData): Promise<{ error?: string }> {
  "use server";
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  await insertChore(getDb(), parsed);
  revalidatePath("/cleaning");
  revalidatePath("/");
  return {};
}

export async function updateChore(id: number, formData: FormData): Promise<{ error?: string }> {
  "use server";
  const parsed = parseChoreForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  await updateChoreRow(getDb(), id, parsed);
  revalidatePath("/cleaning");
  revalidatePath("/");
  return {};
}

export async function completeChore(id: number, doneDateISO: string): Promise<void> {
  "use server";
  await completeChoreRow(getDb(), id, doneDateISO);
  revalidatePath("/cleaning");
  revalidatePath("/");
}

export async function deleteChore(id: number): Promise<void> {
  "use server";
  await deleteChoreRow(getDb(), id);
  revalidatePath("/cleaning");
  revalidatePath("/");
}
```

(파일 상단의 `import`문과 `parseChoreForm` 함수는 그대로 둔다.)

- [ ] **Step 4: `app/cleaning/page.tsx`에 `async`/`await` 추가**

```tsx
export default async function CleaningPage() {
  const today = todayISO();
  const rows = await getAllChores(getDb());

  const chores: ChoreViewModel[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    intervalValue: row.interval_value,
    intervalUnit: row.interval_unit,
    status: computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today),
  }));

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
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
    </div>
  );
}
```

(다른 부분은 그대로 — `export default function CleaningPage()`를 `export default async function CleaningPage()`로 바꾸고 `getAllChores(getDb())` 앞에 `await`만 추가)

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run app/cleaning/actions.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/cleaning/page.tsx app/cleaning/actions.ts app/cleaning/actions.test.ts
git commit -m "feat: await Drizzle-backed queries in /cleaning"
```

---

### Task 7: `/supplies` 호출부 비동기 전환

**Files:**
- Modify: `app/supplies/page.tsx`
- Modify: `app/supplies/actions.ts`
- Modify: `app/supplies/actions.test.ts`

**Interfaces:**
- Consumes: `getAllSupplies`/`completeSupplyRow` (Task 2, `Promise` 반환), `getDb`/`initSchema`/`setDbForTesting`
- Produces: 없음

- [ ] **Step 1: `app/supplies/actions.test.ts`를 PGlite 기반으로 교체**

```ts
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getAllSupplies } from "@/lib/supplies-db";
import { completeSupply } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("completeSupply", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("sets last_done_at for the given id", async () => {
    const [first] = await getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const updated = (await getAllSupplies(getDb())).find((r) => r.id === first.id)!;
    expect(updated.last_done_at).toBe("2026-07-01");
  });

  test("does not affect other rows", async () => {
    const [first, second] = await getAllSupplies(getDb());
    await completeSupply(first.id, "2026-07-01");
    const untouched = (await getAllSupplies(getDb())).find((r) => r.id === second.id)!;
    expect(untouched.last_done_at).not.toBe("2026-07-01");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run app/supplies/actions.test.ts`
Expected: FAIL

- [ ] **Step 3: `app/supplies/actions.ts`에 `await` 추가**

```ts
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { completeSupplyRow } from "@/lib/supplies-db";

export async function completeSupply(id: number, doneDateISO: string): Promise<void> {
  "use server";
  await completeSupplyRow(getDb(), id, doneDateISO);
  revalidatePath("/supplies");
  revalidatePath("/");
}
```

- [ ] **Step 4: `app/supplies/page.tsx`에 `async`/`await` 추가**

```tsx
export default async function SuppliesPage() {
  const today = todayISO();
  const rows = await getAllSupplies(getDb());

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

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run app/supplies/actions.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/supplies/page.tsx app/supplies/actions.ts app/supplies/actions.test.ts
git commit -m "feat: await Drizzle-backed queries in /supplies"
```

---

### Task 8: `/emotion-cards` 호출부 비동기 전환

**Files:**
- Modify: `app/emotion-cards/page.tsx`
- Modify: `app/emotion-cards/select/page.tsx`
- Modify: `app/emotion-cards/result/page.tsx`
- Modify: `app/emotion-cards/history/page.tsx`
- Modify: `app/emotion-cards/history/[date]/page.tsx`
- Modify: `app/emotion-cards/actions.ts`
- Modify: `app/emotion-cards/actions.test.ts`

**Interfaces:**
- Consumes: `getRecord`/`getCustomEmotions`/`insertCustomEmotion`/`saveRecord`/`getAllRecordsDesc` (Task 3, `Promise` 반환), `getDb`/`initSchema`/`setDbForTesting`
- Produces: 없음

- [ ] **Step 1: `app/emotion-cards/actions.test.ts`를 PGlite 기반으로 교체**

```ts
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { initSchema, setDbForTesting, getDb } from "@/lib/db";
import { getRecord, getCustomEmotions } from "@/lib/emotion-cards-db";
import { addCustomEmotion, saveRecord } from "./actions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("Server Actions against an in-memory db", () => {
  beforeEach(async () => {
    const db = drizzle();
    await initSchema(db);
    setDbForTesting(db);
  });

  afterEach(() => {
    setDbForTesting(null);
  });

  test("addCustomEmotion rejects an empty name", async () => {
    const result = await addCustomEmotion("   ");
    expect(result.error).toBeTruthy();
    expect(await getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("addCustomEmotion inserts a new custom emotion and returns it", async () => {
    const result = await addCustomEmotion("허탈함");
    expect(result.emotion).toEqual({ name: "허탈함", emoji: "💭", color: "purple" });
    expect(await getCustomEmotions(getDb())).toHaveLength(1);
  });

  test("addCustomEmotion returns the existing preset match instead of duplicating", async () => {
    const result = await addCustomEmotion("행복");
    expect(result.emotion).toEqual({ name: "행복", emoji: "😊", color: "green" });
    expect(await getCustomEmotions(getDb())).toHaveLength(0);
  });

  test("saveRecord rejects fewer than 3 emotions", async () => {
    const result = await saveRecord("2026-07-28", [{ name: "행복", emoji: "😊", color: "green" }]);
    expect(result.error).toBeTruthy();
    expect(await getRecord(getDb(), "2026-07-28")).toBeUndefined();
  });

  test("saveRecord saves exactly 3 emotions for the date", async () => {
    const emotions = [
      { name: "행복", emoji: "😊", color: "green" as const },
      { name: "슬픔", emoji: "😢", color: "blue" as const },
      { name: "화남", emoji: "😡", color: "red" as const },
    ];
    const result = await saveRecord("2026-07-28", emotions);
    expect(result).toEqual({});
    expect(await getRecord(getDb(), "2026-07-28")).toEqual(emotions);
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
    expect(await getRecord(getDb(), "2026-07-28")).toEqual(second);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx vitest run app/emotion-cards/actions.test.ts`
Expected: FAIL

- [ ] **Step 3: `app/emotion-cards/actions.ts`에 `await` 추가**

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

  const existing = [...EMOTIONS, ...(await getCustomEmotions(getDb()))];
  const emotion = await insertCustomEmotion(getDb(), trimmed, existing);
  return { emotion };
}

export async function saveRecord(date: string, emotions: Emotion[]): Promise<{ error?: string }> {
  "use server";
  if (emotions.length !== 3) {
    return { error: "카드를 정확히 3장 선택해주세요." };
  }
  await saveRecordRow(getDb(), date, emotions);
  revalidatePath("/emotion-cards");
  revalidatePath("/emotion-cards/history");
  revalidatePath("/");
  return {};
}
```

- [ ] **Step 4: 5개 페이지 파일에 `async`/`await` 추가**

`app/emotion-cards/page.tsx`:
```tsx
export default async function EmotionCardsPage() {
  const today = todayISO();
  const submitted = (await getRecord(getDb(), today)) !== undefined;
  const todayLabel = format(parseISO(today), "M월 d일 EEEE", { locale: ko });
  // ... 이하 return 블록은 그대로
```

`app/emotion-cards/select/page.tsx`:
```tsx
export default async function SelectPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const isEdit = edit === "1";
  const today = todayISO();
  const existing = await getRecord(getDb(), today);

  if (existing && !isEdit) {
    redirect("/emotion-cards/result");
  }

  const customEmotions = await getCustomEmotions(getDb());
  // ... 이하 return 블록은 그대로
```

`app/emotion-cards/result/page.tsx`:
```tsx
export default async function ResultPage() {
  const today = todayISO();
  const cards = await getRecord(getDb(), today);

  if (!cards) {
    redirect("/emotion-cards");
  }
  // ... 이하 return 블록은 그대로
```

`app/emotion-cards/history/page.tsx`:
```tsx
export default async function HistoryPage() {
  const records = await getAllRecordsDesc(getDb());
  // ... 이하 return 블록은 그대로
```

`app/emotion-cards/history/[date]/page.tsx`:
```tsx
export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const cards = ISO_DATE_RE.test(date) ? await getRecord(getDb(), date) : undefined;

  if (!cards) {
    redirect("/emotion-cards/history");
  }
  // ... 이하 return 블록은 그대로
```

각 파일에서 바뀌는 건 함수 시그니처에 `async` 추가 + 해당 DB 호출 앞에 `await` 추가뿐이다. import문, JSX, 나머지 로직은 전부 그대로 둔다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run app/emotion-cards/actions.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add app/emotion-cards/page.tsx app/emotion-cards/select/page.tsx app/emotion-cards/result/page.tsx app/emotion-cards/history/page.tsx "app/emotion-cards/history/[date]/page.tsx" app/emotion-cards/actions.ts app/emotion-cards/actions.test.ts
git commit -m "feat: await Drizzle-backed queries in /emotion-cards"
```

---

### Task 9: 전체 스위트/타입/린트 검증

**Files:** 없음(변경 없이 전체 검증만)

**Interfaces:**
- Consumes: Task 1-8에서 만들어진 모든 것
- Produces: 없음 — 이 태스크가 통과하면 저장소 계층 전환이 끝난 것

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: 전부 PASS (더 이상 `node:sqlite`/`DatabaseSync`를 참조하는 파일이 없어야 한다)

- [ ] **Step 2: 남은 `node:sqlite` 참조가 없는지 확인**

Run: `grep -rl "node:sqlite\|DatabaseSync" app lib 2>/dev/null || echo "none"`
Expected: `none`

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 린트**

Run: `npm run lint`
Expected: 에러 없음

- [ ] **Step 5: 프로덕션 빌드가 되는지 확인**

Run: `npm run build`
Expected: 빌드 성공. `DATABASE_URL`이 로컬에 아직 없다면(Task 10 이전) 빌드 시점에 `getDb()`가 호출되는 정적 생성 경로가 있는지 확인 — `app/page.tsx`는 `revalidate = 3600`이라 빌드 시점에 실행되며 내부적으로 `HomeView`→각 섹션의 `getStatus()`→`getDb()`를 호출한다. `DATABASE_URL`이 없으면 **이 시점에 빌드가 실패한다.** 실패하면 Task 10에서 `DATABASE_URL`을 받은 뒤에 이 Step을 다시 확인한다(정상적인 순서이지 버그가 아니다).

- [ ] **Step 6: 커밋 (변경 사항이 있다면)**

이 태스크는 보통 코드 변경이 없다 — Step 1-5에서 문제가 발견되면 그 자리에서 고치고 커밋한다. 문제가 없으면 커밋할 것도 없다.

---

### Task 10: Neon 프로비저닝 + 실제 DB에 스키마 반영 (사용자 입력 필요)

**이 태스크는 사용자가 아래를 하기 전까지 진행할 수 없다:**
1. neon.tech 또는 Vercel 대시보드 Storage 탭에서 "우리집" 전용 새 Neon 프로젝트 생성
2. 연결 문자열(`DATABASE_URL`)을 이 대화에 알려주기(또는 직접 `.env.local`에 넣어주기)

**Files:**
- Create: `.env.local` (커밋되지 않음 — `.gitignore`의 `.env*` 규칙에 이미 포함됨)

- [ ] **Step 1: `.env.local`에 연결 문자열 기록**

```
DATABASE_URL=<사용자가 제공한 Neon 연결 문자열>
```

- [ ] **Step 2: Neon에 스키마 반영**

Run: `npx drizzle-kit push`
Expected: `chores`, `supplies`, `custom_emotions`, `emotion_records` 4개 테이블이 생성됐다는 출력. 대화형 프롬프트가 뜨면(컬럼/제약 변경 확인) 신규 테이블 생성이므로 그대로 진행(yes)한다.

- [ ] **Step 3: 로컬 개발 서버로 수동 확인**

Run: `npm run dev`

브라우저(또는 `curl`)로 아래를 확인한다:
- `/` — 4개 섹션 배지가 전부 뜨는지(청소/생필품 "전부 완료", 감정카드 "아직 기록 전", 가계부 "바로가기")
- `/cleaning` — 항목 추가 → 완료 처리 → 홈 배지가 갱신되는지
- `/supplies` — 21개 항목이 카테고리별로 보이는지, 완료 처리가 되는지
- `/emotion-cards` — 감정 3장 선택 → 저장 → 결과 화면 → 기록 목록에 뜨는지

- [ ] **Step 4: 문제없으면 진행 상황을 사용자에게 보고**

이 단계는 코드 커밋이 없다(환경 설정/인프라 확인 단계).

---

### Task 11: Vercel 배포 반영 (사용자 입력 필요)

**이 태스크는 Task 10에서 얻은 `DATABASE_URL`이 있어야 진행 가능하다.**

- [ ] **Step 1: Vercel 프로젝트(`woorijip`)에 환경변수 등록**

Vercel 대시보드 → `woorijip` 프로젝트 → Settings → Environment Variables에서 `DATABASE_URL`을 Production/Preview/Development 전체에 등록(로컬과 동일한 값 — dev/prod 단일 DB 공용으로 결정했으므로).

- [ ] **Step 2: 재배포**

```bash
git push origin master
```

(또는 Vercel 대시보드에서 최신 커밋으로 수동 Redeploy)

- [ ] **Step 3: 프로덕션 스모크 테스트**

배포된 `https://woorijip-iota.vercel.app`에서 `/`, `/cleaning`, `/supplies`, `/emotion-cards`를 콜드스타트 포함 여러 번 반복 요청해서 더 이상 간헐적 500이 나지 않는지 확인한다(기존 버그는 콜드스타트/인스턴스 상태에 따라 간헐적으로 발생했으므로 한 번만 확인하고 끝내지 않는다).

- [ ] **Step 4: 완료 보고**

이 시점에 이번 마이그레이션의 원래 목표(간헐적 500 제거)가 실제로 달성됐는지 최종 확인하고 사용자에게 보고한다.
