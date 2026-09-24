import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

import { sql } from "drizzle-orm";
import { getDb, type AppDb } from "../lib/db";

const DEFAULT_HOUSEHOLD_NAME = "우리집";

// household_id로 바뀌는 9개 가계부 테이블. (테이블명, 기존 unique 컬럼 목록 | null)
// unique가 있는 테이블은 "household_id + 기존 컬럼"으로 unique를 바꾼다(설계 문서 표 그대로).
const SCOPED_TABLES: { table: string; uniqueColumns: string[] | null }[] = [
  { table: "people", uniqueColumns: null },
  { table: "uploads", uniqueColumns: null },
  { table: "asset_items", uniqueColumns: null },
  { table: "transactions", uniqueColumns: null },
  { table: "allocation_targets", uniqueColumns: ["category"] },
  { table: "category_mappings", uniqueColumns: ["txn_type", "raw_category", "raw_subcategory"] },
  { table: "category_rules", uniqueColumns: ["txn_type", "payment_method"] },
  { table: "category_keyword_rules", uniqueColumns: ["keyword"] },
  { table: "budget_categories", uniqueColumns: ["name"] },
];

/** table 위에서, 정확히 columns 집합(household_id 제외)과 일치하는 UNIQUE 제약을 찾아 이름을 반환한다. */
async function findUniqueConstraintOnColumns(db: AppDb, table: string, columns: string[]): Promise<string[]> {
  const sortedTarget = [...columns].sort();
  const result = await db.execute(sql`
    SELECT tc.constraint_name AS name,
           array_agg(kcu.column_name ORDER BY kcu.column_name) AS cols
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_name = tc.table_name
    WHERE tc.table_name = ${table} AND tc.constraint_type = 'UNIQUE'
    GROUP BY tc.constraint_name
  `);
  const rows = (result as unknown as { rows: { name: string; cols: string[] }[] }).rows ?? [];
  return rows.filter((row) => JSON.stringify([...row.cols].sort()) === JSON.stringify(sortedTarget)).map((row) => row.name);
}

async function swapUniqueConstraint(db: AppDb, table: string, oldColumns: string[]) {
  const existingNames = await findUniqueConstraintOnColumns(db, table, oldColumns);
  for (const name of existingNames) {
    await db.execute(sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${name}"`));
  }

  const newColumns = ["household_id", ...oldColumns];
  const newName = `${table}_${newColumns.join("_")}_unique`;
  const alreadyExists = (await findUniqueConstraintOnColumns(db, table, newColumns)).length > 0;
  if (!alreadyExists) {
    await db.execute(
      sql.raw(`ALTER TABLE ${table} ADD CONSTRAINT "${newName}" UNIQUE (${newColumns.join(", ")})`)
    );
  }
}

export async function migrateHouseholds(db: AppDb, opts: { seedOwnerEmails?: string } = {}) {
  // 1) 새 테이블
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS households (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      name text,
      created_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS household_members (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households(id),
      user_id uuid NOT NULL REFERENCES users(id),
      role text NOT NULL,
      created_at timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT household_members_user_id_unique UNIQUE (user_id)
    );
  `);
  // 이 스크립트를 예전 버전(household_id+user_id 복합 unique)으로 이미 한 번 돌린 적이 있어도
  // 안전하게 1인 1가구 제약(user_id 단독 unique)을 추가한다.
  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE household_members ADD CONSTRAINT household_members_user_id_unique UNIQUE (user_id);
    -- 신설 테이블은 CREATE TABLE 단계에서 이미 이 이름으로 생겼으므로 duplicate_table(42P07)로,
    -- 예전 버전 스크립트로 이미 추가된 적이 있다면 duplicate_object(42710)로 떨어질 수 있다.
    EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
    END $$;
  `);
  await db.execute(sql`
    ALTER TABLE household_members DROP CONSTRAINT IF EXISTS household_members_household_id_user_id_unique;
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS household_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id uuid NOT NULL REFERENCES households(id),
      token_hash text NOT NULL UNIQUE,
      created_by uuid NOT NULL REFERENCES users(id),
      expires_at timestamp with time zone NOT NULL,
      used_at timestamp with time zone,
      used_by uuid REFERENCES users(id)
    );
  `);
  console.log("새 가구 테이블 준비 완료");

  // 2) 기존 9개 테이블에 household_id nullable 컬럼 추가
  for (const { table } of SCOPED_TABLES) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id)`));
  }
  console.log("household_id 컬럼 추가 완료");

  // 3) 가구 "우리집" 생성(없을 때만)
  const existingHousehold = await db.execute(
    sql`SELECT id FROM households WHERE name = ${DEFAULT_HOUSEHOLD_NAME} LIMIT 1`
  );
  const existingRows = (existingHousehold as unknown as { rows: { id: string }[] }).rows ?? [];
  let householdId: string;
  if (existingRows.length > 0) {
    householdId = existingRows[0].id;
  } else {
    const inserted = await db.execute(
      sql`INSERT INTO households (name) VALUES (${DEFAULT_HOUSEHOLD_NAME}) RETURNING id`
    );
    householdId = (inserted as unknown as { rows: { id: string }[] }).rows[0].id;
  }
  console.log(`가구 "${DEFAULT_HOUSEHOLD_NAME}" id: ${householdId}`);

  // 4) SEED_OWNER_EMAILS(쉼표 구분)로 users + household_members(owner) 생성
  const emails = (opts.seedOwnerEmails ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    const insertedUser = await db.execute(
      sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`
    );
    const userId = (insertedUser as unknown as { rows: { id: string }[] }).rows[0].id;
    await db.execute(sql`
      INSERT INTO household_members (household_id, user_id, role)
      VALUES (${householdId}, ${userId}, 'owner')
      ON CONFLICT (user_id) DO NOTHING
    `);
  }
  console.log(`owner 계정 ${emails.length}건 준비 완료`);

  // 5) 모든 기존 행 household_id 백필
  for (const { table } of SCOPED_TABLES) {
    const result = await db.execute(
      sql.raw(`UPDATE ${table} SET household_id = '${householdId}' WHERE household_id IS NULL`)
    );
    // neon-http는 rowCount, pglite는 affectedRows로 영향받은 행 수를 준다(둘 다 로그 표시용일 뿐, 로직에는 안 쓴다).
    const count = (result as unknown as { rowCount?: number; affectedRows?: number }).rowCount ??
      (result as unknown as { affectedRows?: number }).affectedRows ?? 0;
    console.log(`${table} 백필: ${count}행`);
  }

  // 6) NOT NULL + unique 제약 교체
  for (const { table, uniqueColumns } of SCOPED_TABLES) {
    await db.execute(sql.raw(`ALTER TABLE ${table} ALTER COLUMN household_id SET NOT NULL`));
    if (uniqueColumns) {
      await swapUniqueConstraint(db, table, uniqueColumns);
    }
  }
  console.log("NOT NULL 및 unique 제약 교체 완료");

  return { householdId };
}

async function main() {
  const db = getDb();
  await migrateHouseholds(db, { seedOwnerEmails: process.env.SEED_OWNER_EMAILS });
}

// vitest에서 migrateHouseholds()만 import할 때는 실행하지 않고, `tsx scripts/migrate-households.ts`로
// 직접 실행할 때만 돈다(그래야 테스트가 DATABASE_URL 없이도 이 파일을 안전하게 import할 수 있다).
if (process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/migrate-households.ts")) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
