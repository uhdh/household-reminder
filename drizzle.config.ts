import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  // 청소/생필품/감정카드/가족 기능은 archive/lib/로 이관됨(가계부 외 기능). 테이블은 DB에 그대로
  // 남아있고, 되살릴 때 이 스키마 파일들도 원래 경로(lib/)로 되돌리면 된다.
  schema: [
    "./archive/lib/chores-db.ts",
    "./archive/lib/supplies-db.ts",
    "./archive/lib/emotion-cards-db.ts",
    "./archive/lib/family-db.ts",
    "./lib/finance-db.ts",
  ],
  // This Neon project also contains the finance app's tables. Only manage
  // the tables owned by this app when running `drizzle-kit push`.
  tablesFilter: [
    "chores",
    "supplies",
    "custom_emotions",
    "emotion_records",
    "families",
    "family_members",
    "people",
    "uploads",
    "asset_items",
    "allocation_targets",
    "transactions",
    "category_mappings",
    "category_rules",
    "budget_categories",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
