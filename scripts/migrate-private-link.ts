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
