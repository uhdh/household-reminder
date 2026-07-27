# 우리집 홈 화면 셸 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default `create-next-app` home page with the "우리집" home shell — a greeting header plus a list of 4 section rows (청소 관리 / 생필품 관리 / 감정카드 / 포트폴리오), each showing a status badge and, once its section is ported in, linking to that section's route.

**Architecture:** A `lib/sections.ts` module defines a `Section` config array with a `getStatus()` contract. A presentational `app/home-view.tsx` component renders the list from that config (or an injected list, for testing). `app/page.tsx` stays a thin wrapper that renders `HomeView` with no props, so it matches Next.js's page-component call signature exactly.

**Tech Stack:** Next.js 16.2.12 (App Router), React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library (new to this repo).

## Global Constraints

- Next.js in this repo is version 16.2.12, which has breaking changes vs. older Next.js — every code snippet below was checked against `node_modules/next/dist/docs/01-app/` (project structure, layouts-and-pages, linking-and-navigating, testing/vitest) for this exact version. Run `npm install` first if `node_modules` is missing, so those docs are available.
- Scope is the home shell only. The 4 sections' real functionality (청소 관리, 생필품 관리, 감정카드, 포트폴리오) are separate, later sub-projects — do not implement their actual pages/data here.
- All 4 sections will eventually be ported into this one Next.js app as routes (decided in brainstorming) — don't build cross-app links or iframes.
- Visual direction is the "홈킷 앱" style: greeting header + vertical list of section rows, each with an icon chip, name, and a right-aligned status badge. This is a separate visual language from the icon-grid used inside 청소 관리 — do not reuse the icon grid here.
- Until a section is ported in, its row must show a "준비중" badge and must NOT be a navigable link (no `<a href>`/`<Link>` — render a plain, `aria-disabled` container instead).
- No auth/login, no drag-to-reorder sections, no polling/websocket live updates — YAGNI per the spec.
- Testing: Vitest + React Testing Library only, per `docs/superpowers/specs/2026-07-27-home-shell-design.md`. No e2e/browser tests in this plan.

---

### Task 1: Section status contract + Vitest setup

**Files:**
- Create: `lib/sections.ts`
- Create: `lib/sections.test.ts`
- Create: `vitest.config.mts`
- Modify: `package.json` (add devDependencies + `test` script)

**Interfaces:**
- Produces: `export type SectionStatus = { ready: false } | { ready: true; label: string }`
- Produces: `export type Section = { id: string; name: string; icon: string; href: string; getStatus: () => SectionStatus }`
- Produces: `export const SECTIONS: Section[]` — exactly 4 entries, ids in order `"cleaning"`, `"supplies"`, `"emotion-cards"`, `"portfolio"`, hrefs `/cleaning`, `/supplies`, `/emotion-cards`, `/portfolio`, every entry's `getStatus()` currently returning `{ ready: false }`.

- [x] **Step 1: Install test dependencies**

Run: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths`

- [x] **Step 2: Add Vitest config**

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
  },
})
```

- [x] **Step 3: Add the `test` script to `package.json`**

In the `"scripts"` block, add (non-watch mode, so it exits instead of hanging in an agentic/CI shell):

```json
"test": "vitest run"
```

- [x] **Step 4: Write the failing test**

```ts
// lib/sections.test.ts
import { describe, expect, test } from "vitest";
import { SECTIONS } from "./sections";

describe("SECTIONS", () => {
  test("has exactly the 4 expected sections, in order, with matching hrefs", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "cleaning",
      "supplies",
      "emotion-cards",
      "portfolio",
    ]);
    expect(SECTIONS.map((s) => s.href)).toEqual([
      "/cleaning",
      "/supplies",
      "/emotion-cards",
      "/portfolio",
    ]);
  });

  test("every section defaults to not ready", () => {
    for (const section of SECTIONS) {
      expect(section.getStatus()).toEqual({ ready: false });
    }
  });
});
```

- [x] **Step 5: Run test to verify it fails**

Run: `npx vitest run lib/sections.test.ts`
Expected: FAIL — `Cannot find module './sections'` (or similar), since `lib/sections.ts` doesn't exist yet.

- [x] **Step 6: Write the implementation**

```ts
// lib/sections.ts
export type SectionStatus = { ready: false } | { ready: true; label: string };

export type Section = {
  id: string;
  name: string;
  icon: string;
  href: string;
  getStatus: () => SectionStatus;
};

export const SECTIONS: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: () => ({ ready: false }),
  },
  {
    id: "supplies",
    name: "생필품 관리",
    icon: "🧴",
    href: "/supplies",
    getStatus: () => ({ ready: false }),
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: () => ({ ready: false }),
  },
  {
    id: "portfolio",
    name: "포트폴리오",
    icon: "💼",
    href: "/portfolio",
    getStatus: () => ({ ready: false }),
  },
];
```

- [x] **Step 7: Run test to verify it passes**

Run: `npx vitest run lib/sections.test.ts`
Expected: PASS (2 tests)

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.mts lib/sections.ts lib/sections.test.ts
git commit -m "test: add vitest setup and section status config"
```

---

### Task 2: HomeView component + wiring into the home route

**Files:**
- Create: `app/home-view.tsx`
- Create: `app/home-view.test.tsx`
- Modify: `app/page.tsx` (replace `create-next-app` boilerplate entirely)

**Interfaces:**
- Consumes: `SECTIONS`, `Section`, `SectionStatus` from `lib/sections.ts` (Task 1)
- Produces: `export function HomeView({ sections = SECTIONS }: { sections?: Section[] })` — a plain (non-async) component so Vitest can render it directly, per `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`'s "does not support async Server Components" note.

- [x] **Step 1: Write the failing tests**

```tsx
// app/home-view.test.tsx
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeView } from "./home-view";
import type { Section } from "@/lib/sections";

const mockSections: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: () => ({ ready: true, label: "3" }),
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: () => ({ ready: false }),
  },
];

describe("HomeView", () => {
  test("renders every section's name and icon", () => {
    render(<HomeView sections={mockSections} />);
    expect(screen.getByText("청소 관리")).toBeDefined();
    expect(screen.getByText("🧹")).toBeDefined();
    expect(screen.getByText("감정카드")).toBeDefined();
    expect(screen.getByText("💌")).toBeDefined();
  });

  test("a ready section renders as a link to its route, showing its status label", () => {
    render(<HomeView sections={mockSections} />);
    const link = screen.getByRole("link", { name: /청소 관리/ });
    expect(link.getAttribute("href")).toBe("/cleaning");
    expect(screen.getByText("3")).toBeDefined();
  });

  test("a not-ready section shows a 준비중 badge and is not a link", () => {
    render(<HomeView sections={mockSections} />);
    expect(screen.getByText("준비중")).toBeDefined();
    expect(screen.queryByRole("link", { name: /감정카드/ })).toBeNull();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/home-view.test.tsx`
Expected: FAIL — `Cannot find module './home-view'`

- [x] **Step 3: Write the implementation**

```tsx
// app/home-view.tsx
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
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900">
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
    return <div aria-disabled="true">{card}</div>;
  }

  return <Link href={section.href}>{card}</Link>;
}

export function HomeView({
  sections = SECTIONS,
}: {
  sections?: Section[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-md flex-1 flex-col px-5 py-10">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatToday()}
        </p>
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          우리집 👋
        </h1>
        <ul className="flex flex-col gap-3">
          {sections.map((section) => (
            <li key={section.id}>
              <SectionRow section={section} status={section.getStatus()} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/home-view.test.tsx`
Expected: PASS (3 tests)

- [x] **Step 5: Wire `HomeView` into the actual home route**

Replace the entire contents of `app/page.tsx` (currently the `create-next-app` boilerplate with the Next.js/Vercel logos) with:

```tsx
// app/page.tsx
import { HomeView } from "./home-view";

// The greeting date comes from new Date() at render time; without this the page
// is statically rendered once at build and the date freezes. NOTE: `revalidate`
// is the pre-Cache-Components API — if `cacheComponents` is ever enabled in
// next.config.ts, this stops working and the date must be made dynamic instead.
export const revalidate = 3600;

export default function Page() {
  return <HomeView />;
}
```

(The `revalidate` line above was added in a later fix round, after this step was
originally implemented without it — this snippet has been updated to match the
`app/page.tsx` that actually shipped.)

- [x] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS (5 tests total — 2 from Task 1, 3 from this task)

- [x] **Step 7: Run lint and build to catch type/convention errors**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (this also runs Next.js's type generation, confirming `app/page.tsx`'s zero-arg default export and `HomeView`'s typed props are both valid).

**Note (added after the fact):** `npm run build` currently fails in this
environment while prerendering `/_not-found`
(`TypeError: Cannot read properties of null (reading 'useContext')`). This is a
pre-existing, unrelated Next.js/React/Node bug — it reproduces identically on
plain `master`'s untouched `create-next-app` scaffold, before any of this
plan's changes. `npx tsc --noEmit` was used instead as the substitute
verification for type-correctness (it passes cleanly), alongside `npm run
lint` and `npm run test`.

- [x] **Step 8: Commit**

```bash
git add app/page.tsx app/home-view.tsx app/home-view.test.tsx
git commit -m "feat: build 우리집 home shell with section status rows"
```

---

## Manual verification (after both tasks)

Run `npm run dev`, open `http://localhost:3000`, and confirm:
- Header shows today's date and "우리집 👋"
- All 4 rows render (청소 관리 🧹, 생필품 관리 🧴, 감정카드 💌, 포트폴리오 💼), each with a "준비중" badge
- None of the 4 rows navigate anywhere when clicked (no active routes exist yet — that's expected until later sub-projects port each section in)
- Dark mode (OS-level dark theme) renders with the dark color variants, not broken/unreadable
