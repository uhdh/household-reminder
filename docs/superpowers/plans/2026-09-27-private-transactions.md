# 나만 보기 거래 · 개인 지출 현황 · 월 용돈 한도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부부 중 한 명이 거래를 "나만 보기"로 표시하면 파트너에게는 날짜와 "비공개 거래"만 보이고 합계에는 반영되며, 월별 화면에서 사용 대상별 개인 지출과 월 용돈 한도(초과 표시)를 볼 수 있게 한다.

**Architecture:** 조회 계층(`getActiveTransactions` 계열)이 "지금 보는 사람의 people.id(viewerPersonId)"를 필수 인자로 받아, 파트너의 비공개 행을 한 곳에서 마스킹한다(설명·카테고리·소분류·결제수단을 비우고 `masked: true`, 집계용 `amount/stdCategory/included/txnType/txnDate/beneficiary`는 서버에 유지). 화면·내보내기·가맹점 이력은 모두 이 계층을 거치고, 변경 액션은 `visibleToViewer()` SQL 조건으로 남의 비공개 거래를 못 바꾸게 막는다. 로그인 계정↔프로필 연결(`household_members.person_id`)이 없으면 fail-closed(모든 비공개 마스킹, 토글 거부).

**Tech Stack:** Next.js 16(App Router, server actions), React 19, Drizzle ORM + Neon(neon-http, 트랜잭션 없음), Vitest + PGlite, Auth.js.

**Spec:** `docs/superpowers/specs/2026-09-26-private-transactions-design.md`

## Global Constraints

- 공개 범위 "합계만 공개": 파트너에게 세부 내역은 "비공개 거래 + 날짜"만 보이고, 가맹점·메모·카테고리·결제수단·금액은 숨긴다. 월 총지출·카테고리 합계·예산 집계에는 포함한다.
- 정산 기능·자동 비공개 규칙·거래 코멘트/알림·Postgres RLS·사용 대상 일괄 변경은 만들지 않는다.
- `personId = null`(연결 없음, 데모 포함)은 fail-closed: 모든 비공개 거래가 마스킹되고 토글은 거부된다.
- 조회 함수의 `viewerPersonId`는 기본값 없는 필수 인자다(호출부를 컴파일러가 점검).
- 재업로드 복원에서 `isPrivate`만 복원되는 행은 `categoryLocked`를 true로 만들지 않는다.
- 사용자에게 보이는 문구·코드 주석은 한국어로 쓴다(기존 코드 스타일).
- Next.js는 일반 지식과 다른 버전이다(AGENTS.md). 서버 액션/폼/페이지 코드를 쓰기 전에 `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`를 읽는다. 이 계획서는 기존 코드 패턴(`<form action={serverAction}>`, `"use server"` 파일은 async 함수만 export)을 그대로 따른다.
- neon-http는 진짜 트랜잭션이 없다. 여러 쿼리를 묶어 원자성을 기대하지 않는다.
- 운영 DB에는 `--apply`를 실행하지 않는다. 롤아웃(Neon 백업 → 스키마·연결 적용 → 배포)은 사용자가 승인 후 직접 진행한다(문서 끝 "롤아웃" 참고).
- 개발 서버로 화면을 확인할 때는 `.env.local`의 `DATABASE_URL`이 운영 DB가 아닌지 먼저 확인한다(운영이면 Neon 브랜치 URL로 바꿔서 실행).
- 커밋은 사용자가 실행 방식을 고를 때 함께 승인한 경우에만 한다(이 저장소는 "요청 시에만 커밋" 규칙).

## Review Focus

계획 작성 시 스펙이 침묵하지만 사용자에게 문제가 될 입력·상황이다. 각 항목은 아래 태스크의 테스트로 고정한다.

1. 파트너가 자기 파일을 재업로드해도 내 비공개 거래는 그대로 남는다(기간 삭제가 `person_id`로 스코프됨) — Task 6.
2. 분류·검색 필터가 마스킹 행의 `stdCategory`로 내용을 유추하게 하면 안 된다(필터 조건이 있으면 마스킹 행은 목록에서 빠지고 "비공개 N건 빠짐" 안내) — Task 2, 7.
3. 월별 화면 카테고리 펼침 목록과 엑셀 내보내기가 파트너의 설명·금액을 그대로 내보내면 안 된다(스펙에 없던 누출 경로) — Task 7.
4. 파트너가 위조한 거래 id로 비공개 거래를 삭제·일괄 삭제·카테고리 변경·"미분류로 되돌리기"(재계산 포함)·토글해도 0행 변경 — Task 5.
5. 개인 지출 합계는 환불(입금)과 미분류 이체를 빼고, 사람이 삭제돼 남은 옛 사용 대상 id는 무시하며, 한도 0원·빈 값·음수·소수 입력을 안전하게 처리한다 — Task 8.
6. `household_members.person_id`가 `people`을 참조하게 되므로 가구 삭제 시 삭제 순서(구성원 → 사람)가 바뀌어야 한다 — Task 1.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/finance-db.ts` (수정) | 컬럼 3개 추가(`householdMembers.personId`, `transactions.isPrivate`, `people.monthlyAllowance`) |
| `lib/spending-private.ts` (신규) | 마스킹 순수 함수·`visibleToViewer` SQL 조건·목록 필터 헬퍼. DB 조회 없음 |
| `lib/spending-private-fixtures.ts` (신규) | 나만 보기 테스트 공용 PGlite 스키마·시드(가구 1개, 부부 2인, 거래 3건) |
| `lib/spending-queries.ts` (수정) | 조회 함수에 `viewerPersonId`, 시스템용 `getAllActiveTransactionsUnmasked`, `summarizeBeneficiarySpending`, `getPersonAllowances` |
| `lib/require-household.ts` (수정) | 컨텍스트·뷰어에 `personId` |
| `lib/household-lifecycle.ts` (수정) | 삭제 순서 |
| `lib/spending-export.ts` (수정) | 마스킹 행 내보내기 |
| `scripts/migrate-private-link.ts` (신규) | 컬럼 추가 + 계정↔프로필 연결(기본 미리보기) |
| `app/finance/spending/actions.ts` (수정) | 권한 조건, `setTransactionPrivateAction`, 수기 입력 `isPrivate` |
| `app/finance/upload/{actions.ts,upload-form.tsx}` (수정) | 재업로드 유지, 공동 내역 옵션 |
| `app/finance/spending/{page.tsx,manual-transaction-form.tsx}` (수정), `private-toggle.tsx`·`masked-row.tsx` (신규) | 세부 내역 화면 |
| `app/finance/spending/monthly/{page.tsx,category-row.tsx}` (수정), `beneficiary-card.tsx` (신규) | 월별 화면·개인 지출 카드 |
| `app/finance/spending/settings/{page.tsx,members-actions.ts}` (수정) | 한도 입력, 미분류 집계에서 마스킹 행 제외 |
| `app/onboarding/actions.ts`, `app/invite/[token]/actions.ts` (수정) | 생성 시 `person_id` 연결 |
| `app/privacy/page.tsx` (수정) | 비공개 표시 범위 안내 |

---

### Task 1: 스키마 컬럼 · 연결 마이그레이션 스크립트 · 가구 삭제 순서

**Files:**
- Modify: `lib/finance-db.ts`
- Modify: `lib/household-lifecycle.ts:36-38`
- Create: `scripts/migrate-private-link.ts`
- Create: `scripts/migrate-private-link.test.ts`
- Create: `lib/household-lifecycle.test.ts`
- Modify(기계적): 트랜잭션·구성원 테이블을 직접 만드는 기존 테스트들의 `CREATE TABLE`, `scripts/migrate-category-lock.test.ts`, `lib/spending-export.test.ts`, `lib/spending-queries.test.ts`

**Interfaces:**
- Produces: Drizzle 컬럼 `householdMembers.personId: string | null`, `transactions.isPrivate: boolean`, `people.monthlyAllowance: number | null`; 스크립트 export `planPrivateLinks(members, persons, links)`, `migratePrivateLink(db, { links, apply })`.

- [ ] **Step 1: 기준선 기록**

Run: `npx vitest run` 그리고 `npx tsc --noEmit`
Expected: 결과를 메모한다(이미 실패하는 테스트나 타입 오류가 있으면 이번 작업 범위 밖이므로 목록만 남기고 고치지 않는다). 이후 "기준선과 동일"은 이 결과와의 비교다.

- [ ] **Step 2: `lib/finance-db.ts`에 컬럼 추가**

import에 `integer`를 추가한다.

```ts
import {
  pgTable,
  text,
  uuid,
  numeric,
  integer,
  date,
  time,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
```

`householdMembers` 정의의 `role` 다음 줄에 추가한다(`people`이 뒤에 정의돼 있어도 화살표 함수 안이라 안전하다).

```ts
    role: text("role").notNull(), // 'owner' | 'member'
    // 로그인 계정과 부부 프로필(people)의 연결. null이면 "지금 누가 보는지 모름" -> 나만 보기 거래를
    // 전부 못 보고 토글도 못 한다(fail-closed). 온보딩/초대 수락/scripts/migrate-private-link.ts가 채운다.
    personId: text("person_id").references(() => people.id),
```

`people`의 `displayName` 다음에 추가한다.

```ts
  displayName: text("display_name").notNull(),
  // 월 용돈 한도(원). null이면 한도 없음. 본인 행만 본인이 수정한다(settings/members-actions.ts).
  monthlyAllowance: integer("monthly_allowance"),
```

`transactions`의 `categoryLocked` 다음에 추가한다.

```ts
  // "나만 보기": true면 같은 가구의 다른 구성원에게는 날짜와 "비공개 거래"만 보이고 금액·내용은 숨겨진다
  // (합계·예산 집계에는 포함). 조회 계층(lib/spending-private.ts)이 마스킹한다.
  isPrivate: boolean("is_private").notNull().default(false),
```

- [ ] **Step 3: 기존 테스트 스키마를 기계적으로 갱신**

Drizzle `select()`가 새 컬럼을 항상 포함하므로, 트랜잭션·구성원 테이블을 직접 만드는 테스트에 컬럼을 추가해야 한다. 멱등 가드가 있어 여러 번 실행해도 안전하다.

```bash
node -e "
const fs=require('fs'),cp=require('child_process');
const files=cp.execSync('git ls-files \"*.test.ts\" \"*.test.tsx\"',{encoding:'utf8'}).split('\n').filter(Boolean);
let n=0;
for(const f of files){
  let s=fs.readFileSync(f,'utf8'),o=s;
  if(!s.includes('is_private boolean'))
    s=s.replaceAll('category_locked boolean NOT NULL DEFAULT false','category_locked boolean NOT NULL DEFAULT false, is_private boolean NOT NULL DEFAULT false');
  if(!s.includes('person_id text,'))
    s=s.replaceAll('user_id uuid NOT NULL UNIQUE, role text NOT NULL,','user_id uuid NOT NULL UNIQUE, role text NOT NULL, person_id text,');
  if((f.endsWith('lib/spending-export.test.ts')||f.endsWith('lib/spending-queries.test.ts'))&&!s.includes('isPrivate: false'))
    s=s.replaceAll('categoryLocked: false,','categoryLocked: false, isPrivate: false,');
  if(s!==o){fs.writeFileSync(f,s);console.log('updated',f);n++}
}
console.log(n,'files updated');
"
```

`scripts/migrate-category-lock.test.ts`는 일부러 `category_locked`가 없는 옛 스키마를 만들지만, 마이그레이션 뒤 `db.select().from(transactions)`가 새 컬럼을 요구한다. 그 테이블 정의(26~28번째 줄)를 아래처럼 고친다.

```ts
      is_internal_transfer boolean NOT NULL DEFAULT false, beneficiary text NOT NULL,
      is_private boolean NOT NULL DEFAULT false
      -- category_locked은 일부러 안 만든다: 마이그레이션 a)단계가 ADD COLUMN IF NOT EXISTS로 추가해야 한다.
```

- [ ] **Step 4: 전체 테스트가 여전히 통과하는지 확인**

Run: `npx vitest run`
Expected: Step 1의 기준선과 같은 결과(스키마 컬럼만 추가했으므로 동작 변화 없음). 새로 실패하는 테스트가 있으면 그 파일의 `CREATE TABLE`에 빠진 컬럼이 있는지 확인해 고친다(`migrate-households.test.ts`는 `household_members`를 스크립트가 만들므로 이 컬럼이 필요 없다).

- [ ] **Step 5: 가구 삭제 순서 실패 테스트 작성**

`household_members.person_id`가 `people`을 참조하므로 구성원을 사람보다 먼저 지워야 한다. `lib/household-lifecycle.test.ts`:

```ts
// deleteHouseholdData의 삭제 순서 검증: household_members.person_id가 people을 참조하므로
// 구성원(householdMembers)을 사람(people)보다 먼저 지워야 FK 위반이 나지 않는다.
import { describe, expect, test } from "vitest";
import type { AppDb } from "@/lib/db";
import { householdMembers, people } from "@/lib/finance-db";
import { deleteHouseholdData } from "./household-lifecycle";

describe("deleteHouseholdData", () => {
  test("구성원을 사람보다 먼저 지운다(person_id FK)", async () => {
    const order: unknown[] = [];
    const fakeDb = {
      delete: (table: unknown) => {
        order.push(table);
        return { where: async () => undefined };
      },
    } as unknown as AppDb;

    await deleteHouseholdData(fakeDb, "00000000-0000-4000-8000-000000000001");

    expect(order.indexOf(householdMembers)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(householdMembers)).toBeLessThan(order.indexOf(people));
  });
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx vitest run lib/household-lifecycle.test.ts`
Expected: FAIL (`householdMembers`가 `people` 뒤에 삭제됨)

- [ ] **Step 7: `lib/household-lifecycle.ts` 순서 수정**

`budgetCategories` 삭제 줄부터 `households` 삭제 줄까지를 아래로 바꾼다(`householdMembers` 삭제를 `people` 앞으로 옮기고 이유를 남긴다).

```ts
  await db.delete(budgetCategories).where(eq(budgetCategories.householdId, householdId));
  // household_members.person_id가 people을 참조하므로 구성원을 사람보다 먼저 지운다.
  await db.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
  await db.delete(people).where(eq(people.householdId, householdId));
  await db.delete(householdInvites).where(eq(householdInvites.householdId, householdId));
  await db.delete(households).where(eq(households.id, householdId));
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run lib/household-lifecycle.test.ts app/finance/spending/settings/members-actions.test.ts`
Expected: PASS

- [ ] **Step 9: 연결 스크립트 실패 테스트 작성**

`scripts/migrate-private-link.test.ts`:

```ts
// scripts/migrate-private-link.ts 검증(PGlite만; 운영 DB는 건드리지 않는다):
// - 계획 검증(순수): 없는 계정·없는 사람·다른 가구·중복 지정·이미 다른 사람에 연결됨을 문제로 잡는다.
// - 미리보기(apply=false)는 아무 것도 바꾸지 않는다(컬럼도 안 만든다).
// - apply는 컬럼 3개를 추가하고 연결하며, 두 번 실행해도 결과가 같다(멱등).
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { migratePrivateLink, planPrivateLinks } from "./migrate-private-link";

const H1 = "00000000-0000-4000-8000-0000000000a1";
const H2 = "00000000-0000-4000-8000-0000000000b1";

const members = [
  { memberId: "m1", householdId: H1, email: "a@example.com", personId: null },
  { memberId: "m2", householdId: H1, email: "b@example.com", personId: null },
  { memberId: "m3", householdId: H2, email: "c@example.com", personId: null },
];
const persons = [
  { id: "husband", householdId: H1 },
  { id: "wife", householdId: H1 },
  { id: "other", householdId: H2 },
];

describe("planPrivateLinks", () => {
  test("올바른 매핑은 갱신 목록이 되고 문제가 없다", () => {
    const plan = planPrivateLinks(members, persons, { "A@Example.com": "husband", "b@example.com": "wife" });
    expect(plan.problems).toEqual([]);
    expect(plan.updates).toEqual([
      { memberId: "m1", personId: "husband" },
      { memberId: "m2", personId: "wife" },
    ]);
  });

  test("없는 계정·없는 사람·다른 가구·중복 지정을 문제로 잡는다", () => {
    expect(planPrivateLinks(members, persons, { "nobody@example.com": "husband" }).problems).toHaveLength(1);
    expect(planPrivateLinks(members, persons, { "a@example.com": "ghost" }).problems).toHaveLength(1);
    expect(planPrivateLinks(members, persons, { "a@example.com": "other" }).problems).toHaveLength(1);
    expect(planPrivateLinks(members, persons, { "a@example.com": "husband", "b@example.com": "husband" }).problems).toHaveLength(1);
  });

  test("이미 같은 사람에 연결돼 있으면 건너뛰고, 다른 사람에 연결돼 있으면 문제다", () => {
    const linked = [{ ...members[0], personId: "husband" }, members[1]];
    expect(planPrivateLinks(linked, persons, { "a@example.com": "husband" })).toMatchObject({ updates: [], unchanged: 1, problems: [] });
    expect(planPrivateLinks(linked, persons, { "a@example.com": "wife" }).problems).toHaveLength(1);
  });

  test("같은 사람을 다른 구성원이 이미 쓰고 있으면 문제다", () => {
    const linked = [{ ...members[0], personId: "husband" }, members[1]];
    expect(planPrivateLinks(linked, persons, { "b@example.com": "husband" }).problems).toHaveLength(1);
  });
});

async function createPreMigrationSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE households (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL)`);
  await db.execute(sql`CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE)`);
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL)`);
  await db.execute(sql`CREATE TABLE household_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, user_id uuid NOT NULL UNIQUE, role text NOT NULL)`);
  await db.execute(sql`CREATE TABLE transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL)`);
  await db.execute(sql`INSERT INTO households (id, name) VALUES (${H1}, '우리집')`);
  await db.execute(sql`INSERT INTO people (id, household_id, display_name) VALUES ('husband', ${H1}, '남편'), ('wife', ${H1}, '아내')`);
  await db.execute(sql`INSERT INTO users (email) VALUES ('a@example.com'), ('b@example.com')`);
  await db.execute(sql`
    INSERT INTO household_members (household_id, user_id, role)
    SELECT ${H1}, id, CASE WHEN email = 'a@example.com' THEN 'owner' ELSE 'member' END FROM users
  `);
}

const rowsOf = <T>(result: unknown): T[] => (result as { rows?: T[] }).rows ?? [];
const hasColumn = async (db: ReturnType<typeof drizzle>, table: string, column: string) =>
  rowsOf(await db.execute(sql`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`)).length > 0;

describe("migratePrivateLink", () => {
  const links = { "a@example.com": "husband", "b@example.com": "wife" };

  test("미리보기(apply=false)는 컬럼도 연결도 바꾸지 않는다", async () => {
    const db = drizzle();
    await createPreMigrationSchema(db);

    const plan = await migratePrivateLink(db, { links, apply: false });

    expect(plan.updates).toHaveLength(2);
    expect(await hasColumn(db, "household_members", "person_id")).toBe(false);
    expect(await hasColumn(db, "transactions", "is_private")).toBe(false);
  });

  test("apply는 컬럼 3개를 추가하고 연결하며, 다시 실행해도 결과가 같다", async () => {
    const db = drizzle();
    await createPreMigrationSchema(db);

    await migratePrivateLink(db, { links, apply: true });
    expect(await hasColumn(db, "household_members", "person_id")).toBe(true);
    expect(await hasColumn(db, "transactions", "is_private")).toBe(true);
    expect(await hasColumn(db, "people", "monthly_allowance")).toBe(true);
    const linked = rowsOf<{ email: string; person_id: string }>(
      await db.execute(sql`SELECT u.email, hm.person_id FROM household_members hm JOIN users u ON u.id = hm.user_id ORDER BY u.email`)
    );
    expect(linked).toEqual([
      { email: "a@example.com", person_id: "husband" },
      { email: "b@example.com", person_id: "wife" },
    ]);

    const second = await migratePrivateLink(db, { links, apply: true });
    expect(second.updates).toEqual([]);
    expect(second.unchanged).toBe(2);
  });

  test("문제가 있으면 apply여도 아무 것도 바꾸지 않고 예외를 던진다", async () => {
    const db = drizzle();
    await createPreMigrationSchema(db);

    await expect(migratePrivateLink(db, { links: { "nobody@example.com": "husband" }, apply: true })).rejects.toThrow(/nobody@example\.com/);
    expect(await hasColumn(db, "household_members", "person_id")).toBe(false);
  });
});
```

- [ ] **Step 10: 실패 확인**

Run: `npx vitest run scripts/migrate-private-link.test.ts`
Expected: FAIL (`./migrate-private-link` 없음)

- [ ] **Step 11: 스크립트 구현**

`scripts/migrate-private-link.ts` (환경 변수 로딩 머리말은 `scripts/cleanup-keyword-rules.ts`와 같다):

```ts
// 나만 보기 기능의 선행 작업: 컬럼 3개 추가 + 로그인 계정↔부부 프로필(people) 연결.
// 기본은 미리보기(읽기만). 실제 반영: npx tsx scripts/migrate-private-link.ts --apply --link a@example.com=husband --link b@example.com=wife
// 컬럼 추가는 ADD COLUMN IF NOT EXISTS, 연결은 person_id IS NULL인 행만 갱신하므로 여러 번 실행해도 결과가 같다.
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[trimmed.slice(0, eqIdx).trim()] = val;
    }
  }
}

import { sql } from "drizzle-orm";
import { getDb, type AppDb } from "../lib/db";

export interface MemberRow {
  memberId: string;
  householdId: string;
  email: string;
  personId: string | null;
}
export interface PersonRow {
  id: string;
  householdId: string;
}
export interface LinkPlan {
  updates: { memberId: string; personId: string }[];
  unchanged: number;
  problems: string[];
}

/** 순수 함수: 이메일→person id 매핑이 안전한지 검증하고 실제로 바꿀 행을 계산한다. */
export function planPrivateLinks(members: MemberRow[], persons: PersonRow[], links: Record<string, string>): LinkPlan {
  const updates: LinkPlan["updates"] = [];
  const problems: string[] = [];
  let unchanged = 0;
  const personById = new Map(persons.map((p) => [p.id, p]));
  const assigned = new Map<string, string>(); // personId -> email(이번 실행에서 지정된 것)

  for (const [rawEmail, personId] of Object.entries(links)) {
    const email = rawEmail.trim().toLowerCase();
    const member = members.find((m) => m.email === email);
    const person = personById.get(personId);
    if (!member) {
      problems.push(`가구 구성원 중 ${email} 계정이 없습니다.`);
      continue;
    }
    if (!person) {
      problems.push(`사람 id ${personId}를 찾을 수 없습니다.`);
      continue;
    }
    if (person.householdId !== member.householdId) {
      problems.push(`${email}과 ${personId}는 서로 다른 가구입니다.`);
      continue;
    }
    const takenBy = assigned.get(personId) ?? members.find((m) => m.personId === personId && m.email !== email)?.email;
    if (takenBy) {
      problems.push(`${personId}는 이미 ${takenBy}에 지정돼 있어 ${email}에 중복 지정할 수 없습니다.`);
      continue;
    }
    assigned.set(personId, email);
    if (member.personId === personId) {
      unchanged++;
      continue;
    }
    if (member.personId) {
      problems.push(`${email}는 이미 다른 사람(${member.personId})에 연결돼 있습니다.`);
      continue;
    }
    updates.push({ memberId: member.memberId, personId });
  }
  return { updates, unchanged, problems };
}

const rowsOf = <T>(result: unknown): T[] => (result as { rows?: T[] }).rows ?? [];

async function columnExists(db: AppDb, table: string, column: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`
  );
  return rowsOf(result).length > 0;
}

export async function migratePrivateLink(db: AppDb, options: { links: Record<string, string>; apply: boolean }): Promise<LinkPlan> {
  // 미리보기 시점에는 person_id 컬럼이 아직 없을 수 있으므로 있을 때만 읽는다.
  const hasPersonId = await columnExists(db, "household_members", "person_id");
  const memberRows = rowsOf<{ member_id: string; household_id: string; email: string; person_id: string | null }>(
    await db.execute(
      hasPersonId
        ? sql`SELECT hm.id AS member_id, hm.household_id, u.email, hm.person_id FROM household_members hm JOIN users u ON u.id = hm.user_id`
        : sql`SELECT hm.id AS member_id, hm.household_id, u.email, NULL::text AS person_id FROM household_members hm JOIN users u ON u.id = hm.user_id`
    )
  );
  const personRows = rowsOf<{ id: string; household_id: string }>(await db.execute(sql`SELECT id, household_id FROM people`));

  const plan = planPrivateLinks(
    memberRows.map((r) => ({ memberId: r.member_id, householdId: r.household_id, email: r.email.toLowerCase(), personId: r.person_id })),
    personRows.map((r) => ({ id: r.id, householdId: r.household_id })),
    options.links
  );

  console.log(`${options.apply ? "[적용]" : "[미리보기]"} 연결할 구성원 ${plan.updates.length}명, 이미 연결됨 ${plan.unchanged}명`);
  if (plan.problems.length > 0) throw new Error(`연결 계획에 문제가 있어 중단합니다:\n${plan.problems.join("\n")}`);
  if (!options.apply) return plan;

  await db.execute(sql`ALTER TABLE people ADD COLUMN IF NOT EXISTS monthly_allowance integer`);
  await db.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false`);
  await db.execute(sql`ALTER TABLE household_members ADD COLUMN IF NOT EXISTS person_id text REFERENCES people(id)`);
  for (const update of plan.updates) {
    await db.execute(sql`UPDATE household_members SET person_id = ${update.personId} WHERE id = ${update.memberId} AND person_id IS NULL`);
  }
  return plan;
}

function parseLinks(argv: string[]): Record<string, string> {
  const links: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--link") continue;
    const [email, personId] = (argv[i + 1] ?? "").split("=");
    if (email && personId) links[email] = personId;
  }
  return links;
}

// vitest에서 import할 때는 실행하지 않고, `tsx scripts/migrate-private-link.ts`로 직접 실행할 때만 돈다.
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/migrate-private-link.ts")) {
  migratePrivateLink(getDb(), { links: parseLinks(process.argv.slice(2)), apply: process.argv.includes("--apply") })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
```

- [ ] **Step 12: 통과 확인 및 전체 검증**

Run: `npx vitest run scripts/migrate-private-link.test.ts lib/household-lifecycle.test.ts` → PASS
Run: `npx vitest run` → 기준선과 동일
Run: `npx tsc --noEmit` → 기준선과 동일(`Txn` 리터럴 테스트 픽스처는 Step 3에서 `isPrivate: false`를 추가했다)

- [ ] **Step 13: Commit(승인된 경우)**

```bash
git add lib/finance-db.ts lib/household-lifecycle.ts lib/household-lifecycle.test.ts scripts/migrate-private-link.ts scripts/migrate-private-link.test.ts docs/superpowers/specs/2026-09-26-private-transactions-design.md docs/superpowers/plans/2026-09-27-private-transactions.md
git add -u
git commit -m "feat(private): 나만 보기 스키마 컬럼 3개와 계정↔프로필 연결 스크립트, 가구 삭제 순서 보정"
```

---

### Task 2: 마스킹 순수 함수 · 조회자 SQL 조건 · 목록 필터 헬퍼

**Files:**
- Create: `lib/spending-private.ts`
- Create: `lib/spending-private.test.ts`

**Interfaces:**
- Consumes: `Txn` (type, `lib/spending-queries.ts`), `transactions` (`lib/finance-db.ts`)
- Produces:
  - `type MaskedTxn = Txn & { masked: boolean }`
  - `const PRIVATE_LABEL = "비공개 거래"`
  - `isMaskedFor(row: { isPrivate: boolean; personId: string }, viewerPersonId: string | null | undefined): boolean`
  - `maskPrivateRows(rows: Txn[], viewerPersonId: string | null | undefined): MaskedTxn[]`
  - `visibleToViewer(viewerPersonId: string | null | undefined): SQL` — 공개이거나 내 것인 행
  - `rowMatchesCategory(t: MaskedTxn, category: string): boolean` (`"all"` = 전체, `"미분류"`)
  - `rowMatchesQuery(t: MaskedTxn, query: string): boolean`

- [ ] **Step 1: 실패 테스트 작성**

`lib/spending-private.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Txn } from "./spending-queries";
import { isMaskedFor, maskPrivateRows, rowMatchesCategory, rowMatchesQuery } from "./spending-private";

function makeTxn(overrides: Partial<Txn> = {}): Txn {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    householdId: "00000000-0000-4000-8000-0000000000a1",
    uploadId: "00000000-0000-4000-8000-0000000000d1",
    personId: "husband",
    txnDate: "2026-09-10",
    txnTime: "12:00:00",
    txnType: "지출",
    category: "쇼핑",
    subcategory: "선물",
    description: "아내 생일 선물",
    amount: "-50000",
    paymentMethod: "신한카드",
    stdCategory: "선물",
    included: true,
    isInternalTransfer: false,
    beneficiary: "husband",
    categoryLocked: false,
    isPrivate: true,
    ...overrides,
  };
}

describe("maskPrivateRows", () => {
  test("파트너 시점: 비공개 거래의 내용 필드를 비우고 집계용 값은 유지한다", () => {
    const [row] = maskPrivateRows([makeTxn()], "wife");
    expect(row.masked).toBe(true);
    expect(row.description).toBeNull();
    expect(row.category).toBeNull();
    expect(row.subcategory).toBeNull();
    expect(row.paymentMethod).toBeNull();
    expect(row.amount).toBe("-50000");
    expect(row.stdCategory).toBe("선물");
    expect(row.included).toBe(true);
    expect(row.txnDate).toBe("2026-09-10");
    expect(row.beneficiary).toBe("husband");
  });

  test("본인 시점: 자기 비공개 거래는 그대로 보인다", () => {
    const [row] = maskPrivateRows([makeTxn()], "husband");
    expect(row.masked).toBe(false);
    expect(row.description).toBe("아내 생일 선물");
  });

  test("공개 거래는 누가 보든 그대로다", () => {
    const [row] = maskPrivateRows([makeTxn({ isPrivate: false })], "wife");
    expect(row.masked).toBe(false);
    expect(row.description).toBe("아내 생일 선물");
  });

  test("viewerPersonId가 null/undefined(연결 없음·데모)면 모든 비공개가 마스킹된다(fail-closed)", () => {
    expect(maskPrivateRows([makeTxn()], null)[0].masked).toBe(true);
    expect(maskPrivateRows([makeTxn()], undefined)[0].masked).toBe(true);
    expect(isMaskedFor({ isPrivate: true, personId: "husband" }, null)).toBe(true);
  });

  test("원본 배열을 바꾸지 않는다", () => {
    const original = makeTxn();
    maskPrivateRows([original], "wife");
    expect(original.description).toBe("아내 생일 선물");
  });
});

describe("목록 필터 헬퍼", () => {
  const masked = maskPrivateRows([makeTxn()], "wife")[0];
  const open = maskPrivateRows([makeTxn({ isPrivate: false })], "wife")[0];

  test("카테고리 필터: 조건이 있으면 마스킹 행은 stdCategory가 같아도 걸리지 않는다", () => {
    expect(rowMatchesCategory(masked, "all")).toBe(true);
    expect(rowMatchesCategory(masked, "선물")).toBe(false);
    expect(rowMatchesCategory(open, "선물")).toBe(true);
    expect(rowMatchesCategory(maskPrivateRows([makeTxn({ isPrivate: false, stdCategory: null })], "wife")[0], "미분류")).toBe(true);
    expect(rowMatchesCategory(masked, "미분류")).toBe(false);
  });

  test("검색: 마스킹 행은 검색어가 있으면 걸리지 않고, 없으면 통과한다", () => {
    expect(rowMatchesQuery(masked, "")).toBe(true);
    expect(rowMatchesQuery(masked, "선물")).toBe(false);
    expect(rowMatchesQuery(open, "생일")).toBe(true);
    expect(rowMatchesQuery(open, "없는말")).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/spending-private.test.ts`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`lib/spending-private.ts`:

```ts
import { eq, or, type SQL } from "drizzle-orm";
import { transactions } from "@/lib/finance-db";
import type { Txn } from "@/lib/spending-queries";

// "나만 보기" 마스킹의 단일 출처. 조회 함수(spending-queries.ts)가 이 함수를 거치므로 화면·내보내기가
// 같은 규칙을 쓴다. 마스킹 행은 amount/stdCategory/included/txnType/txnDate/beneficiary를 서버 집계용으로
// 유지하지만, 화면은 masked 행의 금액을 절대 렌더링하지 않는다(렌더링하는 곳마다 masked를 확인할 것).

export const PRIVATE_LABEL = "비공개 거래";

export type MaskedTxn = Txn & { masked: boolean };

/** 이 조회자에게 이 행의 내용을 숨겨야 하는가: 비공개이고 내 것이 아니거나, 조회자를 모를 때(fail-closed). */
export function isMaskedFor(row: { isPrivate: boolean; personId: string }, viewerPersonId: string | null | undefined): boolean {
  return row.isPrivate && (!viewerPersonId || row.personId !== viewerPersonId);
}

export function maskPrivateRows(rows: Txn[], viewerPersonId: string | null | undefined): MaskedTxn[] {
  return rows.map((row) =>
    isMaskedFor(row, viewerPersonId)
      ? { ...row, description: null, category: null, subcategory: null, paymentMethod: null, masked: true }
      : { ...row, masked: false }
  );
}

/**
 * SQL 조건: 이 조회자가 내용을 볼 수 있는(=바꿀 수 있는) 행 - 공개이거나 내가 결제한 행.
 * 수정·삭제 액션의 WHERE에 쓴다. 조회자를 모르면 공개 행만 해당한다(fail-closed).
 */
export function visibleToViewer(viewerPersonId: string | null | undefined): SQL {
  return viewerPersonId
    ? (or(eq(transactions.isPrivate, false), eq(transactions.personId, viewerPersonId)) as SQL)
    : eq(transactions.isPrivate, false);
}

/** 세부 내역·내보내기 공통 카테고리 필터. 마스킹 행은 stdCategory로 내용을 유추할 수 없게 조건이 있으면 제외한다. */
export function rowMatchesCategory(t: MaskedTxn, category: string): boolean {
  if (category === "all") return true;
  if (t.masked) return false;
  return category === "미분류" ? !t.stdCategory : t.stdCategory === category;
}

/** 세부 내역·내보내기 공통 검색 필터. 마스킹 행은 검색어가 있으면 제외한다. */
export function rowMatchesQuery(t: MaskedTxn, query: string): boolean {
  if (!query) return true;
  if (t.masked) return false;
  const haystack = [t.description, t.paymentMethod, t.category, t.subcategory, t.stdCategory].filter(Boolean).join(" ").toLocaleLowerCase("ko");
  return haystack.includes(query.toLocaleLowerCase("ko"));
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/spending-private.test.ts`
Expected: PASS

- [ ] **Step 5: Commit(승인된 경우)**

```bash
git add lib/spending-private.ts lib/spending-private.test.ts
git commit -m "feat(private): 나만 보기 마스킹 순수 함수와 조회자 SQL 조건"
```

---

### Task 3: 조회자 식별(`personId`) — 컨텍스트 · 온보딩 · 초대

**Files:**
- Modify: `lib/require-household.ts`
- Modify: `lib/require-household.test.ts`
- Modify: `app/onboarding/actions.ts:42-45`, `app/onboarding/actions.test.ts`
- Modify: `app/invite/[token]/actions.ts:57-59`, `app/invite/[token]/actions.test.ts`

**Interfaces:**
- Produces: `HouseholdContext.personId: string | null`, `FinanceViewer.personId: string | null`. 데모는 `personId: null`.

- [ ] **Step 1: 실패 테스트 수정·추가 (`lib/require-household.test.ts`)**

데모 테스트의 기대값을 바꾼다.

```ts
    expect(result).toEqual({ householdId: DEMO_HOUSEHOLD_ID, readOnly: true, personId: null });
```

실가구 테스트("데모가 아니면 로그인한 사용자의 실제 가구를…")의 기대값 한 줄을 바꾼다(연결 없음 → `null`).

```ts
    expect(result).toEqual({ householdId: household.id, readOnly: false, personId: null });
```

같은 `describe` 안, 그 테스트 뒤에 연결된 경우 테스트를 추가한다.

```ts
  test("household_members.person_id가 있으면 뷰어 personId로 돌려준다", async () => {
    mockIsFinanceDemoMode.mockResolvedValue(false);
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    const [household] = await db.insert(households).values({ name: "우리집" }).returning();
    const [user] = await db.insert(users).values({ email: "a@example.com" }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId: user.id, role: "owner", personId: "husband" });
    mockAuth.mockResolvedValue({ user: { email: "a@example.com" } });

    const { resolveFinanceViewer, requireHousehold } = await import("./require-household");

    expect((await resolveFinanceViewer()).personId).toBe("husband");
    expect((await requireHousehold()).personId).toBe("husband");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run lib/require-household.test.ts`
Expected: FAIL (`personId` 없음)

- [ ] **Step 3: `lib/require-household.ts` 수정**

```ts
export interface HouseholdContext {
  userId: string;
  householdId: string;
  role: string;
  email: string;
  /** 이 계정에 연결된 부부 프로필(people.id). 연결 전이면 null(나만 보기 거래를 전부 못 본다). */
  personId: string | null;
}
```

`requireHousehold()`의 반환:

```ts
  return { userId: user.id, householdId: membership.householdId, role: membership.role, email, personId: membership.personId ?? null };
```

```ts
export interface FinanceViewer {
  householdId: string;
  /** true면 샘플 가구(데모)를 보는 중 - 화면은 그대로 쓰되 모든 수정 컨트롤을 숨겨야 한다. */
  readOnly: boolean;
  /** 지금 보는 사람의 people.id. 데모·연결 전이면 null(나만 보기 거래는 전부 마스킹). */
  personId: string | null;
}
```

```ts
export async function resolveFinanceViewer(): Promise<FinanceViewer> {
  if (await isFinanceDemoMode()) return { householdId: DEMO_HOUSEHOLD_ID, readOnly: true, personId: null };
  const { householdId, personId } = await requireHouseholdOrOnboard();
  return { householdId, readOnly: false, personId };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run lib/require-household.test.ts`
Expected: PASS

- [ ] **Step 5: 온보딩·초대 연결 실패 테스트**

`app/onboarding/actions.test.ts`에서 `expect(peopleRows[0].displayName).toBe("나");`(105번째 줄) 바로 다음에 단언을 추가한다.

```ts
    expect(memberships[0].personId).toBe(peopleRows[0].id);
```

`app/invite/[token]/actions.test.ts`의 합류 성공 테스트에서 `expect(peopleRows.some((p) => p.displayName === "새구성원")).toBe(true);`(97번째 줄) 바로 다음에 추가한다. (같은 파일의 "경합사용자" 테스트는 멤버 삽입이 실패하면 people이 0건이어야 함을 검증하므로, 기존 삽입 순서를 바꾸지 않고 UPDATE로 연결하는 이 계획의 방식과 맞는다.)

```ts
    expect(memberships[0].personId).toBe(peopleRows.find((p) => p.displayName === "새구성원")!.id);
```

Run: `npx vitest run app/onboarding/actions.test.ts "app/invite/[token]/actions.test.ts"`
Expected: FAIL (`personId`가 null)

- [ ] **Step 6: `app/onboarding/actions.ts` 수정**

`people` insert 다음 줄에 연결을 추가한다.

```ts
  await db.insert(people).values({ id: personId, householdId, displayName });
  // 이 계정이 방금 만든 프로필이라는 연결(나만 보기의 "누가 보는지"). 실패해도 personId null이면 fail-closed다.
  await db.update(householdMembers).set({ personId }).where(eq(householdMembers.userId, user.id));
```

- [ ] **Step 7: `app/invite/[token]/actions.ts` 수정**

`people` insert 다음 줄에 추가한다(경합 실패 시 유령 프로필이 생기지 않도록 기존 삽입 순서는 유지한다).

```ts
  await db.insert(people).values({ id: personId, householdId, displayName });
  await db.update(householdMembers).set({ personId }).where(eq(householdMembers.userId, user.id));
```

- [ ] **Step 8: 통과 확인**

Run: `npx vitest run app/onboarding/actions.test.ts "app/invite/[token]/actions.test.ts" lib/require-household.test.ts`
Expected: PASS

- [ ] **Step 9: Commit(승인된 경우)**

```bash
git add lib/require-household.ts lib/require-household.test.ts app/onboarding app/invite
git commit -m "feat(private): 조회자 personId 식별과 온보딩·초대 시 프로필 연결"
```

---

### Task 4: 조회 계층 마스킹 — `viewerPersonId` 필수 인자

**Files:**
- Create: `lib/spending-private-fixtures.ts`
- Create: `lib/spending-private-queries.test.ts`
- Modify: `lib/spending-queries.ts:57-136`
- Modify(호출부): `app/finance/spending/page.tsx:86-105`, `app/finance/spending/monthly/page.tsx:84-96`, `app/finance/spending/yearly/page.tsx:89-96`, `app/api/finance/spending/export/route.ts:21-47`, `app/finance/spending/settings/page.tsx:58-65`, `lib/household-transfer-pairs.ts:4,105`, `scripts/analyze-classification.ts:24,45`, `scripts/analyze-category-strategies.ts:25,59`
- Modify(테스트 호출부): `getActiveTransactions`/`getActiveTransactionsInRange`/`getMerchantHistory`를 부르는 기존 테스트 전부

**Interfaces:**
- Consumes: `maskPrivateRows`, `isMaskedFor`, `MaskedTxn` (Task 2)
- Produces:
  - `getActiveTransactions(householdId: string, viewerPersonId: string | null): Promise<{ transactions: MaskedTxn[]; displayNameByPerson: Map<string, string> }>`
  - `getActiveTransactionsInRange(householdId: string, fromDate: string, toDateExclusive: string, viewerPersonId: string | null): Promise<{ transactions: MaskedTxn[]; displayNameByPerson: Map<string, string> }>`
  - `getMerchantHistory(householdId: string, viewerPersonId: string | null): Promise<MerchantHistoryRow[]>`
  - `getAllActiveTransactionsUnmasked(householdId: string): Promise<{ transactions: Txn[]; displayNameByPerson: Map<string, string> }>` — 화면에 그대로 보여주지 않는 서버 작업(짝짓기·분석 스크립트) 전용
  - 테스트 픽스처 `lib/spending-private-fixtures.ts`: `H`(가구 id), `ID_PUB`, `ID_PRIV_H`, `ID_PRIV_W`, `createPrivateSchema(db)`, `seedPrivateHousehold(db)`

- [ ] **Step 1: 공용 픽스처 작성**

`lib/spending-private-fixtures.ts` (테스트 전용 파일이며 `*.test.ts`가 아니라 vitest가 직접 실행하지 않는다):

```ts
// 나만 보기 테스트 공용 PGlite 스키마·시드. 가구 1개, 부부 2인(husband/wife), 거래 3건:
// - ID_PUB: 남편 공개(-10,000 식비 "코스트코")
// - ID_PRIV_H: 남편 비공개(-50,000 선물 "아내 생일 선물")
// - ID_PRIV_W: 아내 비공개(-30,000 식비 "몰래 치킨")
import type { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { people, transactions, uploads } from "@/lib/finance-db";

export const H = "00000000-0000-4000-8000-0000000000c1";
export const ID_PUB = "00000000-0000-4000-8000-000000000001";
export const ID_PRIV_H = "00000000-0000-4000-8000-000000000002";
export const ID_PRIV_W = "00000000-0000-4000-8000-000000000003";
const UP_H = "00000000-0000-0000-0000-0000000000d1";
const UP_W = "00000000-0000-0000-0000-0000000000d2";

export async function createPrivateSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE TABLE people (id text PRIMARY KEY, household_id uuid NOT NULL, display_name text NOT NULL, monthly_allowance integer, updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.execute(sql`
    CREATE TABLE uploads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, person_id text NOT NULL, source_filename text NOT NULL,
      period_start date, period_end date, is_active boolean NOT NULL DEFAULT true, uploaded_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE TABLE transactions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, upload_id uuid NOT NULL, person_id text NOT NULL, txn_date date NOT NULL,
      txn_time time, txn_type text NOT NULL, category text, subcategory text, description text, amount numeric NOT NULL,
      payment_method text, std_category text, included boolean NOT NULL DEFAULT true, is_internal_transfer boolean NOT NULL DEFAULT false,
      beneficiary text NOT NULL, category_locked boolean NOT NULL DEFAULT false, is_private boolean NOT NULL DEFAULT false
    )
  `);
}

export async function seedPrivateHousehold(db: ReturnType<typeof drizzle>) {
  await db.insert(people).values([
    { id: "husband", householdId: H, displayName: "남편" },
    { id: "wife", householdId: H, displayName: "아내" },
  ]);
  await db.insert(uploads).values([
    { id: UP_H, householdId: H, personId: "husband", sourceFilename: "h.xlsx", isActive: true },
    { id: UP_W, householdId: H, personId: "wife", sourceFilename: "w.xlsx", isActive: true },
  ]);
  const base = { householdId: H, txnType: "지출", included: true, isInternalTransfer: false } as const;
  await db.insert(transactions).values([
    { ...base, id: ID_PUB, uploadId: UP_H, personId: "husband", txnDate: "2026-08-10", category: "식비", subcategory: "한식", description: "코스트코", amount: "-10000", paymentMethod: "체크카드", stdCategory: "식비", beneficiary: "husband" },
    { ...base, id: ID_PRIV_H, uploadId: UP_H, personId: "husband", txnDate: "2026-08-11", category: "쇼핑", subcategory: "선물", description: "아내 생일 선물", amount: "-50000", paymentMethod: "신한카드", stdCategory: "선물", beneficiary: "husband", isPrivate: true },
    { ...base, id: ID_PRIV_W, uploadId: UP_W, personId: "wife", txnDate: "2026-08-12", category: "식비", subcategory: "간식", description: "몰래 치킨", amount: "-30000", paymentMethod: "삼성카드", stdCategory: "식비", beneficiary: "wife", isPrivate: true },
  ]);
}
```

- [ ] **Step 2: 실패 테스트 작성**

`lib/spending-private-queries.test.ts`:

```ts
// 나만 보기 조회 계층 검증(PGlite): 파트너 시점 마스킹, 소유자 시점, 연결 없음(fail-closed),
// 범위 조회, 가맹점 이력 제외, 마스킹 후에도 합계가 유지되는지.
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, describe, expect, test } from "vitest";
import { setDbForTesting } from "@/lib/db";
import { createPrivateSchema, H, ID_PRIV_H, ID_PRIV_W, ID_PUB, seedPrivateHousehold } from "@/lib/spending-private-fixtures";
import {
  countsInTotals,
  getActiveTransactions,
  getActiveTransactionsInRange,
  getAllActiveTransactionsUnmasked,
  getMerchantHistory,
  summarizeMonthlyTransactions,
} from "@/lib/spending-queries";

describe("나만 보기 조회 마스킹", () => {
  afterEach(() => setDbForTesting(null));

  async function setup() {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    await seedPrivateHousehold(db);
    return db;
  }

  test("파트너(아내) 시점: 남편의 비공개 거래는 내용이 비고 합계용 값만 남는다", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, "wife");
    const priv = rows.find((r) => r.id === ID_PRIV_H)!;
    expect(priv.masked).toBe(true);
    expect(priv.description).toBeNull();
    expect(priv.category).toBeNull();
    expect(priv.paymentMethod).toBeNull();
    expect(priv.stdCategory).toBe("선물");
    expect(Number(priv.amount)).toBe(-50000);
    expect(rows.find((r) => r.id === ID_PRIV_W)!.masked).toBe(false); // 내 비공개는 보인다
    expect(rows.find((r) => r.id === ID_PRIV_W)!.description).toBe("몰래 치킨");
    expect(rows.find((r) => r.id === ID_PUB)!.masked).toBe(false);
  });

  test("소유자(남편) 시점: 자기 비공개 거래는 그대로, 아내 것은 마스킹", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, "husband");
    expect(rows.find((r) => r.id === ID_PRIV_H)!.description).toBe("아내 생일 선물");
    expect(rows.find((r) => r.id === ID_PRIV_W)!.masked).toBe(true);
  });

  test("연결 없음(null): 비공개 거래는 전부 마스킹된다(fail-closed)", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactions(H, null);
    expect(rows.filter((r) => r.masked).map((r) => r.id).sort()).toEqual([ID_PRIV_H, ID_PRIV_W].sort());
    expect(rows.find((r) => r.id === ID_PUB)!.masked).toBe(false);
  });

  test("범위 조회도 같은 마스킹을 한다", async () => {
    await setup();
    const { transactions: rows } = await getActiveTransactionsInRange(H, "2026-08-01", "2026-09-01", "wife");
    expect(rows.find((r) => r.id === ID_PRIV_H)!.masked).toBe(true);
    expect(rows).toHaveLength(3);
  });

  test("가맹점 이력에는 파트너의 비공개 거래가 없고 내 비공개는 있다", async () => {
    await setup();
    const history = await getMerchantHistory(H, "wife");
    expect(history.map((r) => r.id).sort()).toEqual([ID_PRIV_W, ID_PUB].sort());
    expect(history.some((r) => r.description === "아내 생일 선물")).toBe(false);
  });

  test("마스킹해도 월 합계와 카테고리 합계는 비공개를 포함한 값과 같다", async () => {
    await setup();
    const kindOf = () => "변동비";
    const totalsFor = async (viewer: string | null) => {
      const { transactions: rows } = await getActiveTransactionsInRange(H, "2026-08-01", "2026-09-01", viewer);
      return summarizeMonthlyTransactions(rows.filter(countsInTotals), kindOf, ["husband", "wife"]);
    };
    for (const viewer of ["wife", "husband", null]) {
      const s = await totalsFor(viewer);
      expect(s.totalExpense).toBe(90000);
      expect(s.categoryTotals.get("선물")).toBe(50000);
      expect(s.categoryTotals.get("식비")).toBe(40000);
    }
  });

  test("시스템용 조회는 마스킹 없이 전체를 돌려준다", async () => {
    await setup();
    const { transactions: rows } = await getAllActiveTransactionsUnmasked(H);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === ID_PRIV_H)!.description).toBe("아내 생일 선물");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run lib/spending-private-queries.test.ts`
Expected: FAIL (`getAllActiveTransactionsUnmasked` 없음 / 마스킹 안 됨)

- [ ] **Step 4: `lib/spending-queries.ts` 구현**

import를 고친다.

```ts
import { and, eq, gte, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { people, transactions, uploads } from "@/lib/finance-db";
import { isMaskedFor, maskPrivateRows, type MaskedTxn } from "@/lib/spending-private";
```

`getActiveTransactions`부터 `getMerchantHistory`까지(57~136번째 줄)를 아래로 바꾼다.

```ts
/**
 * 모든 업로드에서 누적된 거래 전체를 마스킹 없이 가져온다. 화면에 그대로 보여주지 않는 서버 작업(내 계좌
 * 이동 짝짓기, 분석 스크립트)에서만 쓴다 - 사용자 화면·내보내기는 반드시 getActiveTransactions를 쓴다.
 */
export async function getAllActiveTransactionsUnmasked(householdId: string): Promise<{
  transactions: Txn[];
  displayNameByPerson: Map<string, string>;
}> {
  const db = getDb();
  const [rows, uploadRows, peopleRows] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.householdId, householdId)),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
    getHouseholdPeople(householdId),
  ]);
  const displayNameByPerson = new Map<string, string>(peopleRows.map((p) => [p.id, p.displayName]));
  return { transactions: dedupeActiveRows(rows, uploadRows), displayNameByPerson };
}

/**
 * 모든 업로드에서 누적된 거래 전체를 가져온다. viewerPersonId(지금 보는 사람의 people.id, 모르면 null)가
 * 아닌 다른 사람의 "나만 보기" 거래는 내용이 지워지고 masked=true가 된다(lib/spending-private.ts).
 */
export async function getActiveTransactions(
  householdId: string,
  viewerPersonId: string | null
): Promise<{ transactions: MaskedTxn[]; displayNameByPerson: Map<string, string> }> {
  const { transactions: rows, displayNameByPerson } = await getAllActiveTransactionsUnmasked(householdId);
  return { transactions: maskPrivateRows(rows, viewerPersonId), displayNameByPerson };
}

/**
 * getActiveTransactions와 같지만 txn_date가 [fromDate, toDateExclusive) 범위인 행만 SQL WHERE로
 * 가져온다(household_id + 날짜 범위). 월별/연간/세부 내역 화면이 필요한 기간만 조회할 때 쓴다.
 * uploads는 가구당 행 수가 적어(파일 업로드 횟수만큼) 범위를 좁히지 않고 전체를 가져와도 무겁지 않다.
 */
export async function getActiveTransactionsInRange(
  householdId: string,
  fromDate: string,
  toDateExclusive: string,
  viewerPersonId: string | null
): Promise<{ transactions: MaskedTxn[]; displayNameByPerson: Map<string, string> }> {
  const db = getDb();
  const [rows, uploadRows, peopleRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), gte(transactions.txnDate, fromDate), lt(transactions.txnDate, toDateExclusive))),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
    getHouseholdPeople(householdId),
  ]);
  const displayNameByPerson = new Map<string, string>(peopleRows.map((p) => [p.id, p.displayName]));
  return { transactions: maskPrivateRows(dedupeActiveRows(rows, uploadRows), viewerPersonId), displayNameByPerson };
}

export type MerchantHistoryRow = {
  id: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  stdCategory: string | null;
  txnType: string;
};

/**
 * 세부 내역의 카테고리 추천/자주 쓰는/가맹점 건수/병합 토스트 대상 찾기는 가구 전체 과거
 * 이력이 필요하지만(특정 월로 좁힐 수 없음), 행 표시에 안 쓰는 컬럼(금액·결제수단·수혜자 등)은
 * 필요 없다. 필요한 컬럼만 select해 전송량을 줄인다. 파트너의 "나만 보기" 거래는 카테고리 추천·
 * 가맹점 건수로 새어 나가지 않도록 dedup 뒤에 제외한다.
 */
export async function getMerchantHistory(householdId: string, viewerPersonId: string | null): Promise<MerchantHistoryRow[]> {
  const db = getDb();
  const [rows, uploadRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        personId: transactions.personId,
        txnDate: transactions.txnDate,
        uploadId: transactions.uploadId,
        isPrivate: transactions.isPrivate,
        description: transactions.description,
        category: transactions.category,
        subcategory: transactions.subcategory,
        stdCategory: transactions.stdCategory,
        txnType: transactions.txnType,
      })
      .from(transactions)
      .where(eq(transactions.householdId, householdId)),
    db.select().from(uploads).where(eq(uploads.householdId, householdId)),
  ]);
  return dedupeActiveRows(rows, uploadRows)
    .filter((row) => !isMaskedFor(row, viewerPersonId))
    .map(({ id, description, category, subcategory, stdCategory, txnType }) => ({
      id,
      description,
      category,
      subcategory,
      stdCategory,
      txnType,
    }));
}
```

- [ ] **Step 5: 새 테스트 통과 확인**

Run: `npx vitest run lib/spending-private-queries.test.ts`
Expected: PASS

- [ ] **Step 6: 호출부 갱신 — 컴파일러가 빠짐없이 알려준다**

기존 테스트의 단순 호출을 일괄 치환한다(테스트 파일만).

```bash
node -e "
const fs=require('fs'),cp=require('child_process');
const files=cp.execSync('git ls-files \"*.test.ts\" \"*.test.tsx\"',{encoding:'utf8'}).split('\n').filter(Boolean);
for(const f of files){
  let s=fs.readFileSync(f,'utf8'),o=s;
  s=s.replace(/getActiveTransactions\((\w+)\)/g,'getActiveTransactions(\$1, null)');
  s=s.replace(/getMerchantHistory\((\w+)\)/g,'getMerchantHistory(\$1, null)');
  if(s!==o){fs.writeFileSync(f,s);console.log('updated',f)}
}
"
```

시스템 작업 호출부는 마스킹 없는 함수로 바꾼다.

- `lib/household-transfer-pairs.ts`: import를 `getAllActiveTransactionsUnmasked, toNum, type Txn`으로, 105번째 줄을 `const { transactions: activeTx } = await getAllActiveTransactionsUnmasked(householdId);`로 바꾼다. (짝짓기는 비공개 여부와 무관하게 전체 거래를 봐야 한다.)
- `scripts/analyze-classification.ts:24,45`, `scripts/analyze-category-strategies.ts:25,59`: `getActiveTransactions` → `getAllActiveTransactionsUnmasked`(import와 호출 모두).

화면·API 호출부는 뷰어 `personId`를 넘긴다.

- `app/finance/spending/page.tsx`: 86번째 줄 `const { householdId, readOnly, personId } = await resolveFinanceViewer();`, 94번째 줄 `getMerchantHistory(householdId, personId),`, 101~105번째 줄:

```ts
  const { transactions: monthRowsAll, displayNameByPerson } = await getActiveTransactionsInRange(
    householdId,
    `${month}-01`,
    `${shiftMonth(month, 1)}-01`,
    personId
  );
```

- `app/finance/spending/monthly/page.tsx`: 84번째 줄 `const { householdId, readOnly, personId } = await resolveFinanceViewer();`, 96번째 줄:

```ts
  const { transactions: rangeTx, displayNameByPerson } = await getActiveTransactionsInRange(householdId, `${prevMonth}-01`, `${shiftMonth(month, 1)}-01`, personId);
```

- `app/finance/spending/yearly/page.tsx`: 89번째 줄 `const { householdId, readOnly, personId } = await resolveFinanceViewer();`, 96번째 줄:

```ts
  const { transactions: yearRangeTx, displayNameByPerson } = await getActiveTransactionsInRange(householdId, `${year}-01-01`, `${year + 1}-01-01`, personId);
```

- `app/api/finance/spending/export/route.ts` 21~33번째 줄을 바꾸고 47번째 줄에 `viewerPersonId`를 넘긴다.

```ts
  const isDemo = await isFinanceDemoMode();
  let householdId = DEMO_HOUSEHOLD_ID;
  let viewerPersonId: string | null = null;
  if (!isDemo) {
    try {
      const context = await requireHousehold();
      householdId = context.householdId;
      viewerPersonId = context.personId ?? null;
    } catch (error) {
      if (error instanceof NoHouseholdError) return new Response(null, { status: 401 });
      throw error;
    }
  }
```

```ts
  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions(householdId, viewerPersonId);
```

- `app/finance/spending/settings/page.tsx`: 58번째 줄 `const { householdId, role, personId } = await requireHouseholdOrOnboard();`, 65번째 줄 `getActiveTransactions(householdId, personId ?? null),`.

- [ ] **Step 7: 남은 오류를 컴파일러로 찾아 고친다**

Run: `npx tsc --noEmit`
Expected: `getActiveTransactionsInRange` 호출이 템플릿 문자열 때문에 치환에서 빠진 테스트(`lib/spending-queries-scope.test.ts` 등)가 "Expected 4 arguments"로 나온다. 각 호출 끝에 `, null`을 붙여 모두 고친 뒤 다시 실행해 기준선과 같아질 때까지 반복한다.

- [ ] **Step 8: 전체 테스트**

Run: `npx vitest run`
Expected: 기준선과 동일하게 PASS (기존 테스트에는 비공개 행이 없어 동작 변화 없음)

- [ ] **Step 9: Commit(승인된 경우)**

```bash
git add -u
git add lib/spending-private-fixtures.ts lib/spending-private-queries.test.ts
git commit -m "feat(private): 조회 계층에 viewerPersonId 마스킹 적용(내역·범위·가맹점 이력)"
```

---

### Task 5: 변경 권한 — 토글 액션 · 남의 비공개 거래 수정·삭제 차단 · 수기 입력 `isPrivate`

**Files:**
- Modify: `app/finance/spending/actions.ts`
- Create: `app/finance/spending/private-actions.test.ts`

**Interfaces:**
- Consumes: `visibleToViewer` (Task 2), `HouseholdContext.personId` (Task 3), 픽스처 (Task 4)
- Produces: `setTransactionPrivateAction(formData)` — 필드 `txnId`, `private`(`"1"`=비공개/그 외=공개), `returnTo`. (스펙의 `(txnId, value)` 시그니처는 이 파일의 다른 액션과 같은 FormData 형태로 구현한다.) `addManualTransactionAction`은 체크박스 `isPrivate`(`"on"`)를 읽는다.

- [ ] **Step 1: 실패 테스트 작성**

`app/finance/spending/private-actions.test.ts`:

```ts
// 나만 보기 변경 권한 검증(PGlite): 본인 거래만 토글, 파트너의 비공개 거래는 수정·삭제·일괄 삭제·
// 카테고리 변경·"미분류로 되돌리기"가 모두 0행 변경, 연결 없는 계정은 토글 불가, 수기 입력 검증.
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, setDbForTesting } from "@/lib/db";
import { transactions } from "@/lib/finance-db";
import { createPrivateSchema, H, ID_PRIV_H, ID_PUB, seedPrivateHousehold } from "@/lib/spending-private-fixtures";

const mockRequireHousehold = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/require-household", () => ({ requireHousehold: mockRequireHousehold }));

function asViewer(personId: string | null) {
  mockRequireHousehold.mockResolvedValue({ userId: "u", householdId: H, role: "member", email: "t@example.com", personId });
}

/** redirect()가 던지는 REDIRECT 예외는 정상 종료로 취급하고 이동 URL을 돌려준다. */
async function run(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return e.message.slice(9);
    throw e;
  }
  return null;
}

function form(fields: Record<string, string>, multi: Record<string, string[]> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  for (const [k, vs] of Object.entries(multi)) for (const v of vs) f.append(k, v);
  return f;
}

async function row(id: string) {
  const [r] = await getDb().select().from(transactions).where(eq(transactions.id, id));
  return r;
}

describe("나만 보기 변경 권한", () => {
  beforeEach(async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    // 재계산 경로("미분류로 되돌리기")가 읽는 테이블
    await db.execute(sql`CREATE TABLE category_mappings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, raw_category text NOT NULL, raw_subcategory text NOT NULL, std_category text NOT NULL)`);
    await db.execute(sql`CREATE TABLE category_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, payment_method text NOT NULL, std_category text NOT NULL)`);
    await db.execute(sql`CREATE TABLE category_keyword_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), household_id uuid NOT NULL, txn_type text NOT NULL, keyword text NOT NULL, std_category text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await seedPrivateHousehold(db);
  });
  afterEach(() => {
    setDbForTesting(null);
    mockRequireHousehold.mockReset();
  });

  test("내가 결제한 거래는 나만 보기로 켜고 끌 수 있다", async () => {
    const { setTransactionPrivateAction } = await import("./actions");
    asViewer("husband");

    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(true);

    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "0", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);
  });

  test("파트너 거래·연결 없는 계정은 토글할 수 없다", async () => {
    const { setTransactionPrivateAction } = await import("./actions");

    asViewer("wife");
    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);

    asViewer("wife");
    await run(setTransactionPrivateAction(form({ txnId: ID_PRIV_H, private: "0", returnTo: "/finance/spending" })));
    expect((await row(ID_PRIV_H)).isPrivate).toBe(true);

    asViewer(null);
    await run(setTransactionPrivateAction(form({ txnId: ID_PUB, private: "1", returnTo: "/finance/spending" })));
    expect((await row(ID_PUB)).isPrivate).toBe(false);
  });

  test("파트너(아내)는 남편의 비공개 거래를 삭제·일괄 삭제·카테고리/사용 대상 변경·미분류 되돌리기 할 수 없다", async () => {
    const actions = await import("./actions");
    asViewer("wife");

    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    await run(actions.deleteTransactionsAction(form({}, { txnId: [ID_PRIV_H] })));
    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "여행" })));
    await run(actions.updateTransactionsCategoryAction(form({ stdCategory: "여행" }, { txnId: [ID_PRIV_H] })));
    await run(actions.updateBeneficiaryAction(form({ txnId: ID_PRIV_H, beneficiary: "wife" })));
    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "" }))); // 미분류로 되돌리기

    const after = await row(ID_PRIV_H);
    expect(after).toBeDefined();
    expect(after.stdCategory).toBe("선물");
    expect(after.beneficiary).toBe("husband");
    expect(after.categoryLocked).toBe(false);
    expect(after.isPrivate).toBe(true);
  });

  test("연결 없는 계정(null)도 남의 비공개 거래를 못 지운다", async () => {
    const actions = await import("./actions");
    asViewer(null);
    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    expect(await row(ID_PRIV_H)).toBeDefined();
  });

  test("소유자(남편)는 자기 비공개 거래를 바꾸고 지울 수 있다", async () => {
    const actions = await import("./actions");
    asViewer("husband");

    await run(actions.updateTransactionCategoryAction(form({ txnId: ID_PRIV_H, stdCategory: "여행" })));
    const changed = await row(ID_PRIV_H);
    expect(changed.stdCategory).toBe("여행");
    expect(changed.categoryLocked).toBe(true);

    await run(actions.deleteTransactionAction(form({ txnId: ID_PRIV_H })));
    expect(await row(ID_PRIV_H)).toBeUndefined();
  });

  test("수기 입력: 내가 결제한 거래만 나만 보기로 저장되고, 파트너 명의로는 거부된다", async () => {
    const { addManualTransactionAction } = await import("./actions");
    const manual = (personId: string, extra: Record<string, string>) =>
      form({ returnTo: "/finance/spending?month=2026-09", personId, beneficiary: personId, txnDate: "2026-09-05", stdCategory: "선물", amount: "8000", ...extra });
    const manualRows = async () => (await getDb().select().from(transactions)).filter((t) => t.category === "직접 입력");

    asViewer("husband");
    await run(addManualTransactionAction(manual("husband", { isPrivate: "on" })));
    const mine = await manualRows();
    expect(mine).toHaveLength(1);
    expect(mine[0].isPrivate).toBe(true);

    const redirectUrl = await run(addManualTransactionAction(manual("wife", { isPrivate: "on" })));
    expect(redirectUrl).toContain("addError=");
    expect(await manualRows()).toHaveLength(1); // 파트너 명의 비공개는 저장되지 않음
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run app/finance/spending/private-actions.test.ts`
Expected: FAIL (`setTransactionPrivateAction` 없음 / 권한 조건 없음)

- [ ] **Step 3: `app/finance/spending/actions.ts` 수정**

import에 추가한다.

```ts
import { visibleToViewer } from "@/lib/spending-private";
```

`addManualTransactionAction` 상단부터 검증까지를 바꾼다.

```ts
export async function addManualTransactionAction(formData: FormData) {
  const { householdId, personId: viewerPersonId } = await requireHousehold();
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");
  const personId = String(formData.get("personId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const txnDate = String(formData.get("txnDate") ?? "");
  const stdCategory = String(formData.get("stdCategory") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 100);
  const paymentMethod = String(formData.get("paymentMethod") ?? "").trim().slice(0, 50);
  const amount = Number(String(formData.get("amount") ?? "").replaceAll(",", ""));
  const isPrivate = formData.get("isPrivate") === "on";

  const householdPeople = await getHouseholdPeople(householdId);
  const knownIds = householdPeople.map((p) => p.id);
  if (!isPersonId(personId, knownIds) || !isBeneficiary(beneficiary, knownIds) || !ISO_DATE_RE.test(txnDate) || !stdCategory || !Number.isFinite(amount) || amount <= 0) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}addError=${encodeURIComponent("입력 내용을 다시 확인해주세요.")}`);
  }
  // 나만 보기는 내가 결제한 거래에만 쓸 수 있다(파트너 명의로 저장하면 나도 내용을 못 보는 거래가 된다).
  if (isPrivate && personId !== viewerPersonId) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}addError=${encodeURIComponent("나만 보기는 내가 결제한 거래에만 쓸 수 있어요.")}`);
  }
```

insert 값에서 `beneficiary,` 다음에 `isPrivate,`를 추가한다.

```ts
    beneficiary,
    isPrivate,
  });
```

`updateBeneficiaryAction`, `deleteTransactionAction`, `deleteTransactionsAction`을 바꾼다.

```ts
export async function updateBeneficiaryAction(formData: FormData) {
  const { householdId, personId: viewerPersonId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const beneficiary = String(formData.get("beneficiary") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/finance/spending");

  const knownIds = (await getHouseholdPeople(householdId)).map((p) => p.id);
  if (txnId && isBeneficiary(beneficiary, knownIds)) {
    const db = getDb();
    await db
      .update(transactions)
      .set({ beneficiary })
      .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId), visibleToViewer(viewerPersonId)));
  }

  redirect(returnTo);
}

export async function deleteTransactionAction(formData: FormData) {
  const { householdId, personId: viewerPersonId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  if (UUID_RE.test(txnId)) {
    await getDb()
      .delete(transactions)
      .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId), visibleToViewer(viewerPersonId)));
  }

  redirect(returnTo);
}

export async function deleteTransactionsAction(formData: FormData) {
  const { householdId, personId: viewerPersonId } = await requireHousehold();
  const returnTo = spendingReturnTo(formData.get("returnTo"));
  const ids = formData.getAll("txnId").map(String).filter((id) => UUID_RE.test(id)).slice(0, 500);

  if (ids.length > 0) {
    await getDb()
      .delete(transactions)
      .where(and(inArray(transactions.id, ids), eq(transactions.householdId, householdId), visibleToViewer(viewerPersonId)));
  }

  redirect(returnTo);
}
```

`applyStdCategoryToTransaction` 전체를 아래로 바꾼다(3개의 쿼리와 재계산 후보 조건 모두에 같은 조건을 건다).

```ts
async function applyStdCategoryToTransaction(
  db: ReturnType<typeof getDb>,
  householdId: string,
  viewerPersonId: string | null | undefined,
  txnId: string,
  stdCategory: string | null
) {
  // 다른 가구의 id, 그리고 같은 가구 파트너의 "나만 보기" 거래는 절대 바뀌지 않는다.
  const editable = and(eq(transactions.id, txnId), eq(transactions.householdId, householdId), visibleToViewer(viewerPersonId));

  if (stdCategory === null) {
    await db.update(transactions).set({ categoryLocked: false }).where(editable);
    await rederiveTransactions(db, householdId, and(eq(transactions.id, txnId), visibleToViewer(viewerPersonId)));
    return;
  }

  const [transaction] = await db
    .select({
      stdCategory: transactions.stdCategory,
      included: transactions.included,
      isInternalTransfer: transactions.isInternalTransfer,
    })
    .from(transactions)
    .where(editable)
    .limit(1);

  if (!transaction) return;

  const included =
    stdCategory === "자산수정"
      ? false
      : transaction.stdCategory === "자산수정" && stdCategory
        ? !transaction.isInternalTransfer
        : transaction.included;
  await db.update(transactions).set({ stdCategory, included, categoryLocked: true }).where(editable);
}
```

(함수 앞의 설명 주석 블록은 그대로 둔다.) 호출하는 액션들이 `personId`를 넘기도록 고친다.

```ts
export async function updateTransactionCategoryAction(formData: FormData) {
  const { householdId, personId } = await requireHousehold();
  ...
    await applyStdCategoryToTransaction(getDb(), householdId, personId, txnId, stdCategory);
```

```ts
export async function updateTransactionsCategoryAction(formData: FormData) {
  const { householdId, personId } = await requireHousehold();
  ...
    await Promise.all(ids.map((id) => applyStdCategoryToTransaction(db, householdId, personId, id, stdCategory)));
```

`createKeywordRuleAndApplyAction`도 `const { householdId, personId } = await requireHousehold();`로 바꾸고 두 호출을 `applyStdCategoryToTransaction(db, householdId, personId, txnId, stdCategory)` / `applyStdCategoryToTransaction(db, householdId, personId, id, stdCategory)`로 바꾼다.

토글 액션을 `deleteTransactionsAction` 아래에 추가한다.

```ts
// "나만 보기" 켜기/끄기. 내가 결제한 거래(person_id = 나)만 바꿀 수 있다. 계정↔프로필 연결이 없는
// 계정(personId null)은 아무 것도 못 바꾼다(fail-closed).
export async function setTransactionPrivateAction(formData: FormData) {
  const { householdId, personId } = await requireHousehold();
  const txnId = String(formData.get("txnId") ?? "");
  const isPrivate = formData.get("private") === "1";
  const returnTo = spendingReturnTo(formData.get("returnTo"));

  if (personId && UUID_RE.test(txnId)) {
    await getDb()
      .update(transactions)
      .set({ isPrivate })
      .where(and(eq(transactions.id, txnId), eq(transactions.householdId, householdId), eq(transactions.personId, personId)));
  }

  redirect(returnTo);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run app/finance/spending/private-actions.test.ts app/finance/spending/actions.test.ts lib/household-isolation.test.ts`
Expected: PASS (기존 액션 테스트는 `personId`가 없는 목 컨텍스트라 공개 행만 다루므로 그대로 통과한다)

- [ ] **Step 5: Commit(승인된 경우)**

```bash
git add app/finance/spending/actions.ts app/finance/spending/private-actions.test.ts
git commit -m "feat(private): 나만 보기 토글 액션과 파트너 비공개 거래 수정·삭제 차단"
```

---

### Task 6: 재업로드 유지 · 공동 내역 업로드 옵션

**Files:**
- Modify: `app/finance/upload/actions.ts:38-45,150-171,195-201,245-273,308-368`
- Modify: `app/finance/upload/upload-form.tsx`
- Modify(테스트): `app/finance/upload/actions.test.ts`

**Interfaces:**
- Consumes: `transactions.isPrivate`
- Produces: 업로드 폼 필드 `jointAccount`(`"on"`). 스냅샷 항목 `{ stdCategory, beneficiary, locked, isPrivate }`.

- [ ] **Step 1: 실패 테스트 추가 (`app/finance/upload/actions.test.ts`의 마지막 `describe("uploadAction - 가맹점 기억(merchant memory)"...` 블록 안, 마지막 `test` 뒤)**

```ts
  test("재업로드해도 나만 보기 표시는 유지되고, 분류를 안 고친 행은 잠기지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);
    const { uploadAction } = await import("./actions");
    const txns = [
      { txnDate: "2026-09-06", txnTime: "12:30:00", txnType: "지출", category: "식비", subcategory: "한식", description: "선물 가게", amount: -8000, paymentMethod: "체크카드" },
      { txnDate: "2026-09-07", txnTime: "09:00:00", txnType: "지출", category: "식비", subcategory: "한식", description: "동네 김밥", amount: -5000, paymentMethod: "체크카드" },
    ];
    const upload = async () => {
      mockParseUploadFile.mockResolvedValue({ customerName: null, periodStart: "2026-09-01", periodEnd: "2026-09-30", assetItems: [], transactions: txns });
      await expectRedirect(uploadAction(uploadForm(new File(["dummy"], "가계부.xlsx"))));
    };

    await upload();
    const first = (await db.select().from(transactions)).find((t) => t.txnDate === "2026-09-06")!;
    await db.update(transactions).set({ isPrivate: true }).where(eq(transactions.id, first.id)); // 분류는 안 고침

    await upload();
    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(2);
    const kept = rows.find((t) => t.txnDate === "2026-09-06")!;
    expect(kept.isPrivate).toBe(true);
    expect(kept.categoryLocked).toBe(false); // 비공개만 복원 - 자동 분류 재계산은 계속 적용
    expect(rows.find((t) => t.txnDate === "2026-09-07")!.isPrivate).toBe(false);
  });

  test("파트너가 자기 파일을 올려도 내 나만 보기 거래는 지워지거나 바뀌지 않는다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([
      { id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" },
      { id: "wife", householdId: HOUSEHOLD_ID, displayName: "수아" },
    ]);
    const { uploadAction } = await import("./actions");
    const period = { customerName: null, periodStart: "2026-09-01", periodEnd: "2026-09-30", assetItems: [] };

    mockParseUploadFile.mockResolvedValue({ ...period, transactions: [{ txnDate: "2026-09-06", txnTime: null, txnType: "지출", category: "쇼핑", subcategory: "선물", description: "선물", amount: -30000, paymentMethod: "카드" }] });
    await expectRedirect(uploadAction(uploadForm(new File(["dummy"], "h.xlsx"), "husband")));
    const mine = (await db.select().from(transactions))[0];
    await db.update(transactions).set({ isPrivate: true }).where(eq(transactions.id, mine.id));

    mockParseUploadFile.mockResolvedValue({ ...period, transactions: [{ txnDate: "2026-09-06", txnTime: null, txnType: "지출", category: "식비", subcategory: "한식", description: "점심", amount: -9000, paymentMethod: "카드" }] });
    await expectRedirect(uploadAction(uploadForm(new File(["dummy"], "w.xlsx"), "wife")));

    const rows = await db.select().from(transactions);
    expect(rows).toHaveLength(2);
    const husbandRow = rows.find((t) => t.personId === "husband")!;
    expect(husbandRow.id).toBe(mine.id);
    expect(husbandRow.isPrivate).toBe(true);
  });

  test("공동 계좌/카드 내역으로 올리면 새 거래의 사용 대상이 우리(joint)가 된다", async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createSchema(db);
    await db.insert(people).values([{ id: "husband", householdId: HOUSEHOLD_ID, displayName: "지훈" }]);
    const { uploadAction } = await import("./actions");
    mockParseUploadFile.mockResolvedValue({
      customerName: null, periodStart: "2026-09-01", periodEnd: "2026-09-30", assetItems: [],
      transactions: [{ txnDate: "2026-09-06", txnTime: null, txnType: "지출", category: "식비", subcategory: "한식", description: "마트", amount: -20000, paymentMethod: "공동카드" }],
    });

    const joint = uploadForm(new File(["dummy"], "joint.xlsx"));
    joint.set("jointAccount", "on");
    await expectRedirect(uploadAction(joint));
    expect((await db.select().from(transactions))[0].beneficiary).toBe("joint");

    await expectRedirect(uploadAction(uploadForm(new File(["dummy"], "mine.xlsx")))); // 체크 안 함 = 업로더
    expect((await db.select().from(transactions))[0].beneficiary).toBe("husband");
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run app/finance/upload/actions.test.ts`
Expected: FAIL (비공개 미복원, `joint` 미적용. 파트너 업로드 테스트는 기존 스코프 때문에 이미 통과할 수 있다 — 회귀 방지용이다)

- [ ] **Step 3: `app/finance/upload/actions.ts` 수정**

`uploadAction`에서 `personId` 검증(`isPersonId` 통과 이후)과 파일 검증이 끝난 곳, `const displayName = ...` 바로 위에 추가한다.

```ts
  // 공동 계좌/카드 내역 파일이면 새 거래의 사용 대상 기본값을 업로더 대신 '우리'로 한다(개인 용돈 한도 왜곡 방지).
  const defaultBeneficiary = formData.get("jointAccount") === "on" ? "joint" : personId;
```

서울페이 호출에 넘긴다.

```ts
    await handleSeoulPayUpload(db, householdId, personId, displayName, workBuffer, defaultBeneficiary);
```

뱅크샐러드 insert(170~171번째 줄)를 바꾼다.

```ts
        beneficiary: d.beneficiary ?? defaultBeneficiary,
        categoryLocked: d.categoryLocked,
        isPrivate: d.isPrivate,
```

`handleSeoulPayUpload` 시그니처와 결제 insert(269~270번째 줄)를 바꾼다.

```ts
async function handleSeoulPayUpload(
  db: AppDb,
  householdId: string,
  personId: string,
  displayName: string,
  buffer: ArrayBuffer,
  defaultBeneficiary: string
): Promise<void> {
```

```ts
        beneficiary: d.beneficiary ?? defaultBeneficiary,
        categoryLocked: d.categoryLocked,
        isPrivate: d.isPrivate,
```

(구매 장부 행 insert는 그대로 `beneficiary: personId`이고 `isPrivate`는 기본 false다.)

파일 하단의 스냅샷 블록(308~368번째 줄)을 아래로 바꾼다.

```ts
// ── 다시 올릴 때 "직접 고친 분류"와 "나만 보기" 되살리기 ─────────────────────
// 기간 삭제 후 재삽입하면 사용자가 고친(잠긴) 분류와 나만 보기 표시가 사라지므로, 지우기 전에 기억해
// 두었다가 날짜·시간·타입·금액·메모가 똑같은 거래가 다시 들어오면 되살린다. 분류를 직접 고친(locked)
// 행은 카테고리·사용 대상·잠금까지, 나만 보기만 켠 행은 비공개 표시만 되살린다(잠그지 않는다 -
// 자동 분류 재계산은 계속 적용되어야 한다).
type LockedSnapshot = Map<string, { stdCategory: string | null; beneficiary: string; locked: boolean; isPrivate: boolean }[]>;

function restoreKey(t: { txnDate: string; txnTime: string | null; txnType: string; amount: number | string; description: string | null }): string {
  return `${t.txnDate}|${(t.txnTime ?? "").slice(0, 8)}|${t.txnType}|${Number(t.amount)}|${(t.description ?? "").trim()}`;
}

async function snapshotLockedRows(
  db: AppDb,
  householdId: string,
  personId: string,
  periodStart: string,
  periodEnd: string,
  categoryCondition: SQL | undefined
): Promise<LockedSnapshot> {
  const rows = await db
    .select({
      txnDate: transactions.txnDate,
      txnTime: transactions.txnTime,
      txnType: transactions.txnType,
      amount: transactions.amount,
      description: transactions.description,
      stdCategory: transactions.stdCategory,
      beneficiary: transactions.beneficiary,
      categoryLocked: transactions.categoryLocked,
      isPrivate: transactions.isPrivate,
    })
    .from(transactions)
    .where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      or(eq(transactions.categoryLocked, true), eq(transactions.isPrivate, true)),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd),
      categoryCondition
    ));
  const snapshot: LockedSnapshot = new Map();
  for (const row of rows) {
    const key = restoreKey(row);
    const list = snapshot.get(key) ?? [];
    list.push({ stdCategory: row.stdCategory, beneficiary: row.beneficiary, locked: row.categoryLocked, isPrivate: row.isPrivate });
    snapshot.set(key, list);
  }
  return snapshot;
}

function withRestoredLock(
  t: ParsedTransaction,
  d: DerivedResult,
  snapshot: LockedSnapshot
): DerivedResult & { beneficiary: string | null; categoryLocked: boolean; isPrivate: boolean } {
  const saved = snapshot.get(restoreKey(t))?.shift(); // 같은 키가 여러 건이면 하나씩 소진
  if (!saved) return { ...d, beneficiary: null, categoryLocked: false, isPrivate: false };
  if (!saved.locked) return { ...d, beneficiary: null, categoryLocked: false, isPrivate: saved.isPrivate };
  return {
    ...d,
    stdCategory: saved.stdCategory,
    included: saved.stdCategory !== "자산수정" && computeIncluded(t, isTransferCandidate(t), d.isInternalTransfer),
    beneficiary: saved.beneficiary,
    categoryLocked: true,
    isPrivate: saved.isPrivate,
  };
}
```

- [ ] **Step 4: `app/finance/upload/upload-form.tsx`에 체크박스 추가**

보유자 `</div>` 다음, "엑셀 파일" `FormField` 앞에 넣는다.

```tsx
        <label className="mb-4 flex items-start gap-2 text-sm text-fg-neutral">
          <input type="checkbox" name="jointAccount" className="mt-1" />
          <span>
            이 파일은 공동 계좌/카드 내역이에요
            <span className="block text-xs text-ink-muted">
              체크하면 이 파일의 새 거래가 &quot;우리&quot; 지출로 기록돼서 개인 용돈 한도에 잡히지 않아요.
            </span>
          </span>
        </label>
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run app/finance/upload`
Expected: PASS (기존 서울페이·재업로드 테스트 포함)

- [ ] **Step 6: Commit(승인된 경우)**

```bash
git add app/finance/upload
git commit -m "feat(private): 재업로드 시 나만 보기 유지, 공동 계좌/카드 내역 업로드 옵션"
```

---

### Task 7: 화면 — 마스킹 행 · 토글 · 필터 · 월별 카테고리 목록 · 내보내기 · 설정 집계

**Files:**
- Create: `app/finance/spending/private-toggle.tsx`, `app/finance/spending/masked-row.tsx`
- Modify: `app/finance/spending/page.tsx`, `app/finance/spending/manual-transaction-form.tsx`
- Modify: `app/finance/spending/monthly/category-row.tsx`, `app/finance/spending/monthly/category-row.test.tsx`, `app/finance/spending/monthly/page.tsx`
- Modify: `lib/spending-export.ts`, `lib/spending-export.test.ts`, `app/api/finance/spending/export/route.ts`
- Modify: `app/finance/spending/settings/page.tsx`

**Interfaces:**
- Consumes: `MaskedTxn`, `PRIVATE_LABEL`, `rowMatchesCategory`, `rowMatchesQuery` (Task 2); `setTransactionPrivateAction` (Task 5); `personId` (Task 3/4)
- Produces: `CategoryTransaction = { id: string; description: string | null; amount: number | null; masked?: boolean }`; `exportTransactionsToExcel(rows: (Txn & { masked?: boolean })[], displayNameByPerson)`.

- [ ] **Step 1: 카테고리 펼침 목록 실패 테스트 (`app/finance/spending/monthly/category-row.test.tsx`의 `describe` 안에 추가)**

```tsx
  test("비공개 거래는 '비공개 거래'로만 보이고 금액은 렌더링되지 않는다", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({ user: module.default.setup() }));

    render(
      <ul>
        <CategoryRow
          name="선물"
          budget={null}
          actual={50_000}
          transactions={[{ id: "tx-secret", description: null, amount: null, masked: true }]}
        />
      </ul>,
    );

    await user.click(screen.getByRole("button", { name: /선물/ }));

    expect(screen.getByText("비공개 거래")).toBeTruthy();
    expect(screen.queryByText("메모 없음")).toBeNull();
    // 카테고리 합계(헤더)의 50,000원은 1곳에만 보이고, 개별 행에는 금액이 없다.
    expect(screen.getAllByText("50,000원")).toHaveLength(1);
  });
```

Run: `npx vitest run app/finance/spending/monthly/category-row.test.tsx`
Expected: FAIL

- [ ] **Step 2: `category-row.tsx` 수정**

```tsx
export type CategoryTransaction = {
  id: string;
  description: string | null;
  /** 파트너의 비공개 거래는 금액을 아예 내려보내지 않는다(null). */
  amount: number | null;
  masked?: boolean;
};
```

펼침 목록 렌더를 바꾼다.

```tsx
          {transactions.length > 0 ? transactions.map((transaction) => (
            <li key={transaction.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-ink-muted">{transaction.masked ? "비공개 거래" : transaction.description || "메모 없음"}</span>
              {transaction.amount !== null && <span className="shrink-0 font-semibold tabular-nums text-ink">{formatKRW(transaction.amount)}</span>}
            </li>
          )) : <li className="py-2 text-ink-muted">내역 없음</li>}
```

Run: `npx vitest run app/finance/spending/monthly/category-row.test.tsx` → PASS

- [ ] **Step 3: 월별 페이지가 마스킹 행의 설명·금액을 내려보내지 않게 수정 (`monthly/page.tsx`)**

`transactionsFor`의 `.map(...)`(152~155번째 줄 부근)을 바꾼다.

```ts
    .map((transaction) =>
      transaction.masked
        ? { id: transaction.id, description: null, amount: null, masked: true }
        : { id: transaction.id, description: transaction.description, amount: Math.abs(toNum(transaction.amount)), masked: false }
    );
```

- [ ] **Step 4: 내보내기 실패 테스트 (`lib/spending-export.test.ts`의 `describe` 안에 추가)**

```ts
  it("마스킹 행은 설명 '비공개 거래'로 나오고 금액·분류·결제수단·원본 분류는 비어 있다", async () => {
    const masked: Txn & { masked: boolean } = {
      id: "tx-secret",
      householdId: "household-1",
      uploadId: "u-1",
      personId: "husband",
      txnDate: "2026-08-25",
      txnTime: "12:30:00",
      txnType: "지출",
      category: null,
      subcategory: null,
      description: null,
      amount: "-50000.00",
      paymentMethod: null,
      stdCategory: "선물",
      included: true,
      isInternalTransfer: false,
      beneficiary: "husband",
      categoryLocked: false,
      isPrivate: true,
      masked: true,
    };
    const buffer = await exportTransactionsToExcel([masked], new Map([["husband", "남편"]]));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer as ArrayBuffer);
    const row = workbook.getWorksheet("세부내역")!.getRow(2);
    expect(row.getCell(6).value).toBe("비공개 거래"); // 내용
    expect(row.getCell(5).value ?? null).toBeNull(); // 금액
    expect(row.getCell(4).value ?? "").toBe(""); // 카테고리
    expect(row.getCell(7).value ?? "").toBe(""); // 결제수단
  });
```

Run: `npx vitest run lib/spending-export.test.ts`
Expected: FAIL (내용·금액이 그대로 나옴)

- [ ] **Step 5: `lib/spending-export.ts` 수정**

```ts
import ExcelJS from "exceljs";
import { beneficiaryLabel, flowLabel, toNum, type Txn } from "./spending-queries";
import { PRIVATE_LABEL } from "./spending-private";

/** 조회 계층이 돌려준 행(masked=true면 파트너의 비공개 거래) - masked가 없어도 그대로 내보낸다. */
export type ExportRow = Txn & { masked?: boolean };

export async function exportTransactionsToExcel(
  transactions: ExportRow[],
  displayNameByPerson: Map<string, string> = new Map()
): Promise<Uint8Array> {
```

행 추가 부분(52~71번째 줄)을 바꾼다.

```ts
  for (const t of transactions) {
    const flow = flowLabel(t);
    const amountVal = toNum(t.amount);
    const payer = beneficiaryLabel(t.personId, displayNameByPerson);
    const beneficiaryText = beneficiaryLabel(t.beneficiary, displayNameByPerson);
    const masked = t.masked === true; // 파트너의 비공개 거래: 내용·금액·분류·결제수단은 내보내지 않는다.

    const row = worksheet.addRow({
      txnDate: t.txnDate,
      txnTime: t.txnTime ?? "",
      flow,
      stdCategory: masked ? "" : (t.stdCategory ?? "미분류"),
      amount: masked ? null : flow === "입금" ? Math.abs(amountVal) : -Math.abs(amountVal),
      description: masked ? PRIVATE_LABEL : (t.description ?? ""),
      paymentMethod: masked ? "" : (t.paymentMethod ?? ""),
      payer,
      beneficiary: beneficiaryText,
      rawCategory: masked ? "" : (t.category ?? ""),
      rawSubcategory: masked ? "" : (t.subcategory ?? ""),
      included: t.included ? "Y" : "N",
    });
```

(나머지 스타일링 코드는 그대로.)

- [ ] **Step 6: 내보내기 라우트의 필터를 공통 헬퍼로 교체 (`export/route.ts`)**

import를 추가한다.

```ts
import { rowMatchesCategory, rowMatchesQuery } from "@/lib/spending-private";
```

`categoryFilter`/`q` 필터(64~72번째 줄)를 바꾼다.

```ts
    .filter((t) => beneficiaryFilter === "all" || t.beneficiary === beneficiaryFilter)
    .filter((t) => rowMatchesCategory(t, categoryFilter))
    .filter((t) => rowMatchesQuery(t, query))
```

(기존 `categoryFilter === "all" || t.stdCategory === categoryFilter` 필터와 `haystack` 검색 필터를 지운다. 부수 효과: `category=미분류`로 내려받아도 이제 미분류 행이 나온다 — 세부 내역 화면과 같은 동작이다.)

Run: `npx vitest run lib/spending-export.test.ts app/api/finance/spending/export lib/household-isolation.test.ts`
Expected: PASS

- [ ] **Step 7: 설정의 미분류 집계에서 마스킹 행 제외 (`settings/page.tsx`)**

`for (const t of allTx)` 루프 첫 줄을 바꾼다(파트너 비공개 거래의 원본 대분류가 목록에 드러나지 않게).

```ts
  for (const t of allTx) {
    if (t.masked || t.stdCategory || !t.included) continue;
```

- [ ] **Step 8: 토글·마스킹 행 컴포넌트 작성**

`app/finance/spending/private-toggle.tsx` (클라이언트 상태가 없어 서버 컴포넌트로 둔다):

```tsx
import { setTransactionPrivateAction } from "./actions";

export function PrivateToggle({ txnId, isPrivate, returnTo }: { txnId: string; isPrivate: boolean; returnTo: string }) {
  return (
    <form action={setTransactionPrivateAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="private" value={isPrivate ? "0" : "1"} />
      <button
        type="submit"
        title={isPrivate ? "파트너에게도 내용을 보여줘요" : "파트너에게 내용을 숨겨요(합계에는 포함돼요)"}
        className="inline-flex min-h-9 items-center rounded-r2 px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-bg-neutral-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-brand"
      >
        {isPrivate ? "공개로" : "나만 보기"}
      </button>
    </form>
  );
}
```

`app/finance/spending/masked-row.tsx`:

```tsx
import { PRIVATE_LABEL, type MaskedTxn } from "@/lib/spending-private";
import { beneficiaryLabel } from "@/lib/spending-queries";

/** 파트너의 비공개 거래: 날짜와 "비공개 거래"만 보이고 금액·내용·분류·컨트롤은 없다. */
export function MaskedTransactionRow({ t, displayNameByPerson }: { t: MaskedTxn; displayNameByPerson: Map<string, string> }) {
  return (
    <tr className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-stroke-neutral-muted/60 px-4 py-3 last:border-0 md:table-row md:p-0 md:[&>td]:py-3">
      <td className="col-start-1 row-span-2 row-start-1 self-start md:table-cell md:px-2 md:text-center" />
      <td className="col-start-2 row-start-2 truncate text-[12px] text-ink-muted md:table-cell md:whitespace-nowrap md:px-3 md:text-[14px]">
        {t.txnDate.slice(5)}
      </td>
      <td colSpan={3} className="col-start-2 row-start-1 min-w-0 md:table-cell md:px-3">
        <span className="font-semibold text-ink-muted">{PRIVATE_LABEL}</span>
        <span className="ml-2 text-[12px] text-ink-muted/70">{beneficiaryLabel(t.personId, displayNameByPerson)}님이 결제</span>
      </td>
      <td className="col-start-3 row-start-1 text-right text-[13px] text-ink-muted md:table-cell md:whitespace-nowrap md:px-3">금액 비공개</td>
      <td className="col-start-3 row-start-2 md:table-cell" />
    </tr>
  );
}
```

- [ ] **Step 9: 세부 내역 페이지 수정 (`app/finance/spending/page.tsx`)**

import 추가:

```ts
import { rowMatchesCategory, rowMatchesQuery } from "@/lib/spending-private";
import { MaskedTransactionRow } from "./masked-row";
import { PrivateToggle } from "./private-toggle";
```

(Task 4에서 이미 `personId`를 구조분해했다.) 필터 파이프라인(141~156번째 줄)을 아래로 바꿔 마스킹 행을 분류·검색 조건에서 빼고, 그 건수를 센다.

```ts
  const monthPersonTx = personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter);
  const filterBaseTx =
    flowFilter === "excluded" ? (personFilter === "all" ? excludedTx : excludedTx.filter((t) => t.personId === personFilter)) : monthPersonTx;
  const passesBaseFilters = filterBaseTx
    .filter((t) => flowFilter === "all" || flowFilter === "excluded" || (flowFilter === "income" ? flowLabel(t) === "입금" : flowLabel(t) === "지출"))
    .filter((t) => beneficiaryFilter === "all" || t.beneficiary === beneficiaryFilter);
  // 비공개 거래는 분류·검색 조건으로 내용을 유추할 수 없게 조건이 있으면 목록에서 빠진다(rowMatches* 참고).
  const filtered = passesBaseFilters
    .filter((t) => rowMatchesCategory(t, categoryFilter))
    .filter((t) => rowMatchesQuery(t, query))
    .sort((a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate)));
  const hiddenByFilterCount = passesBaseFilters.filter((t) => t.masked).length - filtered.filter((t) => t.masked).length;
```

미분류 후보(165번째 줄)를 바꾼다.

```ts
  const reviewCandidates = monthPersonTx.filter((t) => !t.stdCategory && !t.masked);
```

`filtered.map` 안에서 마스킹 행을 가장 먼저 분기한다(217번째 줄 `{filtered.map((t) => {` 바로 다음).

```tsx
            {filtered.map((t) => {
              if (t.masked) return <MaskedTransactionRow key={t.id} t={t} displayNameByPerson={displayNameByPerson} />;
              const flow = flowLabel(t);
```

메모 칸(271~276번째 줄)에 내 비공개 배지를 추가한다.

```tsx
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate font-semibold text-ink md:font-normal md:text-ink-muted">
                        {t.description ?? "-"}
                        {t.isPrivate && <span className="ml-2 rounded-r1 bg-bg-neutral-weak px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">나만 보기</span>}
                      </span>
```

관리 칸(283~285번째 줄)을 바꾼다.

```tsx
                  <td className="col-start-3 row-start-3 justify-self-end md:table-cell md:whitespace-nowrap md:px-3 md:text-right">
                    {!readOnly && (
                      <div className="flex items-center justify-end gap-1">
                        {personId && t.personId === personId && <PrivateToggle txnId={t.id} isPrivate={t.isPrivate} returnTo={returnTo} />}
                        <TransactionDeleteButton txnId={t.id} returnTo={returnTo} />
                      </div>
                    )}
                  </td>
```

필터 폼 바로 아래(`</form>` 다음, `unclassifiedCount` 블록 앞)에 안내를 추가한다.

```tsx
      {hiddenByFilterCount > 0 && (
        <p className="mb-3 text-[12px] text-ink-muted">비공개 거래 {hiddenByFilterCount}건은 분류·검색 조건에 걸리지 않아 목록에서 빠져 있어요. 합계에는 포함돼요.</p>
      )}
```

일괄 삭제 대상(427번째 줄)과 수기 입력 폼 호출을 바꾼다.

```tsx
            transactionIds={filtered.filter((transaction) => !transaction.masked).map((transaction) => transaction.id)}
```

```tsx
        <ManualTransactionForm
          month={month}
          defaultPerson={personFilter === "all" ? personIds[0] : personFilter}
          people={personIds.map((id) => ({ id, displayName: displayNameByPerson.get(id) ?? id }))}
          categories={categoryOptions}
          returnTo={returnTo}
          open={manual === "1"}
          canPrivate={personId !== null}
        />
```

- [ ] **Step 10: 수기 입력 폼에 체크박스 추가 (`manual-transaction-form.tsx`)**

props 구조분해와 타입에 `canPrivate: boolean`을 추가하고(`open = false` 다음, 타입에는 `canPrivate: boolean;`), 메모 `label` 다음·저장 버튼 `div` 앞에 넣는다.

```tsx
        {canPrivate && (
          <label className="flex items-start gap-2 text-[12px] font-medium text-ink-muted sm:col-span-2 lg:col-span-4">
            <input type="checkbox" name="isPrivate" className="mt-0.5" />
            <span>
              나만 보기
              <span className="ml-1 font-normal">파트너에게는 날짜와 &quot;비공개 거래&quot;만 보이고, 합계에는 포함돼요. 결제한 사람이 나일 때만 쓸 수 있어요.</span>
            </span>
          </label>
        )}
```

- [ ] **Step 11: 타입·테스트·린트**

Run: `npx tsc --noEmit` → 기준선과 동일
Run: `npx vitest run` → 기준선과 동일
Run: `npm run lint` → 새 경고 없음

- [ ] **Step 12: 화면 확인(개발 서버)**

`.env.local`의 `DATABASE_URL`이 운영 DB가 아닌지 먼저 확인한다(운영이면 Neon 브랜치 URL로 바꿔서 실행 — 이 확인 없이 진행하지 않는다). 개발 서버를 켜고 두 계정으로 다음을 눈으로 확인한다: ① 거래 하나를 "나만 보기"로 바꾸면 내 화면에 "나만 보기" 배지가 뜨고 ② 파트너 계정 화면에서는 날짜 + "비공개 거래" + "금액 비공개"만 보이며 체크박스·삭제가 없고 ③ 월별 화면의 카테고리 합계에는 포함돼 있고 카테고리를 펼치면 "비공개 거래"로만 나온다 ④ 카테고리/검색 필터를 걸면 "비공개 거래 N건은 … 빠져 있어요" 안내가 뜬다 ⑤ 엑셀 다운로드에 파트너의 설명·금액이 없다.

- [ ] **Step 13: Commit(승인된 경우)**

```bash
git add app lib
git commit -m "feat(private): 세부 내역·월별 카테고리·내보내기의 비공개 거래 마스킹과 나만 보기 토글 UI"
```

---

### Task 8: 개인 지출 현황 · 월 용돈 한도

**Files:**
- Modify: `lib/spending-queries.ts` (함수 2개 추가)
- Modify: `lib/spending-queries.test.ts`, `lib/spending-private-queries.test.ts`
- Create: `app/finance/spending/monthly/beneficiary-card.tsx`, `app/finance/spending/monthly/beneficiary-card.test.tsx`
- Modify: `app/finance/spending/monthly/page.tsx`
- Modify: `app/finance/spending/settings/members-actions.ts`, `app/finance/spending/settings/page.tsx`
- Create: `app/finance/spending/settings/allowance-actions.test.ts`

**Interfaces:**
- Produces:
  - `summarizeBeneficiarySpending(monthTx: Txn[], peopleList: { id: string; displayName: string }[], allowances: Map<string, number | null>): BeneficiarySpending`
  - `type BeneficiarySpending = { rows: { id: string; label: string; spent: number; allowance: number | null; over: number }[]; joint: number }`
  - `getPersonAllowances(householdId: string): Promise<Map<string, number | null>>`
  - `setAllowanceAction(formData)` — 필드 `allowance`(빈 값 = 한도 해제). 오류는 `?tab=members&allowanceError=...`로 돌려보낸다.

- [ ] **Step 1: 합계 순수 함수 실패 테스트 (`lib/spending-queries.test.ts`)**

상단 import 목록에 `summarizeBeneficiarySpending`을 추가하고, 파일 끝에 붙인다(`makeTxn`은 이 파일에 이미 있고 기본값은 `txnType: "지출"`, `included: true`, `stdCategory: null`, `beneficiary: "husband"`, `amount: "0"`이다).

```ts
describe("summarizeBeneficiarySpending", () => {
  const people = [
    { id: "husband", displayName: "남편" },
    { id: "wife", displayName: "아내" },
  ];
  const noAllowance = new Map<string, number | null>();

  test("사용 대상별 지출을 합산하고 공동은 따로 낸다", () => {
    const result = summarizeBeneficiarySpending(
      [
        makeTxn({ beneficiary: "husband", amount: "-30000" }),
        makeTxn({ beneficiary: "husband", amount: "-20000" }),
        makeTxn({ beneficiary: "wife", amount: "-10000" }),
        makeTxn({ beneficiary: "joint", amount: "-70000" }),
      ],
      people,
      noAllowance
    );
    expect(result.rows.map((r) => [r.id, r.spent])).toEqual([["husband", 50000], ["wife", 10000]]);
    expect(result.joint).toBe(70000);
  });

  test("환불(입금)·집계 제외·미분류 이체·알 수 없는 사용 대상은 뺀다", () => {
    const result = summarizeBeneficiarySpending(
      [
        makeTxn({ beneficiary: "husband", amount: "-30000" }),
        makeTxn({ beneficiary: "husband", amount: "5000", txnType: "지출" }), // 환불 = 입금
        makeTxn({ beneficiary: "husband", amount: "-9999", included: false }),
        makeTxn({ beneficiary: "husband", amount: "-8888", txnType: "이체", stdCategory: null }),
        makeTxn({ beneficiary: "deleted-person", amount: "-7777" }),
      ],
      people,
      noAllowance
    );
    expect(result.rows[0].spent).toBe(30000);
    expect(result.joint).toBe(0);
  });

  test("한도가 있으면 초과 금액을 계산하고, 한도가 없거나 이하이면 0이다", () => {
    const result = summarizeBeneficiarySpending(
      [makeTxn({ beneficiary: "husband", amount: "-60000" }), makeTxn({ beneficiary: "wife", amount: "-10000" })],
      people,
      new Map([["husband", 50000], ["wife", null]])
    );
    expect(result.rows[0]).toMatchObject({ spent: 60000, allowance: 50000, over: 10000 });
    expect(result.rows[1]).toMatchObject({ spent: 10000, allowance: null, over: 0 });
  });

  test("한도 0원이면 지출이 있는 순간 전부 초과이고, 1인·3인 가구도 사람 목록대로 나온다", () => {
    const solo = summarizeBeneficiarySpending([makeTxn({ beneficiary: "me", amount: "-1000" })], [{ id: "me", displayName: "나" }], new Map([["me", 0]]));
    expect(solo.rows).toHaveLength(1);
    expect(solo.rows[0].over).toBe(1000);
    const three = summarizeBeneficiarySpending([], [...people, { id: "kid", displayName: "아이" }], noAllowance);
    expect(three.rows).toHaveLength(3);
  });
});
```

Run: `npx vitest run lib/spending-queries.test.ts`
Expected: FAIL (`summarizeBeneficiarySpending` 없음)

- [ ] **Step 2: `lib/spending-queries.ts`에 구현 추가**

`getHouseholdPeople` 아래에 조회 함수를 추가한다.

```ts
/** 사람별 월 용돈 한도(원). 한도를 안 정한 사람은 null. 월별 화면·설정에서만 읽는다. */
export async function getPersonAllowances(householdId: string): Promise<Map<string, number | null>> {
  const db = getDb();
  const rows = await db
    .select({ id: people.id, monthlyAllowance: people.monthlyAllowance })
    .from(people)
    .where(eq(people.householdId, householdId));
  return new Map(rows.map((r) => [r.id, r.monthlyAllowance ?? null]));
}
```

`unmappedTransferExclusion` 아래에 집계 함수를 추가한다.

```ts
export interface BeneficiarySpendingRow {
  id: string;
  label: string;
  spent: number;
  allowance: number | null;
  /** 한도를 넘긴 금액. 한도가 없거나 이하이면 0. */
  over: number;
}
export interface BeneficiarySpending {
  rows: BeneficiarySpendingRow[];
  joint: number;
}

/**
 * 한 달치 거래를 사용 대상(beneficiary)별 "개인 지출"로 합산한다. 월별 합계와 같은 기준(집계에 잡히는
 * 지출만: countsInTotals + flowLabel="지출")이라 환불·집계 제외·미분류 이체는 빠진다. 파트너의 비공개
 * 거래도 합계에는 포함한다(마스킹 행도 amount/beneficiary는 유지). people 목록에 없는 옛 사용 대상은 무시한다.
 */
export function summarizeBeneficiarySpending(
  monthTx: Txn[],
  peopleList: { id: string; displayName: string }[],
  allowances: Map<string, number | null>
): BeneficiarySpending {
  const spentBy = new Map<string, number>();
  for (const t of monthTx) {
    if (!countsInTotals(t) || flowLabel(t) !== "지출") continue;
    spentBy.set(t.beneficiary, (spentBy.get(t.beneficiary) ?? 0) + Math.abs(toNum(t.amount)));
  }
  return {
    rows: peopleList.map((p) => {
      const spent = spentBy.get(p.id) ?? 0;
      const allowance = allowances.get(p.id) ?? null;
      return { id: p.id, label: p.displayName, spent, allowance, over: allowance !== null && spent > allowance ? spent - allowance : 0 };
    }),
    joint: spentBy.get("joint") ?? 0,
  };
}
```

Run: `npx vitest run lib/spending-queries.test.ts` → PASS

- [ ] **Step 3: 파트너 비공개 포함·한도 조회 테스트 (`lib/spending-private-queries.test.ts`)**

import에 `getPersonAllowances`, `summarizeBeneficiarySpending`, 그리고 `sql`(`drizzle-orm`)을 추가하고 `describe` 안에 붙인다.

```ts
  test("개인 지출 합계는 파트너의 비공개 거래도 포함하고, 한도는 people에서 읽는다", async () => {
    const db = await setup();
    await db.execute(sql`UPDATE people SET monthly_allowance = 50000 WHERE id = 'husband'`);

    const allowances = await getPersonAllowances(H);
    expect(allowances.get("husband")).toBe(50000);
    expect(allowances.get("wife")).toBeNull();

    // 아내 시점: 남편의 비공개(-50,000)도 남편 개인 지출에 잡힌다.
    const { transactions: rows } = await getActiveTransactionsInRange(H, "2026-08-01", "2026-09-01", "wife");
    const summary = summarizeBeneficiarySpending(
      rows,
      [{ id: "husband", displayName: "남편" }, { id: "wife", displayName: "아내" }],
      allowances
    );
    expect(summary.rows[0]).toMatchObject({ id: "husband", spent: 60000, allowance: 50000, over: 10000 });
    expect(summary.rows[1]).toMatchObject({ id: "wife", spent: 30000, over: 0 });
    expect(summary.joint).toBe(0);
  });
```

Run: `npx vitest run lib/spending-private-queries.test.ts` → PASS

- [ ] **Step 4: 카드 컴포넌트 실패 테스트**

`app/finance/spending/monthly/beneficiary-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { BeneficiaryCard } from "./beneficiary-card";

describe("BeneficiaryCard", () => {
  test("사람별 개인 지출·한도·초과 금액과 공동 지출을 보여주고, 사람을 누르면 세부 내역 필터로 이동한다", () => {
    render(
      <BeneficiaryCard
        month="2026-08"
        summary={{
          rows: [
            { id: "husband", label: "남편", spent: 60000, allowance: 50000, over: 10000 },
            { id: "wife", label: "아내", spent: 30000, allowance: null, over: 0 },
          ],
          joint: 70000,
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "개인 지출 현황" })).toBeTruthy();
    expect(screen.getByText("초과 10,000원")).toBeTruthy();
    expect(screen.getByText(/한도 50,000원/)).toBeTruthy();
    expect(screen.getByText("공동")).toBeTruthy();
    expect(screen.getByText("70,000원")).toBeTruthy();
    const link = screen.getByRole("link", { name: /남편/ });
    expect(link.getAttribute("href")).toBe("/finance/spending?month=2026-08&flow=expense&beneficiary=husband");
    expect(screen.queryByText(/초과 0원/)).toBeNull();
  });
});
```

Run: `npx vitest run app/finance/spending/monthly/beneficiary-card.test.tsx` → FAIL (컴포넌트 없음)

- [ ] **Step 5: 카드 컴포넌트 구현**

`app/finance/spending/monthly/beneficiary-card.tsx`:

```tsx
import Link from "next/link";
import { formatKRW } from "@/lib/finance-format";
import type { BeneficiarySpending } from "@/lib/spending-queries";

/** 월별 화면의 "개인 지출 현황": 사용 대상별 개인 지출·월 용돈 한도(초과 시 강조)와 공동 지출. */
export function BeneficiaryCard({ month, summary }: { month: string; summary: BeneficiarySpending }) {
  const hrefFor = (beneficiary: string) => `/finance/spending?${new URLSearchParams({ month, flow: "expense", beneficiary })}`;

  return (
    <section className="seed-card mb-4 p-5 shadow-none sm:p-7" aria-labelledby="beneficiary-card-title">
      <h2 id="beneficiary-card-title" className="mb-4 text-[18px] font-extrabold text-ink">개인 지출 현황</h2>
      <ul className="space-y-4">
        {summary.rows.map((row) => {
          const usagePct = row.allowance === null ? null : row.allowance > 0 ? Math.min((row.spent / row.allowance) * 100, 100) : row.spent > 0 ? 100 : 0;
          return (
            <li key={row.id}>
              <Link href={hrefFor(row.id)} className="block rounded-r2 hover:bg-bg-neutral-weak/60">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[15px] font-bold text-ink">{row.label}</span>
                  <span className="text-[15px] font-bold tabular-nums text-ink">
                    {formatKRW(row.spent)}
                    {row.allowance !== null && <span className="ml-1.5 text-[13px] font-medium text-ink-muted">/ 한도 {formatKRW(row.allowance)}</span>}
                  </span>
                </div>
                {usagePct !== null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-neutral-weak">
                    <div className={`h-full rounded-full ${row.over > 0 ? "bg-fg-critical/60" : "bg-ink/40"}`} style={{ width: `${usagePct}%` }} />
                  </div>
                )}
                {row.over > 0 && <p className="mt-1 text-[13px] font-semibold text-fg-critical">초과 {formatKRW(row.over)}</p>}
              </Link>
            </li>
          );
        })}
        <li>
          <Link href={hrefFor("joint")} className="flex items-baseline justify-between gap-3 rounded-r2 hover:bg-bg-neutral-weak/60">
            <span className="text-[15px] font-bold text-ink">공동</span>
            <span className="text-[15px] font-bold tabular-nums text-ink">{formatKRW(summary.joint)}</span>
          </Link>
        </li>
      </ul>
    </section>
  );
}
```

Run: `npx vitest run app/finance/spending/monthly/beneficiary-card.test.tsx` → PASS

- [ ] **Step 6: 월별 페이지에 카드 연결 (`monthly/page.tsx`)**

import에 `getPersonAllowances`, `summarizeBeneficiarySpending`을 추가하고 카드를 import한다.

```ts
import { BeneficiaryCard } from "./beneficiary-card";
```

`sortedBudgets` 계산 다음에 추가한다. 사람 필터(payer)와 무관하게 이번 달 가구 전체로 계산한다.

```ts
  const peopleList = personIds.map((id) => ({ id, displayName: displayNameByPerson.get(id) ?? id }));
  const allowances = await getPersonAllowances(householdId);
  const beneficiarySummary = summarizeBeneficiarySpending(rangeTx.filter((t) => monthKeyOf(t.txnDate) === month), peopleList, allowances);
  // 1인 가구는 한도를 정한 경우에만 카드가 의미 있다.
  const showBeneficiaryCard = peopleList.length >= 2 || beneficiarySummary.rows.some((r) => r.allowance !== null);
```

`comparison` 안내 문단(`{comparison && comparison.totalExpenseDelta !== 0 && (...)}`) 다음, `수입 구성`/`지출 구성` 그리드 앞에 추가한다.

```tsx
      {showBeneficiaryCard && <BeneficiaryCard month={month} summary={beneficiarySummary} />}
```

- [ ] **Step 7: 한도 액션 실패 테스트**

`app/finance/spending/settings/allowance-actions.test.ts`:

```ts
// 월 용돈 한도 검증(PGlite): 본인 프로필만 수정, 빈 값은 한도 해제, 잘못된 값은 저장하지 않는다.
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, setDbForTesting } from "@/lib/db";
import { people } from "@/lib/finance-db";
import { createPrivateSchema, H, seedPrivateHousehold } from "@/lib/spending-private-fixtures";

const mockRequireHousehold = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/require-household", () => ({ requireHousehold: mockRequireHousehold }));
// members-actions.ts가 signOut을 import하므로 next-auth 실제 모듈이 로드되지 않게 목으로 대체한다.
vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

const asViewer = (personId: string | null) =>
  mockRequireHousehold.mockResolvedValue({ userId: "u", householdId: H, role: "member", email: "t@example.com", personId });

async function run(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return e.message.slice(9);
    throw e;
  }
  return null;
}
const allowanceOf = async (id: string) => (await getDb().select().from(people).where(eq(people.id, id)))[0].monthlyAllowance;
const form = (allowance: string) => {
  const f = new FormData();
  f.set("allowance", allowance);
  return f;
};

describe("setAllowanceAction", () => {
  beforeEach(async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    await seedPrivateHousehold(db);
  });
  afterEach(() => {
    setDbForTesting(null);
    mockRequireHousehold.mockReset();
  });

  test("본인 프로필의 한도만 바뀐다(파트너 한도는 그대로)", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("300,000")));
    expect(await allowanceOf("husband")).toBe(300000);
    expect(await allowanceOf("wife")).toBeNull();
  });

  test("빈 값은 한도 해제, 0원은 유효한 한도다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("100000")));
    await run(setAllowanceAction(form("")));
    expect(await allowanceOf("husband")).toBeNull();
    await run(setAllowanceAction(form("0")));
    expect(await allowanceOf("husband")).toBe(0);
  });

  test("음수·소수·너무 큰 값·숫자가 아닌 값은 저장하지 않고 오류로 돌려보낸다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("50000")));
    for (const bad of ["-1", "1.5", "1000000000", "abc"]) {
      const url = await run(setAllowanceAction(form(bad)));
      expect(url).toContain("allowanceError=");
    }
    expect(await allowanceOf("husband")).toBe(50000);
  });

  test("프로필과 연결되지 않은 계정은 저장할 수 없다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer(null);
    const url = await run(setAllowanceAction(form("50000")));
    expect(url).toContain("allowanceError=");
    expect(await allowanceOf("husband")).toBeNull();
    expect(await allowanceOf("wife")).toBeNull();
  });
});
```

Run: `npx vitest run app/finance/spending/settings/allowance-actions.test.ts`
Expected: FAIL (`setAllowanceAction` 없음)

- [ ] **Step 8: `members-actions.ts`에 액션 추가**

import를 고친다.

```ts
import { households, householdInvites, householdMembers, people, users } from "@/lib/finance-db";
```

파일 끝에 추가한다.

```ts
const MAX_ALLOWANCE = 100_000_000;

// 월 용돈 한도 저장. 본인 프로필(people.id = 내 personId)만 바꿀 수 있고, 빈 값은 한도 해제다.
// 오류는 danger-zone의 error와 섞이지 않게 allowanceError로 돌려보낸다.
export async function setAllowanceAction(formData: FormData) {
  const { householdId, personId } = await requireHousehold();
  const back = "/finance/spending/settings?tab=members";
  const fail = (message: string): never => redirect(`${back}&allowanceError=${encodeURIComponent(message)}`);

  if (!personId) fail("내 프로필과 연결되지 않은 계정이라 한도를 저장할 수 없어요.");
  const raw = String(formData.get("allowance") ?? "").replaceAll(",", "").trim();
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > MAX_ALLOWANCE)) {
    fail("한도는 0원 이상 1억 원 이하의 정수로 입력해주세요.");
  }

  await getDb()
    .update(people)
    .set({ monthlyAllowance: value, updatedAt: new Date() })
    .where(and(eq(people.id, personId as string), eq(people.householdId, householdId)));

  redirect(back);
}
```

Run: `npx vitest run app/finance/spending/settings/allowance-actions.test.ts` → PASS

- [ ] **Step 9: 설정 → 구성원 탭에 한도 입력 UI (`settings/page.tsx`)**

import를 고친다.

```ts
import { getActiveTransactions, getHouseholdPeople, getPersonAllowances, toNum } from "@/lib/spending-queries";
import { cancelInviteAction, setAllowanceAction } from "./members-actions";
```

`SettingsPage` 시그니처의 `searchParams` 타입과 구조분해에 `allowanceError`를 추가한다.

```ts
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string; success?: string; allowanceError?: string }> }) {
  const { tab, error, success, allowanceError } = await searchParams;
```

`activeInvites` 계산 아래에 한도 조회를 추가한다(구성원 탭에서만 읽는다).

```ts
  const allowances = activeTab === "members" ? await getPersonAllowances(householdId) : new Map<string, number | null>();
```

구성원 탭의 첫 카드(구성원 목록 카드) 다음, `활성 초대` 카드 앞에 새 카드를 넣는다.

```tsx
          <div className="seed-card p-5 shadow-none sm:p-7">
            <h2 className="mb-1 text-[18px] font-extrabold text-ink">월 용돈 한도</h2>
            <p className="mb-4 text-[13px] text-ink-muted">
              사용 대상이 본인인 지출의 월 한도예요. 비워 두면 한도 없이 지출만 보여줘요. 한도는 본인 것만 바꿀 수 있어요.
            </p>
            {allowanceError && <div className="mb-3 rounded-r2 bg-bg-critical-weak px-3 py-2 text-[12px] text-fg-critical">{allowanceError}</div>}
            <ul className="divide-y divide-hairline2 text-[14px]">
              {householdPeople.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="font-semibold text-ink">{p.displayName}</span>
                  {p.id === personId ? (
                    <form action={setAllowanceAction} className="flex items-center gap-2">
                      <TextInput type="number" name="allowance" min={0} step={10000} defaultValue={allowances.get(p.id) ?? ""} placeholder="한도 없음" className="min-h-11 w-32 px-3 py-2 text-right" />
                      <ActionButton type="submit" className="min-h-11 px-4 py-2">저장</ActionButton>
                    </form>
                  ) : (
                    <span className="text-ink-muted">{allowances.get(p.id) != null ? formatKRW(allowances.get(p.id)!) : "설정 안 함"}</span>
                  )}
                </li>
              ))}
            </ul>
            {!personId && <p className="mt-3 text-[12px] text-ink-muted">이 계정은 아직 가구 구성원 프로필과 연결되지 않아 한도를 입력할 수 없어요.</p>}
          </div>
```

- [ ] **Step 10: 검증**

Run: `npx tsc --noEmit` → 기준선과 동일
Run: `npx vitest run` → 기준선과 동일 + 새 테스트 PASS(설정 페이지 테스트는 `upload`/`rules` 탭만 렌더하므로 새 조회를 타지 않는다)
Run: `npm run lint` → 새 경고 없음
개발 서버(운영 DB가 아님을 먼저 확인)에서 월별 화면에 "개인 지출 현황" 카드가 보이는지, 설정 → 구성원에서 본인 한도만 입력되고 저장 후 카드에 반영·초과 시 "초과 ○원"이 빨갛게 뜨는지, 카드를 누르면 세부 내역이 사용 대상 필터로 열리는지 확인한다.

- [ ] **Step 11: Commit(승인된 경우)**

```bash
git add lib app
git commit -m "feat(private): 월별 개인 지출 현황 카드와 월 용돈 한도(본인만 수정)"
```

---

### Task 9: 개인정보처리방침 · 스펙 보정 · 최종 검증

**Files:**
- Modify: `app/privacy/page.tsx:50-54`
- Modify: `docs/superpowers/specs/2026-09-26-private-transactions-design.md`

- [ ] **Step 1: 방침 문구 추가**

`4. 가구 구성원 간 정보 공유` 문단의 `</p>` 다음 줄에 문단을 하나 더 넣는다.

```tsx
        <p className="mt-2">
          다만 구성원은 본인이 결제한 거래를 &quot;나만 보기&quot;로 표시해 다른 구성원에게 가맹점·메모·카테고리·결제수단·금액을
          숨길 수 있습니다. 이 거래는 다른 구성원에게 날짜와 &quot;비공개 거래&quot;로만 표시되며, 월 합계·카테고리 합계·예산 집계에는
          포함됩니다. 이 기능은 같은 가구 구성원 사이의 표시 범위를 정하는 것이며, 서비스 운영을 위한 데이터베이스 접근에는
          적용되지 않습니다.
        </p>
```

- [ ] **Step 2: 설계서에 "구현 시 보정" 절 추가**

`docs/superpowers/specs/2026-09-26-private-transactions-design.md`의 "롤아웃" 앞에 아래 절을 추가해 스펙이 구현과 어긋나지 않게 한다.

```markdown
## 구현 시 보정 (계획 단계에서 확정)

- 토글 액션은 이 저장소의 다른 액션과 같은 FormData 형태(`setTransactionPrivateAction(formData)`: `txnId`, `private`, `returnTo`)로 만든다.
- 마스킹 행 타입은 `amount`를 유지한 채 `masked: true`를 붙인다(집계 함수가 `Txn`을 그대로 받기 때문). 금액을 렌더링하는 모든 곳(세부 내역, 월별 카테고리 펼침, 내보내기)이 `masked`를 확인하며, 월별 카테고리 목록은 클라이언트 컴포넌트로 가는 props에서 금액을 아예 뺀다(`amount: null`).
- 화면에 그대로 보여주지 않는 서버 작업(내 계좌 이동 짝짓기, 분석 스크립트)은 `getAllActiveTransactionsUnmasked`를 쓴다.
- 추가로 막은 누출 경로: 월별 카테고리 펼침 목록, 설정의 미분류 집계, 분류·검색 필터(마스킹 행은 조건이 있으면 목록에서 제외하고 안내 문구 표시), 일괄 선택 대상.
- 온보딩·초대 수락은 기존 삽입 순서를 유지하고 사람 생성 뒤 `household_members.person_id`를 UPDATE한다(경합 실패 시 유령 프로필이 생기지 않게).
- `household_members.person_id`가 `people`을 참조하므로 `deleteHouseholdData`는 구성원을 사람보다 먼저 지운다.
- 스키마 컬럼 추가는 `scripts/migrate-private-link.ts --apply`가 함께 수행한다(`households`/`household_members`는 drizzle-kit `tablesFilter` 밖이라 기존 마이그레이션 스크립트 방식을 따른다).
- 내보내기의 카테고리 필터가 "미분류"를 지원하게 됐다(세부 내역 화면과 같은 동작).
- 한도 입력 오류는 `allowanceError` 쿼리로 돌려보낸다(danger-zone의 `error`와 분리).
```

- [ ] **Step 3: 최종 검증**

Run: `npx tsc --noEmit` → 기준선과 동일
Run: `npx vitest run` → 전체 PASS(또는 Task 1 Step 1의 기준선과 동일)
Run: `npm run lint` → 새 경고 없음
Run: `npm run build` → 성공(`cross-env NODE_ENV=production next build`; 서버 액션·페이지 타입 오류를 마지막으로 잡는다)

- [ ] **Step 4: Commit(승인된 경우)**

```bash
git add app/privacy/page.tsx docs
git commit -m "docs(private): 개인정보처리방침에 비공개 표시 범위 추가, 설계서 구현 보정"
```

---

## 롤아웃 (사용자 승인 후, 실행자가 임의로 하지 않는다)

1. Neon 브랜치(백업)를 만든다.
2. 미리보기: `npx tsx scripts/migrate-private-link.ts --link <남편 이메일>=husband --link <아내 이메일>=wife` (우리집 사람 id는 `husband`/`wife`. 출력의 "연결할 구성원 2명"과 문제 목록이 비어 있는지 확인)
3. 적용: 같은 명령에 `--apply` 추가(컬럼 3개 추가 + 연결, 멱등)
4. 코드를 배포한다. 연결이 빠진 계정이 있어도 fail-closed로 안전하다(그 계정은 나만 보기를 켤 수 없고, 상대의 비공개 거래는 볼 수 없다).
5. 새 가구는 온보딩·초대 수락이 자동으로 연결한다.
