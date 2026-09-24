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

import { getDb } from "../lib/db";
import { seedDemoHousehold } from "../lib/demo-seed";

async function main() {
  const db = getDb();
  const summary = await seedDemoHousehold(db);
  console.log(
    `샘플 가구 시딩 완료: 구성원 ${summary.people}명, 업로드 ${summary.uploads}건, ` +
      `거래 ${summary.transactions}건, 자산 ${summary.assetItems}건, 목표배분 ${summary.allocationTargets}건, ` +
      `기간 ${summary.months[0]}~${summary.months[summary.months.length - 1]}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
