# 생활용품 교체주기 리마인더 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 30가지 생활용품의 교체/관리 주기를 이미지와 동일한 레이아웃으로 보여주고, 카드를 클릭하면 확인 후 오늘 날짜로 주기가 리셋되는 정적 웹페이지를 만든다.

**Architecture:** 빌드 도구 없는 순수 HTML/CSS/JS(ES 모듈) 정적 페이지. 데이터(`data.js`), 순수 계산 로직(`reminder.js`), localStorage 래퍼(`storage.js`), DOM 렌더링/이벤트(`app.js`)를 파일 단위로 분리한다. 순수 로직/저장소 레이어는 Node 내장 테스트 러너로 자동 검증하고, DOM/렌더링은 브라우저 수동 검증으로 확인한다.

**Tech Stack:** Vanilla JS (ES modules), HTML5, CSS3, Node.js 내장 `node:test` + `node:assert/strict` (개발 시 테스트 실행용, 배포에는 불필요).

## Global Constraints

- 서버, 로그인, 빌드 도구, npm 의존성 없이 정적 파일만으로 동작해야 한다 (`docs/superpowers/specs/2026-07-27-household-reminder-design.md` 기술 스택 절).
- 데이터는 브라우저 `localStorage`에만 저장한다. 기기 간 동기화는 구현하지 않는다.
- 범위로 표기된 주기는 **최솟값**을 일 수로 환산해서 사용한다 (예: "2~4주" → 14일).
- `고데기`(id: `curling-iron`)와 `향초`(id: `candle`)는 `cycleDays: null`로 두고 D-day/배지 계산에서 항상 제외한다.
- 앱 최초 실행 시(저장된 값이 없을 때) 각 항목의 `lastDoneDate`는 오늘 날짜로 자동 초기화한다.
- 카드를 클릭하면 즉시 리셋되지 않고, 확인 토스트를 거친 뒤에만 리셋된다.
- 5개 카테고리 컬럼(욕실용품/주방용품/침실&리빙/개인관리/가전&설비)과 이미지의 색 구분을 유지한다.

---

### Task 1: 프로젝트 스캐폴드 + 데이터 모델

**Files:**
- Create: `package.json`
- Create: `data.js`
- Test: `test/data.test.js`

**Interfaces:**
- Produces: `export const ITEMS` — `{ id: string, category: string, name: string, icon: string, cycleDays: number|null, cycleLabel: string }[]`, 길이 30. `export const CATEGORIES` — `{ id: string, label: string }[]`, 5개.

- [ ] **Step 1: `package.json` 작성**

```json
{
  "name": "household-reminder",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (`test/data.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ITEMS, CATEGORIES } from "../data.js";

test("has exactly 30 items", () => {
  assert.equal(ITEMS.length, 30);
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
    assert.equal(typeof item.cycleLabel, "string");
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

test("only curling-iron and candle have null cycleDays", () => {
  const nullItems = ITEMS.filter((i) => i.cycleDays === null)
    .map((i) => i.id)
    .sort();
  assert.deepEqual(nullItems, ["candle", "curling-iron"]);
});

test("has exactly 5 categories matching the image columns", () => {
  assert.deepEqual(
    CATEGORIES.map((c) => c.id),
    ["bathroom", "kitchen", "bedroom", "personal", "appliance"]
  );
});
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `node --test test/`
Expected: FAIL — `data.js` 모듈을 찾을 수 없다는 에러 (`Cannot find module '../data.js'`).

- [ ] **Step 4: `data.js` 구현**

```js
export const CATEGORIES = [
  { id: "bathroom", label: "욕실용품" },
  { id: "kitchen", label: "주방용품" },
  { id: "bedroom", label: "침실&리빙" },
  { id: "personal", label: "개인관리" },
  { id: "appliance", label: "가전&설비" },
];

export const ITEMS = [
  // 욕실용품
  { id: "toothbrush", category: "bathroom", name: "칫솔", icon: "🪥", cycleDays: 90, cycleLabel: "약 3개월" },
  { id: "shower-filter", category: "bathroom", name: "샤워필터", icon: "🚿", cycleDays: 60, cycleLabel: "약 2개월" },
  { id: "razor", category: "bathroom", name: "면도기", icon: "🪒", cycleDays: 14, cycleLabel: "약 2주" },
  { id: "shower-puff", category: "bathroom", name: "샤워볼", icon: "🧽", cycleDays: 30, cycleLabel: "약 1개월" },
  { id: "lens-case", category: "bathroom", name: "렌즈통", icon: "🥽", cycleDays: 30, cycleLabel: "약 1개월" },
  { id: "towel", category: "bathroom", name: "수건", icon: "🧺", cycleDays: 365, cycleLabel: "약 1년" },
  { id: "toilet-brush", category: "bathroom", name: "변기솔", icon: "🚽", cycleDays: 180, cycleLabel: "약 6개월" },

  // 주방용품
  { id: "dish-scrubber", category: "kitchen", name: "수세미", icon: "🧽", cycleDays: 14, cycleLabel: "약 2~4주" },
  { id: "kitchen-sponge", category: "kitchen", name: "주방스펀지", icon: "🫧", cycleDays: 14, cycleLabel: "약 2주" },
  { id: "dish-towel", category: "kitchen", name: "행주", icon: "🧻", cycleDays: 30, cycleLabel: "약 1~2개월" },
  { id: "container-seal", category: "kitchen", name: "밀폐용기 고무패킹", icon: "🥡", cycleDays: 180, cycleLabel: "약 6개월" },
  { id: "rubber-gloves", category: "kitchen", name: "고무장갑", icon: "🧤", cycleDays: 60, cycleLabel: "약 2~3개월" },
  { id: "cutting-board", category: "kitchen", name: "도마", icon: "🔪", cycleDays: 365, cycleLabel: "약 1년" },
  { id: "electric-kettle", category: "kitchen", name: "전기포트", icon: "🫖", cycleDays: 730, cycleLabel: "약 2~3년" },

  // 침실&리빙
  { id: "pillow-filling", category: "bedroom", name: "베개솜", icon: "🛏️", cycleDays: 365, cycleLabel: "약 1~2년" },
  { id: "pillow-cover", category: "bedroom", name: "베개커버(세탁)", icon: "🧺", cycleDays: 7, cycleLabel: "약 1주" },
  { id: "blanket", category: "bedroom", name: "이불(세탁)", icon: "🛌", cycleDays: 30, cycleLabel: "약 1개월" },
  { id: "mattress", category: "bedroom", name: "매트리스", icon: "🛋️", cycleDays: 1825, cycleLabel: "약 5~7년" },
  { id: "curtain", category: "bedroom", name: "커튼(세탁)", icon: "🪟", cycleDays: 90, cycleLabel: "약 3개월" },

  // 개인관리
  { id: "comb", category: "personal", name: "빗", icon: "🪮", cycleDays: 180, cycleLabel: "약 6개월" },
  { id: "hairbrush", category: "personal", name: "헤어브러쉬", icon: "🖌️", cycleDays: 365, cycleLabel: "약 1년" },
  { id: "curling-iron", category: "personal", name: "고데기", icon: "🔥", cycleDays: null, cycleLabel: "탄내나 열이 약해지면 교체" },
  { id: "eye-drops", category: "personal", name: "인공눈물", icon: "💧", cycleDays: 30, cycleLabel: "개봉 후 1~2개월" },
  { id: "perfume", category: "personal", name: "향수", icon: "🧴", cycleDays: 730, cycleLabel: "약 2년" },

  // 가전&설비
  { id: "power-strip", category: "appliance", name: "멀티탭", icon: "🔌", cycleDays: 1095, cycleLabel: "약 3~5년" },
  { id: "air-purifier-filter", category: "appliance", name: "공기청정기 필터", icon: "🌬️", cycleDays: 180, cycleLabel: "약 6개월~1년" },
  { id: "ac-filter", category: "appliance", name: "에어컨 필터", icon: "❄️", cycleDays: 14, cycleLabel: "2~4주(청소)" },
  { id: "fridge-deodorizer", category: "appliance", name: "냉장고 탈취제", icon: "🧊", cycleDays: 90, cycleLabel: "약 3개월" },
  { id: "washer-filter", category: "appliance", name: "세탁기 필터", icon: "🌀", cycleDays: 90, cycleLabel: "약 3개월" },
  { id: "candle", category: "appliance", name: "향초", icon: "🕯️", cycleDays: null, cycleLabel: "약 100~150시간 사용" },
];
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test test/`
Expected: PASS — 5개 테스트 모두 통과.

- [ ] **Step 6: 커밋**

```bash
git add package.json data.js test/data.test.js
git commit -m "feat: add 30-item household reminder data model"
```

---

### Task 2: 주기 계산 순수 함수 (`reminder.js`)

**Files:**
- Create: `reminder.js`
- Test: `test/reminder.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수, 외부 의존 없음)
- Produces:
  - `todayISO(now = new Date()) -> "YYYY-MM-DD"`
  - `addDays(isoDate: string, days: number) -> "YYYY-MM-DD"`
  - `daysBetween(fromISO: string, toISO: string) -> number` (from 기준 to까지 며칠인지, 음수 가능)
  - `computeStatus(lastDoneISO: string, cycleDays: number|null, todayISODate: string) -> { dueDate: string|null, daysRemaining: number|null, overdue: boolean }`

- [ ] **Step 1: 실패하는 테스트 작성 (`test/reminder.test.js`)**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, computeStatus } from "../reminder.js";

test("addDays adds days across a month boundary", () => {
  assert.equal(addDays("2026-01-30", 5), "2026-02-04");
});

test("addDays handles a year boundary", () => {
  assert.equal(addDays("2025-12-28", 10), "2026-01-07");
});

test("daysBetween computes a positive difference", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-10"), 9);
});

test("daysBetween computes a negative difference for past dates", () => {
  assert.equal(daysBetween("2026-01-10", "2026-01-01"), -9);
});

test("computeStatus is not overdue when the due date is in the future", () => {
  const status = computeStatus("2026-07-01", 90, "2026-07-27");
  assert.equal(status.dueDate, "2026-09-29");
  assert.equal(status.overdue, false);
  assert.ok(status.daysRemaining > 0);
});

test("computeStatus is overdue once the due date has passed", () => {
  const status = computeStatus("2026-01-01", 14, "2026-07-27");
  assert.equal(status.overdue, true);
  assert.ok(status.daysRemaining <= 0);
});

test("computeStatus treats the exact due day as overdue", () => {
  const status = computeStatus("2026-07-01", 30, "2026-07-31");
  assert.equal(status.dueDate, "2026-07-31");
  assert.equal(status.daysRemaining, 0);
  assert.equal(status.overdue, true);
});

test("computeStatus returns nulls for condition-based items (cycleDays null)", () => {
  const status = computeStatus("2026-01-01", null, "2026-07-27");
  assert.deepEqual(status, { dueDate: null, daysRemaining: null, overdue: false });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/`
Expected: FAIL — `reminder.js` 모듈을 찾을 수 없다는 에러.

- [ ] **Step 3: `reminder.js` 구현**

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / MS_PER_DAY);
}

export function computeStatus(lastDoneISO, cycleDays, todayISODate) {
  if (cycleDays === null) {
    return { dueDate: null, daysRemaining: null, overdue: false };
  }
  const dueDate = addDays(lastDoneISO, cycleDays);
  const daysRemaining = daysBetween(todayISODate, dueDate);
  return { dueDate, daysRemaining, overdue: daysRemaining <= 0 };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/`
Expected: PASS — Task 1 테스트 5개 + Task 2 테스트 8개 모두 통과.

- [ ] **Step 5: 커밋**

```bash
git add reminder.js test/reminder.test.js
git commit -m "feat: add pure date/cycle calculation functions"
```

---

### Task 3: localStorage 저장소 레이어 (`storage.js`)

**Files:**
- Create: `storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: 없음. `store` 인자로 `{ getItem(key): string|null, setItem(key, value): void }` 형태(Web Storage API와 동일)의 객체를 주입받는다. 브라우저에서는 `window.localStorage`를, 테스트에서는 in-memory mock을 전달한다.
- Produces:
  - `getLastDone(store, id: string) -> string|null`
  - `setLastDone(store, id: string, isoDate: string) -> void`
  - `ensureInitialized(store, items: {id: string}[], todayISODate: string) -> void`

- [ ] **Step 1: 실패하는 테스트 작성 (`test/storage.test.js`)**

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test test/`
Expected: FAIL — `storage.js` 모듈을 찾을 수 없다는 에러.

- [ ] **Step 3: `storage.js` 구현**

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/`
Expected: PASS — 지금까지의 테스트 전부(Task1 5개 + Task2 8개 + Task3 6개) 통과.

- [ ] **Step 5: 커밋**

```bash
git add storage.js test/storage.test.js
git commit -m "feat: add localStorage-backed persistence layer"
```

---

### Task 4: 정적 레이아웃 + 읽기 전용 렌더링

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `app.js`

**Interfaces:**
- Consumes: `ITEMS`, `CATEGORIES` (Task 1), `todayISO`, `computeStatus` (Task 2), `getLastDone`, `ensureInitialized` (Task 3).
- Produces: 브라우저 전역 렌더링 진입점 `renderBoard()` (다음 태스크에서 재사용).

이 태스크에는 자동화 테스트가 없다 (설계 문서의 테스트 방침: DOM은 브라우저 수동 검증). 대신 Step 3에 수동 검증 체크리스트를 둔다.

- [ ] **Step 1: `index.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>생활용품 교체주기 리마인더</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header class="page-header">
    <h1>생활용품 30가지 교체 및 관리 주기 총정리</h1>
    <p class="page-subtitle">항목을 클릭하면 오늘 날짜로 교체/관리 완료 처리됩니다.</p>
  </header>
  <main id="board" class="board"></main>
  <div id="toast" class="toast" hidden>
    <p id="toast-message"></p>
    <div class="toast-actions">
      <button id="toast-confirm" type="button">완료로 표시</button>
      <button id="toast-cancel" type="button">취소</button>
    </div>
  </div>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `style.css` 작성**

```css
:root {
  --color-bathroom: #4a90d9;
  --color-kitchen: #4caf7d;
  --color-bedroom: #e05a7e;
  --color-personal: #9b6bd9;
  --color-appliance: #2bb3a3;
  --card-bg: #ffffff;
  --page-bg: #f4f6f8;
  --text-main: #222222;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  background: var(--page-bg);
  color: var(--text-main);
}

.page-header {
  text-align: center;
  padding: 24px 16px 8px;
}

.page-header h1 {
  font-size: 1.4rem;
  margin: 0 0 4px;
}

.page-subtitle {
  margin: 0;
  color: #666666;
  font-size: 0.9rem;
}

.board {
  display: flex;
  gap: 12px;
  padding: 16px;
  align-items: flex-start;
}

.column {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 10px;
  overflow: hidden;
  background: var(--card-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.column-header {
  color: #ffffff;
  text-align: center;
  font-weight: 700;
  margin: 0;
  padding: 10px 8px;
  font-size: 1rem;
}

.column[data-category="bathroom"] .column-header { background: var(--color-bathroom); }
.column[data-category="kitchen"] .column-header { background: var(--color-kitchen); }
.column[data-category="bedroom"] .column-header { background: var(--color-bedroom); }
.column[data-category="personal"] .column-header { background: var(--color-personal); }
.column[data-category="appliance"] .column-header { background: var(--color-appliance); }

.card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #eeeeee;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
  text-align: left;
  font: inherit;
  width: 100%;
}

.card:hover {
  border-color: #cccccc;
}

.card-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.card-text {
  display: flex;
  flex-direction: column;
}

.card-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.card-cycle {
  font-size: 0.75rem;
  color: #777777;
}

.card-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #e03131;
  color: #ffffff;
  border-radius: 999px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 700;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  background: #222222;
  color: #ffffff;
  padding: 14px 18px;
  border-radius: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 260px;
  z-index: 10;
}

.toast[hidden] {
  display: none;
}

.toast-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.toast-actions button {
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
}

#toast-confirm {
  background: #2bb3a3;
  color: #ffffff;
}

#toast-cancel {
  background: #444444;
  color: #ffffff;
}

@media (max-width: 720px) {
  .board {
    flex-direction: column;
  }
}
```

- [ ] **Step 3: `app.js` 작성 (읽기 전용 렌더링)**

```js
import { ITEMS, CATEGORIES } from "./data.js";
import { todayISO, computeStatus } from "./reminder.js";
import { getLastDone, ensureInitialized } from "./storage.js";

const store = window.localStorage;

function renderBoard() {
  const today = todayISO();
  ensureInitialized(store, ITEMS, today);

  const board = document.getElementById("board");
  board.innerHTML = "";

  for (const category of CATEGORIES) {
    const column = document.createElement("section");
    column.className = "column";
    column.dataset.category = category.id;

    const header = document.createElement("h2");
    header.className = "column-header";
    header.textContent = category.label;
    column.appendChild(header);

    const list = document.createElement("div");
    list.className = "card-list";

    for (const item of ITEMS.filter((i) => i.category === category.id)) {
      list.appendChild(renderCard(item, today));
    }

    column.appendChild(list);
    board.appendChild(column);
  }
}

function renderCard(item, today) {
  const lastDone = getLastDone(store, item.id);
  const status = computeStatus(lastDone, item.cycleDays, today);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.id = item.id;
  card.title = status.dueDate
    ? `마지막 교체일: ${lastDone}\n${
        status.daysRemaining >= 0
          ? `D-${status.daysRemaining}`
          : `${-status.daysRemaining}일 초과`
      }`
    : `마지막 교체일: ${lastDone}`;

  const icon = document.createElement("span");
  icon.className = "card-icon";
  icon.textContent = item.icon;

  const textWrap = document.createElement("span");
  textWrap.className = "card-text";

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;

  const cycle = document.createElement("span");
  cycle.className = "card-cycle";
  cycle.textContent = item.cycleLabel;

  textWrap.appendChild(name);
  textWrap.appendChild(cycle);

  card.appendChild(icon);
  card.appendChild(textWrap);

  if (status.overdue) {
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = "!";
    card.appendChild(badge);
  }

  return card;
}

renderBoard();
```

- [ ] **Step 4: 수동 검증**

`index.html`을 브라우저에서 직접 연다(더블클릭 또는 `start index.html`). 다음을 확인한다:

- 5개 컬럼(욕실용품/주방용품/침실&리빙/개인관리/가전&설비)이 각각 다른 색 헤더로 표시된다.
- 30개 카드가 모두 렌더링되고, 아이콘/이름/주기 문구가 보인다.
- 최초 로드 시 어떤 카드에도 빨간 느낌표 배지가 없다 (첫 실행이라 `ensureInitialized`가 오늘 날짜로 채웠기 때문).
- 브라우저 개발자 도구 → Application → Local Storage에 `household-reminder:last-done` 키로 30개 항목의 오늘 날짜가 저장되어 있다.
- 창 너비를 좁혀보면(모바일 폭) 컬럼이 세로로 쌓인다.

- [ ] **Step 5: 커밋**

```bash
git add index.html style.css app.js
git commit -m "feat: render reminder board with category columns and overdue badges"
```

---

### Task 5: 클릭 → 확인 토스트 → 리셋 인터랙션

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `setLastDone` (Task 3, 이미 import된 `getLastDone`/`ensureInitialized`에 추가).
- Produces: 없음 (최종 사용자 인터랙션, 다른 파일이 의존하지 않음).

자동화 테스트 없음 (DOM 인터랙션은 브라우저 수동 검증). Step 2에 수동 검증 체크리스트를 둔다.

- [ ] **Step 1: `app.js` 전체를 아래 내용으로 교체**

```js
import { ITEMS, CATEGORIES } from "./data.js";
import { todayISO, computeStatus } from "./reminder.js";
import { getLastDone, setLastDone, ensureInitialized } from "./storage.js";

const store = window.localStorage;
let pendingItemId = null;

function renderBoard() {
  const today = todayISO();
  ensureInitialized(store, ITEMS, today);

  const board = document.getElementById("board");
  board.innerHTML = "";

  for (const category of CATEGORIES) {
    const column = document.createElement("section");
    column.className = "column";
    column.dataset.category = category.id;

    const header = document.createElement("h2");
    header.className = "column-header";
    header.textContent = category.label;
    column.appendChild(header);

    const list = document.createElement("div");
    list.className = "card-list";

    for (const item of ITEMS.filter((i) => i.category === category.id)) {
      list.appendChild(renderCard(item, today));
    }

    column.appendChild(list);
    board.appendChild(column);
  }
}

function renderCard(item, today) {
  const lastDone = getLastDone(store, item.id);
  const status = computeStatus(lastDone, item.cycleDays, today);

  const card = document.createElement("button");
  card.type = "button";
  card.className = "card";
  card.dataset.id = item.id;
  card.title = status.dueDate
    ? `마지막 교체일: ${lastDone}\n${
        status.daysRemaining >= 0
          ? `D-${status.daysRemaining}`
          : `${-status.daysRemaining}일 초과`
      }`
    : `마지막 교체일: ${lastDone}`;

  const icon = document.createElement("span");
  icon.className = "card-icon";
  icon.textContent = item.icon;

  const textWrap = document.createElement("span");
  textWrap.className = "card-text";

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = item.name;

  const cycle = document.createElement("span");
  cycle.className = "card-cycle";
  cycle.textContent = item.cycleLabel;

  textWrap.appendChild(name);
  textWrap.appendChild(cycle);

  card.appendChild(icon);
  card.appendChild(textWrap);

  if (status.overdue) {
    const badge = document.createElement("span");
    badge.className = "card-badge";
    badge.textContent = "!";
    card.appendChild(badge);
  }

  return card;
}

function findItem(id) {
  return ITEMS.find((i) => i.id === id);
}

function showToast(item) {
  pendingItemId = item.id;
  document.getElementById("toast-message").textContent =
    `${item.name} 교체(관리) 완료로 표시할까요?`;
  document.getElementById("toast").hidden = false;
}

function hideToast() {
  pendingItemId = null;
  document.getElementById("toast").hidden = true;
}

function confirmReset() {
  if (!pendingItemId) return;
  setLastDone(store, pendingItemId, todayISO());
  hideToast();
  renderBoard();
}

document.getElementById("board").addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  if (!card) return;
  const item = findItem(card.dataset.id);
  if (item) showToast(item);
});

document.getElementById("toast-confirm").addEventListener("click", confirmReset);
document.getElementById("toast-cancel").addEventListener("click", hideToast);

renderBoard();
```

- [ ] **Step 2: 수동 검증**

브라우저에서 `index.html`을 새로고침한 뒤 다음을 확인한다:

1. 아무 카드나 클릭하면 화면 하단에 "{항목명} 교체(관리) 완료로 표시할까요?" 토스트가 뜬다.
2. "취소"를 누르면 토스트가 사라지고 아무것도 변경되지 않는다 (카드에 마우스를 올려 툴팁의 마지막 교체일이 그대로인지 확인).
3. 다시 카드를 클릭하고 "완료로 표시"를 누르면 토스트가 사라지고, 해당 카드의 툴팁 속 마지막 교체일이 오늘 날짜로 갱신된다.
4. 개발자 도구 콘솔에서 아래 코드를 실행해 "칫솔"을 과거 날짜로 강제 설정한 뒤 새로고침한다:
   ```js
   const state = JSON.parse(localStorage.getItem("household-reminder:last-done"));
   state.toothbrush = "2020-01-01";
   localStorage.setItem("household-reminder:last-done", JSON.stringify(state));
   ```
   새로고침 후 "칫솔" 카드에 빨간 느낌표 배지가 나타나는지 확인한다.
5. 같은 방식으로 `curling-iron`(고데기) 또는 `candle`(향초)의 날짜를 아주 오래된 날짜로 바꿔도, 배지가 절대 나타나지 않는지 확인한다 (`cycleDays: null` 예외 처리 검증).

- [ ] **Step 3: 커밋**

```bash
git add app.js
git commit -m "feat: add click-to-confirm reset interaction for reminder cards"
```
