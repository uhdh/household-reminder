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
