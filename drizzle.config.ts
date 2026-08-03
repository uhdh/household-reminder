import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: [
    "./lib/chores-db.ts",
    "./lib/supplies-db.ts",
    "./lib/emotion-cards-db.ts",
    "./lib/family-db.ts",
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
    "budget_categories",
  ],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
