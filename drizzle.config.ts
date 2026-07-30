import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: [
    "./lib/chores-db.ts",
    "./lib/supplies-db.ts",
    "./lib/emotion-cards-db.ts",
  ],
  // This Neon project also contains the finance app's tables. Only manage
  // the tables owned by this app when running `drizzle-kit push`.
  tablesFilter: ["chores", "supplies", "custom_emotions", "emotion_records"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
