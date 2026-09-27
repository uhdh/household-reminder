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
