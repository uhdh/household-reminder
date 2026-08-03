import {
  pgTable,
  text,
  uuid,
  numeric,
  date,
  time,
  boolean,
  timestamp,
  unique,
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
  // 아래는 원본 뱅크샐러드 내보내기에는 없는, "우리집 자산흐름" 정리 과정에서 계산해 보강하는 파생 필드
  stdCategory: text("std_category"), // 카테고리매핑을 통해 정규화한 표준카테고리. 매핑이 없으면 null(미분류)
  included: boolean("included").notNull().default(true), // 자기계좌이체 등을 제외한, 수입/지출 집계에 포함할지 여부
  isInternalTransfer: boolean("is_internal_transfer").notNull().default(false), // 짝이 맞는 자기계좌이체로 판정됐는지(참고용)
  beneficiary: text("beneficiary").notNull(), // 'husband' | 'wife' | 'joint' - 누구를 위해 쓴 지출인지, 기본값은 업로드한 사람이며 건별로 수정 가능
});

// 뱅크샐러드 원본 (타입, 대분류, 소분류) 조합을 표준카테고리로 정규화하는 매핑 테이블. 수기로 관리한다.
export const categoryMappings = pgTable(
  "category_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    txnType: text("txn_type").notNull(), // '수입' | '지출' | '이체'
    rawCategory: text("raw_category").notNull(),
    rawSubcategory: text("raw_subcategory").notNull(),
    stdCategory: text("std_category").notNull(),
  },
  (table) => [unique().on(table.txnType, table.rawCategory, table.rawSubcategory)]
);

// 표준카테고리별 성격(고정비/변동비/고정수입/변동수입)과 월 예산 목표. 수기로 관리한다.
export const budgetCategories = pgTable("budget_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  kind: text("kind").notNull(), // '고정비' | '변동비' | '고정수입' | '변동수입'
  sortOrder: numeric("sort_order", { precision: 6, scale: 0 }).notNull().default("0"),
  monthlyBudget: numeric("monthly_budget", { precision: 18, scale: 2 }),
});
