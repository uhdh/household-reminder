import {
  pgTable,
  text,
  uuid,
  numeric,
  date,
  time,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const people = pgTable("people", {
  id: text("id").primaryKey(), // 'husband' | 'wife'
  displayName: text("display_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable("uploads", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: text("person_id").notNull().references(() => people.id),
  sourceFilename: text("source_filename").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  isActive: boolean("is_active").notNull().default(true),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetItems = pgTable("asset_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id),
  side: text("side").notNull(), // 'asset' | 'debt'
  category: text("category").notNull(),
  productName: text("product_name"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  // 뱅크샐러드 내보내기에는 없는, 수기 관리 투자 대시보드에서 보강한 투자원금(취득원가)
  costBasis: numeric("cost_basis", { precision: 18, scale: 2 }),
  // 수기 관리 투자 대시보드에서 보강한 섹터 분류 (예: 국내 반도체, 미국 빅테크/나스닥 등)
  sector: text("sector"),
});

// 자산 카테고리별 목표 배분 비중(%). 사용자가 대시보드에서 직접 설정하며,
// 뱅크샐러드 데이터와 무관하게 수기로 관리한다.
export const allocationTargets = pgTable("allocation_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category").notNull().unique(),
  targetPct: numeric("target_pct", { precision: 5, scale: 2 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  uploadId: uuid("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => people.id),
  txnDate: date("txn_date").notNull(),
  txnTime: time("txn_time"),
  txnType: text("txn_type").notNull(), // '수입' | '지출' | '이체'
  category: text("category"),
  subcategory: text("subcategory"),
  description: text("description"),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
});
