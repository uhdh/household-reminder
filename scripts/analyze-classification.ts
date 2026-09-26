// 읽기 전용 분석: 자동 분류·이체 제외 로직이 어디서 새는지 "건수"만 출력한다(거래 내용·금액은 출력하지 않음).
// 실행: npx tsx scripts/analyze-classification.ts   (HOUSEHOLD_ID 환경변수로 가구 지정, 기본값 = 우리집)
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

import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { categoryKeywordRules, categoryMappings, categoryRules } from "../lib/finance-db";
import { buildMappingIndex, buildRuleIndex, mapStdCategory, suggestKeywordFromDescription } from "../lib/spending-derive";
import { getActiveTransactions, type Txn } from "../lib/spending-queries";
import { findHouseholdTransferPairs } from "../lib/household-transfer-pairs";

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? "a1f94fe6-44b6-4a58-ab1a-6433606e3d86";
const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const num = (t: Txn) => Number(t.amount);

function dominant(tally: Map<string, number>): { category: string; share: number } | null {
  let best = "";
  let bestCount = 0;
  let total = 0;
  for (const [category, count] of tally) {
    total += count;
    if (count > bestCount) [best, bestCount] = [category, count];
  }
  return best ? { category: best, share: bestCount / total } : null;
}

async function main() {
  const db = getDb();
  const { transactions: all } = await getActiveTransactions(HOUSEHOLD_ID);
  const [mappings, rules, keywordRules] = await Promise.all([
    db.select().from(categoryMappings).where(eq(categoryMappings.householdId, HOUSEHOLD_ID)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, HOUSEHOLD_ID)),
    db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, HOUSEHOLD_ID)),
  ]);
  const mappingIndex = buildMappingIndex(mappings);
  const ruleIndex = buildRuleIndex(rules);
  const txns = all.filter((t) => t.category !== "서울페이" || t.subcategory !== "구매");
  console.log(`전체 활성 거래 ${txns.length}건, 매핑 ${mappings.length}개, 결제수단 규칙 ${rules.length}개, 키워드 규칙 ${keywordRules.length}개`);

  // ── A. 분류 ────────────────────────────────────────────────
  console.log("\n[A] 분류 현황 (거래 타입별: 분류됨 / 미분류 / 직접 고침)");
  for (const type of ["수입", "지출", "이체"]) {
    const rows = txns.filter((t) => t.txnType === type);
    const unclassified = rows.filter((t) => !t.stdCategory).length;
    const locked = rows.filter((t) => t.categoryLocked).length;
    console.log(`  ${type}: ${rows.length}건 / 미분류 ${unclassified} (${pct(unclassified, rows.length)}) / 직접 고침 ${locked}`);
  }

  // 가맹점 학습 인덱스: (정규화 가맹점, 타입) → 카테고리 분포 (분류된 거래 기준)
  const merchantTally = new Map<string, Map<string, number>>();
  const rawTally = new Map<string, Map<string, number>>();
  const catOnlyTally = new Map<string, Map<string, number>>();
  for (const t of txns) {
    if (!t.stdCategory) continue;
    const mk = `${suggestKeywordFromDescription(t.description)}|${t.txnType}`;
    const rk = `${t.txnType}|${t.category ?? ""}|${t.subcategory ?? ""}`;
    const ck = `${t.txnType}|${t.category ?? ""}`;
    for (const [map, key] of [[merchantTally, mk], [rawTally, rk], [catOnlyTally, ck]] as const) {
      const tally = map.get(key) ?? new Map<string, number>();
      tally.set(t.stdCategory, (tally.get(t.stdCategory) ?? 0) + 1);
      map.set(key, tally);
    }
  }

  const unclassified = txns.filter((t) => !t.stdCategory && t.txnType !== "이체");
  let byMerchant = 0;
  let byRaw = 0;
  let byCatOnly = 0;
  let none = 0;
  for (const t of unclassified) {
    const m = merchantTally.get(`${suggestKeywordFromDescription(t.description)}|${t.txnType}`);
    const r = rawTally.get(`${t.txnType}|${t.category ?? ""}|${t.subcategory ?? ""}`);
    const c = catOnlyTally.get(`${t.txnType}|${t.category ?? ""}`);
    if (m) byMerchant++;
    else if (r) byRaw++;
    else if (c) byCatOnly++;
    else none++;
  }
  console.log(`\n[A2] 수입·지출 미분류 ${unclassified.length}건을 풀 수 있는 방법(앞 단계 우선)`);
  console.log(`  같은 가맹점이 이미 분류된 적 있음(가맹점 학습): ${byMerchant}`);
  console.log(`  같은 원본 대분류·소분류가 분류된 적 있음(원본 조합 학습): ${byRaw}`);
  console.log(`  같은 원본 대분류만 분류된 적 있음(대분류 대체): ${byCatOnly}`);
  console.log(`  단서 없음: ${none}`);

  // 직접 고친 거래: 현재 자동 규칙은 뭐라고 했을지 / 가맹점 학습(자기 자신 제외)은 맞혔을지
  const locked = txns.filter((t) => t.categoryLocked && t.stdCategory && t.txnType !== "이체");
  let autoSame = 0;
  let autoNull = 0;
  let merchantCorrect = 0;
  let merchantPredicted = 0;
  const lockedTally = new Map<string, Map<string, number>>();
  for (const t of locked) {
    const key = `${suggestKeywordFromDescription(t.description)}|${t.txnType}`;
    const tally = lockedTally.get(key) ?? new Map<string, number>();
    tally.set(t.stdCategory!, (tally.get(t.stdCategory!) ?? 0) + 1);
    lockedTally.set(key, tally);
  }
  for (const t of locked) {
    const auto = mapStdCategory(
      { ...t, amount: num(t), txnType: t.txnType as "수입" | "지출" | "이체" },
      mappingIndex,
      ruleIndex,
      keywordRules
    );
    if (auto === t.stdCategory) autoSame++;
    if (auto === null) autoNull++;
    // leave-one-out: 이 거래를 뺀 나머지 "직접 고친" 거래로만 가맹점 학습
    const key = `${suggestKeywordFromDescription(t.description)}|${t.txnType}`;
    const tally = new Map(lockedTally.get(key));
    tally.set(t.stdCategory!, (tally.get(t.stdCategory!) ?? 0) - 1);
    if ((tally.get(t.stdCategory!) ?? 0) <= 0) tally.delete(t.stdCategory!);
    const d = dominant(tally);
    if (d) {
      merchantPredicted++;
      if (d.category === t.stdCategory) merchantCorrect++;
    }
  }
  console.log(`\n[A3] 직접 고친 수입·지출 ${locked.length}건`);
  console.log(`  현재 자동 규칙 결과가 고친 값과 같음: ${autoSame} / 자동 규칙은 미분류였음: ${autoNull} / 자동 규칙이 다른 값(틀림): ${locked.length - autoSame - autoNull}`);
  console.log(`  가맹점 학습(자기 제외)으로 예측 가능: ${merchantPredicted}건, 그중 정답 ${merchantCorrect} (${pct(merchantCorrect, merchantPredicted)})`);

  // 가맹점 일관성: 2건 이상 분류된 가맹점 중 한 카테고리가 90% 이상인 비율
  let multi = 0;
  let consistent = 0;
  for (const tally of merchantTally.values()) {
    const total = [...tally.values()].reduce((s, v) => s + v, 0);
    if (total < 2) continue;
    multi++;
    if ((dominant(tally)?.share ?? 0) >= 0.9) consistent++;
  }
  console.log(`  2건 이상 분류된 가맹점 ${multi}곳 중 한 카테고리로 90% 이상 일관: ${consistent} (${pct(consistent, multi)})`);

  // ── B. 이체 제외 ───────────────────────────────────────────
  const counted = (t: Txn) => t.included && !(t.txnType === "이체" && !t.stdCategory);
  const transfers = txns.filter((t) => t.txnType === "이체");
  const internal = txns.filter((t) => t.isInternalTransfer);
  const byInternalType = new Map<string, number>();
  for (const t of internal) {
    const k = `${t.txnType}${counted(t) ? "(집계 포함)" : ""}`;
    byInternalType.set(k, (byInternalType.get(k) ?? 0) + 1);
  }
  console.log(`\n[B0] 자기계좌이체 짝 표시 ${internal.length}건, 그중 아직 집계에 잡힘 ${internal.filter(counted).length}건 / ${[...byInternalType].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  const nonTransferInternalByMonth = new Map<string, number>();
  for (const t of internal) {
    if (t.txnType === "이체") continue;
    const m = t.txnDate.slice(0, 7);
    nonTransferInternalByMonth.set(m, (nonTransferInternalByMonth.get(m) ?? 0) + 1);
  }
  console.log(`     수입·지출인데 짝 표시된 거래의 월 분포: ${[...nonTransferInternalByMonth].sort().map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`[B] 이체 타입 ${transfers.length}건: 집계에 포함 ${transfers.filter(counted).length} / 자기계좌이체 짝 ${transfers.filter((t) => t.isInternalTransfer).length}`);

  // 반대 부호·같은 금액·±1일 짝 찾기 (사람 간 / 같은 사람 내 설명 불일치)
  const byAmount = new Map<number, Txn[]>();
  for (const t of txns) {
    const key = Math.abs(num(t));
    if (key <= 100) continue;
    (byAmount.get(key) ?? byAmount.set(key, []).get(key)!).push(t);
  }
  const used = new Set<string>();
  let crossPairs = 0;
  let crossCounted = 0;
  let samePairs = 0;
  let sameCounted = 0;
  const crossTypes = new Map<string, number>();
  for (const group of byAmount.values()) {
    for (const a of group) {
      if (used.has(a.id) || a.isInternalTransfer) continue;
      const b = group.find(
        (o) => !used.has(o.id) && !o.isInternalTransfer && o.id !== a.id && Math.sign(num(o)) === -Math.sign(num(a)) && dayDiff(o.txnDate, a.txnDate) <= 1
      );
      if (!b) continue;
      const sameDesc = (a.description ?? "") === (b.description ?? "");
      const bothTransferish = a.txnType === "이체" || b.txnType === "이체";
      if (a.personId !== b.personId) {
        used.add(a.id).add(b.id);
        crossPairs++;
        if (counted(a) || counted(b)) crossCounted++;
        const typeKey = [a.txnType, b.txnType].sort().join("↔");
        crossTypes.set(typeKey, (crossTypes.get(typeKey) ?? 0) + 1);
      } else if (bothTransferish && !sameDesc) {
        used.add(a.id).add(b.id);
        samePairs++;
        if (counted(a) || counted(b)) sameCounted++;
      }
    }
  }
  console.log(`[B2] 서로 다른 사람 사이 '반대 부호·같은 금액·±1일' 후보 짝: ${crossPairs}쌍, 그중 한쪽이라도 집계에 잡힘: ${crossCounted}쌍`);
  console.log(`     타입 조합: ${[...crossTypes].map(([k, v]) => `${k} ${v}`).join(", ") || "-"}`);
  console.log(`[B3] 같은 사람 안에서 설명만 달라 못 맞춘 이체 후보 짝: ${samePairs}쌍, 그중 집계에 잡힘: ${sameCounted}쌍`);

  const typedTransferLike = txns.filter(
    (t) => t.txnType !== "이체" && counted(t) && (/(이체|송금|계좌)/.test(t.category ?? "") || /(이체|송금)/.test(t.subcategory ?? ""))
  );
  console.log(`[B4] 수입·지출로 들어왔지만 원본 분류가 이체·송금류이고 집계에 잡힌 거래: ${typedTransferLike.length}건`);

  // ── C. 새 가구 단위 이체 짝(적용 시 실제로 묶일 짝) 중 지금 집계에 잡혀 있는 쪽의 내역 ──
  const pairs = findHouseholdTransferPairs(all);
  const affecting = pairs.filter(([a, b]) => counted(a) || counted(b));
  console.log(`
[C] 새로 묶일 내 계좌 이동 짝 ${pairs.length}쌍 중 집계에 잡힌 거래가 포함된 짝: ${affecting.length}쌍`);
  const combo = new Map<string, number>();
  const countedCats = new Map<string, number>();
  const sizes = new Map<string, number>();
  for (const [a, b] of affecting) {
    const who = a.personId === b.personId ? "같은 사람" : "다른 사람";
    const k = `${who} ${[a.txnType, b.txnType].sort().join("↔")}`;
    combo.set(k, (combo.get(k) ?? 0) + 1);
    for (const t of [a, b]) {
      if (!counted(t)) continue;
      const cat = `${t.txnType}:${t.stdCategory ?? "미분류"}`;
      countedCats.set(cat, (countedCats.get(cat) ?? 0) + 1);
    }
    const abs = Math.abs(num(a));
    const size = abs >= 1_000_000 ? "100만원 이상" : abs >= 100_000 ? "10만~100만원" : "10만원 미만";
    sizes.set(size, (sizes.get(size) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "-";
  console.log(`  유형: ${fmt(combo)}`);
  console.log(`  집계에서 빠지게 될 쪽의 (타입:카테고리): ${fmt(countedCats)}`);
  console.log(`  금액대: ${fmt(sizes)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
