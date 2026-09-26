// 읽기 전용 분석: 현재 분류(사용자가 검토·수정한 결과)를 정답으로 보고, 분류 방식별 정확도를
// leave-one-out(그 거래 자신은 빼고 학습)으로 비교한다. 카테고리명·뱅크샐러드 분류명·건수만 출력한다.
// 실행: npx tsx scripts/analyze-category-strategies.ts
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

const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID ?? "a1f94fe6-44b6-4a58-ab1a-6433606e3d86";
const pct = (a: number, b: number) => (b === 0 ? "-" : `${((a / b) * 100).toFixed(1)}%`);

type Tally = Map<string, Map<string, number>>;
function add(t: Tally, key: string, cat: string, d = 1) {
  const m = t.get(key) ?? new Map<string, number>();
  m.set(cat, (m.get(cat) ?? 0) + d);
  t.set(key, m);
}
// leave-one-out 다수결: self의 카테고리를 1 빼고 계산. share 기준 미달이면 null.
function vote(t: Tally, key: string, selfCat: string, minShare = 0, minCount = 1): string | null {
  const m = t.get(key);
  if (!m) return null;
  let best = "";
  let bestN = 0;
  let total = 0;
  for (const [c, n0] of m) {
    const n = c === selfCat ? n0 - 1 : n0;
    if (n <= 0) continue;
    total += n;
    if (n > bestN) [best, bestN] = [c, n];
  }
  if (!best || total < minCount || bestN / total < minShare) return null;
  return best;
}
const amountBucket = (t: Txn) => {
  const a = Math.abs(Number(t.amount));
  return a < 10_000 ? "1만미만" : a < 50_000 ? "1~5만" : a < 200_000 ? "5~20만" : a < 1_000_000 ? "20~100만" : "100만+";
};

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

  // 정답 집합: 분류된 수입·지출(집계 제외 '자산수정'은 제외 — 분류가 아니라 제외 판정이라서)
  const rows = all.filter((t) => (t.txnType === "수입" || t.txnType === "지출") && t.stdCategory && t.stdCategory !== "자산수정" && !(t.category === "서울페이" && t.subcategory === "구매"));
  const merchant = (t: Txn) => `${suggestKeywordFromDescription(t.description)}|${t.txnType}`;
  const combo = (t: Txn) => `${t.txnType}|${t.category ?? "미분류"}|${t.subcategory ?? "미분류"}`;
  const comboCat = (t: Txn) => `${t.txnType}|${t.category ?? "미분류"}`;

  const byMerchant: Tally = new Map();
  const byCombo: Tally = new Map();
  const byComboCat: Tally = new Map();
  const byMerchantCombo: Tally = new Map();
  const byMerchantAmount: Tally = new Map();
  for (const t of rows) {
    add(byMerchant, merchant(t), t.stdCategory!);
    add(byCombo, combo(t), t.stdCategory!);
    add(byComboCat, comboCat(t), t.stdCategory!);
    add(byMerchantCombo, `${merchant(t)}|${combo(t)}`, t.stdCategory!);
    add(byMerchantAmount, `${merchant(t)}|${amountBucket(t)}`, t.stdCategory!);
  }

  console.log(`평가 대상(분류된 수입·지출): ${rows.length}건, 우리집 카테고리 ${new Set(rows.map((t) => t.stdCategory)).size}개`);

  // ── 1. 우리집 카테고리별 건수와 '뱅크샐러드 원본 분류가 얼마나 하나로 모이는지' ──
  const byStd: Tally = new Map();
  for (const t of rows) add(byStd, t.stdCategory!, combo(t));
  console.log("\n[1] 우리집 카테고리별: 건수 / 주로 오는 뱅크샐러드 분류(상위 2개, 비율)");
  for (const [std, m] of [...byStd].sort((a, b) => sum(b[1]) - sum(a[1]))) {
    const total = sum(m);
    const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `${k.replace(/\|/g, "/")} ${pct(n, total)}`).join(", ");
    console.log(`  ${std}: ${total}건 — ${top}`);
  }

  // ── 2. 뱅크샐러드 원본 조합의 순도: 한 조합이 우리집 카테고리 하나로 가는 비율 ──
  let pureRows = 0;
  let mixedRows = 0;
  const mixed: [string, number, string][] = [];
  for (const [k, m] of byCombo) {
    const total = sum(m);
    const top = Math.max(...m.values());
    if (top / total >= 0.95) pureRows += total;
    else {
      mixedRows += total;
      mixed.push([k, total, [...m].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c} ${n}`).join(", ")]);
    }
  }
  console.log(`\n[2] 뱅크샐러드 원본 조합 기준: 95% 이상 한 카테고리로 가는 조합의 거래 ${pureRows}건 (${pct(pureRows, rows.length)}), 섞인 조합의 거래 ${mixedRows}건`);
  console.log("  섞인 조합 상위 12개 (조합: 건수 → 우리집 카테고리 분포):");
  for (const [k, n, dist] of mixed.sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${k.replace(/\|/g, "/")}: ${n} → ${dist}`);

  // ── 3. 방식별 leave-one-out 정확도 ──
  type Strategy = { name: string; predict: (t: Txn) => string | null };
  const currentRules = (t: Txn) =>
    mapStdCategory({ ...t, amount: Number(t.amount), txnType: t.txnType as "수입" | "지출" | "이체" }, mappingIndex, ruleIndex, keywordRules);
  const chain = (...fns: ((t: Txn) => string | null)[]) => (t: Txn) => {
    for (const f of fns) {
      const r = f(t);
      if (r) return r;
    }
    return null;
  };
  const m0 = (t: Txn) => vote(byMerchant, merchant(t), t.stdCategory!);
  const m80 = (t: Txn) => vote(byMerchant, merchant(t), t.stdCategory!, 0.8);
  const mc = (t: Txn) => vote(byMerchantCombo, `${merchant(t)}|${combo(t)}`, t.stdCategory!);
  const ma = (t: Txn) => vote(byMerchantAmount, `${merchant(t)}|${amountBucket(t)}`, t.stdCategory!);
  const cb = (t: Txn) => vote(byCombo, combo(t), t.stdCategory!);
  const cc = (t: Txn) => vote(byComboCat, comboCat(t), t.stdCategory!);
  const stdNames = new Set(rows.map((t) => t.stdCategory!));
  function nameMatch(t: Txn): string | null {
    // 뱅크샐러드 앱에 우리집 카테고리를 만들어 쓰면 원본 소분류/대분류가 이름 그대로 온다.
    // "미분류"는 뱅크샐러드의 빈 분류 표시라 이름이 같아도 카테고리로 쓰지 않는다.
    if (t.subcategory && t.subcategory !== "미분류" && stdNames.has(t.subcategory)) return t.subcategory;
    if (t.category && t.category !== "미분류" && stdNames.has(t.category)) return t.category;
    return null;
  }
  function keywordOnly(t: Txn): string | null {
    const d = (t.description ?? "").toLowerCase();
    for (const kr of keywordRules) {
      if (kr.txnType !== "전체" && kr.txnType !== t.txnType) continue;
      if (kr.keyword && d.includes(kr.keyword.toLowerCase())) return kr.stdCategory;
    }
    return null;
  }

  const strategies: Strategy[] = [
    { name: "A. 현재 규칙만(키워드→결제수단→급여→매핑)", predict: currentRules },
    { name: "B. 현재 규칙 → 가맹점 다수결(80%)  [지금 배포된 방식에 가까움]", predict: chain(currentRules, m80) },
    { name: "C. 원본 조합 다수결만", predict: cb },
    { name: "D. 가맹점 다수결 → 원본 조합 다수결", predict: chain(m0, cb, cc) },
    { name: "E. 가맹점+원본조합 → 가맹점 → 원본조합 → 대분류", predict: chain(mc, m0, cb, cc) },
    { name: "F. 가맹점+금액대 → 가맹점 → 원본조합 → 대분류", predict: chain(ma, m0, cb, cc) },
    { name: "G. 키워드 규칙 → E", predict: chain(keywordOnly, mc, m0, cb, cc) },
    { name: "H. 이름 일치(뱅크샐러드 소분류·대분류 = 우리집 카테고리명) → C", predict: chain(nameMatch, cb, cc) },
    { name: "J. 가맹점+원본조합 → 원본조합 → 대분류 → 가맹점", predict: chain(mc, cb, cc, m0) },
    { name: "K. 가맹점+원본조합(2건 이상·100% 일치일 때만) → 원본조합 → 대분류 → 가맹점", predict: chain((t) => vote(byMerchantCombo, `${merchant(t)}|${combo(t)}`, t.stdCategory!, 1, 2), cb, cc, m0) },
    { name: "I. 키워드 → 이름 일치 → 가맹점+원본조합 → 원본조합 → 가맹점 → 대분류", predict: chain(keywordOnly, nameMatch, mc, cb, m0, cc) },
  ];

  const lockedRows = rows.filter((t) => t.categoryLocked);
  console.log(`\n[3] 방식별 정확도(자기 자신 제외 학습) — 맞힘 / 틀림 / 미분류. 전체 ${rows.length}건 | 직접 고친 ${lockedRows.length}건만`);
  for (const s of strategies) {
    const score = (set: Txn[]) => {
      let ok = 0;
      let wrong = 0;
      let none = 0;
      for (const t of set) {
        const p = s.predict(t);
        if (!p) none++;
        else if (p === t.stdCategory) ok++;
        else wrong++;
      }
      return `${pct(ok, set.length)} / ${pct(wrong, set.length)} / ${pct(none, set.length)}`;
    };
    console.log(`  ${s.name}\n     전체: ${score(rows)}   | 직접 고친 거래: ${score(lockedRows)}`);
  }

  // ── 4. 방식 E가 틀리는 곳: 어떤 카테고리끼리 헷갈리는지 ──
  const confusions = new Map<string, number>();
  const best = strategies[4].predict;
  for (const t of rows) {
    const p = best(t);
    if (p && p !== t.stdCategory) confusions.set(`${t.stdCategory} ← ${p}`, (confusions.get(`${t.stdCategory} ← ${p}`) ?? 0) + 1);
  }
  console.log("\n[4] 방식 E가 틀린 조합 상위 12개 (정답 ← 예측):");
  for (const [k, n] of [...confusions].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${k}: ${n}`);

  // ── 4b. 키워드 규칙별: 걸리는 거래 수 / 그중 현재 분류와 다른(충돌) 수 ──
  console.log("\n[4b] 키워드 규칙별 적중·충돌 (충돌 많은 순, 충돌 0인 규칙은 생략)");
  const ruleStats = keywordRules.map((kr) => {
    const hits = rows.filter((t) => (kr.txnType === "전체" || kr.txnType === t.txnType) && kr.keyword && (t.description ?? "").toLowerCase().includes(kr.keyword.toLowerCase()));
    const conflicts = hits.filter((t) => t.stdCategory !== kr.stdCategory);
    const actual = new Map<string, number>();
    for (const t of conflicts) actual.set(t.stdCategory!, (actual.get(t.stdCategory!) ?? 0) + 1);
    return { kr, hits: hits.length, conflicts: conflicts.length, actual };
  });
  for (const r of ruleStats.filter((r) => r.conflicts > 0).sort((a, b) => b.conflicts - a.conflicts)) {
    console.log(`   '${r.kr.keyword}'(${r.kr.txnType}) → ${r.kr.stdCategory}: 적중 ${r.hits}, 충돌 ${r.conflicts} (실제: ${[...r.actual].map(([c, n]) => `${c} ${n}`).join(", ")})`);
  }
  console.log(`   충돌 없는 규칙 ${ruleStats.filter((r) => r.conflicts === 0).length}개 (그중 적중 0인 규칙 ${ruleStats.filter((r) => r.hits === 0).length}개)`);

  // ── 5. 가맹점 첫 등장(학습할 이력이 없는 가맹점) 비율 ──
  const firstSeen = rows.filter((t) => sum(byMerchant.get(merchant(t))!) <= 1).length;
  console.log(`\n[5] 이력이 한 번뿐인(새) 가맹점 거래: ${firstSeen}건 (${pct(firstSeen, rows.length)}) — 이 몫은 원본 조합·대분류로만 추정 가능`);
}

function sum(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
