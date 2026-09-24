import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "./db";
import {
  allocationTargets,
  assetItems,
  budgetCategories,
  categoryKeywordRules,
  categoryMappings,
  categoryRules,
  households,
  householdInvites,
  householdMembers,
  people,
  transactions,
  uploads,
} from "./finance-db";
import { seedDefaultCategories } from "./default-categories";
import { classifyInvestmentSector } from "./finance-parse/investment-sector";
import type { ParsedTransaction } from "./finance-parse/types";
import { buildMappingIndex, buildRuleIndex, deriveTransactionFields } from "./spending-derive";
import { rederiveTransactions } from "./rederive-transactions";
import { DEMO_HOUSEHOLD_ID, DEMO_PEOPLE, DEMO_PERSON_A, DEMO_PERSON_B } from "./demo-household";

const INSERT_CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// 결정론적(시드 고정) 난수 생성기 - Math.random을 쓰지 않아, 몇 번을 다시 시드해도 항상 같은
// 샘플 데이터가 나온다(멱등성 확인/스냅샷 테스트에 유리).
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function intBetween(rng: () => number, min: number, max: number): number {
  return Math.round(min + rng() * (max - min));
}

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
const DAYS_IN_MONTH: Record<string, number> = {
  "2026-01": 31,
  "2026-02": 28,
  "2026-03": 31,
  "2026-04": 30,
  "2026-05": 31,
  "2026-06": 30,
  "2026-07": 31,
  "2026-08": 31,
};

function randomDate(rng: () => number, month: string): string {
  const day = intBetween(rng, 1, DAYS_IN_MONTH[month]);
  return `${month}-${String(day).padStart(2, "0")}`;
}

type DraftTxn = ParsedTransaction & { personId: string; beneficiary: string };

function pushSpend(
  out: DraftTxn[],
  rng: () => number,
  {
    month,
    personId,
    beneficiary,
    rawCategory,
    rawSubcategory,
    merchants,
    amountMin,
    amountMax,
  }: {
    month: string;
    personId: string;
    beneficiary: string;
    rawCategory: string;
    rawSubcategory: string;
    merchants: readonly string[];
    amountMin: number;
    amountMax: number;
  }
): void {
  out.push({
    txnDate: randomDate(rng, month),
    txnTime: `${String(intBetween(rng, 8, 21)).padStart(2, "0")}:${String(intBetween(rng, 0, 59)).padStart(2, "0")}:00`,
    txnType: "지출",
    category: rawCategory,
    subcategory: rawSubcategory,
    description: pick(rng, merchants),
    amount: -intBetween(rng, amountMin, amountMax),
    paymentMethod: pick(rng, ["체크카드", "신용카드", "간편결제"]),
    personId,
    beneficiary,
  });
}

const VARIABLE_TEMPLATES: {
  rawCategory: string;
  rawSubcategory: string;
  merchants: readonly string[];
  amountMin: number;
  amountMax: number;
  countMin: number;
  countMax: number;
  joint: boolean;
  months?: readonly string[]; // 지정하면 그 달에만 등장(계절성)
}[] = [
  { rawCategory: "식비", rawSubcategory: "한식", merchants: ["동네 김밥천국", "국밥집", "보쌈마을", "분식집", "냉면집"], amountMin: 7000, amountMax: 18000, countMin: 12, countMax: 16, joint: false },
  { rawCategory: "카페/간식", rawSubcategory: "커피/음료", merchants: ["카페 모모", "스타벅스", "커피빈", "투썸플레이스", "메가커피"], amountMin: 3500, amountMax: 9000, countMin: 10, countMax: 14, joint: false },
  { rawCategory: "생활", rawSubcategory: "마트", merchants: ["OO마트", "이마트", "코스트코", "홈플러스"], amountMin: 15000, amountMax: 80000, countMin: 6, countMax: 9, joint: true },
  { rawCategory: "교통", rawSubcategory: "대중교통", merchants: ["티머니 충전", "버스", "지하철"], amountMin: 3000, amountMax: 15000, countMin: 10, countMax: 14, joint: false },
  { rawCategory: "온라인쇼핑", rawSubcategory: "인터넷쇼핑", merchants: ["쿠팡", "네이버쇼핑", "마켓컬리"], amountMin: 10000, amountMax: 60000, countMin: 4, countMax: 6, joint: false },
  { rawCategory: "온라인쇼핑", rawSubcategory: "서비스구독", merchants: ["넷플릭스", "유튜브 프리미엄"], amountMin: 9900, amountMax: 17000, countMin: 1, countMax: 2, joint: true },
  { rawCategory: "문화/여가", rawSubcategory: "영화", merchants: ["CGV", "메가박스"], amountMin: 12000, amountMax: 30000, countMin: 1, countMax: 2, joint: true },
  { rawCategory: "문화/여가", rawSubcategory: "취미/체험", merchants: ["볼링장", "방탈출카페", "클라이밍장"], amountMin: 15000, amountMax: 60000, countMin: 1, countMax: 2, joint: false },
  { rawCategory: "의료/건강", rawSubcategory: "내과/가정의학", merchants: ["연세내과", "행복약국", "서울이비인후과"], amountMin: 8000, amountMax: 40000, countMin: 1, countMax: 3, joint: false },
  { rawCategory: "패션/쇼핑", rawSubcategory: "패션", merchants: ["유니클로", "무신사", "자라"], amountMin: 20000, amountMax: 120000, countMin: 1, countMax: 3, joint: false },
  { rawCategory: "자동차", rawSubcategory: "정비/수리", merchants: ["동네 카센터", "세차장"], amountMin: 20000, amountMax: 150000, countMin: 0, countMax: 2, joint: false },
  { rawCategory: "여행/숙박", rawSubcategory: "숙박비", merchants: ["호텔 예약", "펜션 예약", "항공권 예매"], amountMin: 120000, amountMax: 400000, countMin: 1, countMax: 1, joint: true, months: ["2026-02", "2026-07", "2026-08"] },
];

// 뱅크샐러드 원본 매핑(CATEGORY_MAPPINGS, generic)으로는 못 잡는 고정비들 - 우리집 전용 실명 대신
// 이 가구에서만 쓰는 일반적인 키워드로 category_keyword_rules에 등록해 자동 분류되게 한다.
const DEMO_KEYWORD_RULES: { txnType: string; keyword: string; stdCategory: string }[] = [
  { txnType: "지출", keyword: "관리비", stdCategory: "관리비" },
  { txnType: "지출", keyword: "보험료", stdCategory: "보험" },
  { txnType: "지출", keyword: "도시가스", stdCategory: "가스비" },
  { txnType: "지출", keyword: "대출 이자", stdCategory: "대출원리금" },
];

const BUDGET_OVERRIDES: { name: string; monthlyBudget: number }[] = [
  { name: "관리비", monthlyBudget: 300000 },
  { name: "보험", monthlyBudget: 120000 },
  { name: "가스비", monthlyBudget: 50000 },
  { name: "대출원리금", monthlyBudget: 900000 },
  { name: "통신", monthlyBudget: 90000 },
  { name: "교통", monthlyBudget: 150000 },
  { name: "식비", monthlyBudget: 500000 },
  { name: "식재료", monthlyBudget: 250000 },
  { name: "카페", monthlyBudget: 100000 },
  { name: "생필품", monthlyBudget: 100000 },
  { name: "병원", monthlyBudget: 50000 },
  { name: "자동차", monthlyBudget: 100000 },
  { name: "여행", monthlyBudget: 250000 },
  { name: "구독", monthlyBudget: 30000 },
  { name: "패션", monthlyBudget: 100000 },
  { name: "문화", monthlyBudget: 120000 },
];

type AssetDraft = {
  personId: string;
  side: "asset" | "debt";
  category: string;
  productName: string;
  amount: number;
  costBasis?: number | null;
  sector?: string | null;
};

function buildAssetItems(): AssetDraft[] {
  const investment = (personId: string, productName: string, costBasis: number, value: number): AssetDraft => ({
    personId,
    side: "asset",
    category: "투자성 자산",
    productName,
    amount: value,
    costBasis,
    sector: classifyInvestmentSector(productName),
  });

  return [
    { personId: DEMO_PERSON_A, side: "asset", category: "자유입출금 자산", productName: "지훈 입출금통장", amount: 3_500_000 },
    { personId: DEMO_PERSON_A, side: "asset", category: "저축성 자산", productName: "지훈 정기적금", amount: 15_000_000 },
    investment(DEMO_PERSON_A, "KODEX 200", 5_000_000, 5_600_000),
    investment(DEMO_PERSON_A, "TIGER 미국S&P500", 8_000_000, 9_350_000),
    investment(DEMO_PERSON_A, "삼성전자", 4_200_000, 3_650_000),
    investment(DEMO_PERSON_A, "연금저축펀드", 6_000_000, 6_240_000),
    { personId: DEMO_PERSON_A, side: "debt", category: "대출", productName: "전세자금대출", amount: 20_000_000 },

    { personId: DEMO_PERSON_B, side: "asset", category: "자유입출금 자산", productName: "수아 입출금통장", amount: 2_800_000 },
    { personId: DEMO_PERSON_B, side: "asset", category: "저축성 자산", productName: "수아 청약저축", amount: 8_000_000 },
    investment(DEMO_PERSON_B, "TIGER 미국나스닥100", 6_500_000, 7_930_000),
    investment(DEMO_PERSON_B, "애플", 3_100_000, 2_790_000),
    investment(DEMO_PERSON_B, "엔비디아", 2_000_000, 4_380_000),
    investment(DEMO_PERSON_B, "연금저축펀드", 3_000_000, 3_300_000),
    { personId: DEMO_PERSON_B, side: "debt", category: "마이너스통장", productName: "마이너스통장", amount: 3_000_000 },
  ];
}

/** 대시보드 자산 구성 화면에 실제로 표시되는 카테고리(app/finance/page.tsx의 표시용 재분류 기준)만 대상. */
const ALLOCATION_TARGETS: { category: string; targetPct: number }[] = [
  { category: "현금", targetPct: 15 },
  { category: "예적금", targetPct: 35 },
  { category: "투자성 자산", targetPct: 50 },
];

function buildTransactions(): DraftTxn[] {
  const rng = mulberry32(20260101);
  const out: DraftTxn[] = [];

  for (const month of MONTHS) {
    // 월급(수입) - 내장 급여 키워드 규칙("급여"/"월급" 포함 시 자동으로 "월급")이 잡도록 설명에 "급여"를 넣는다.
    out.push({
      txnDate: `${month}-25`,
      txnTime: "09:00:00",
      txnType: "수입",
      category: "금융수입",
      subcategory: "미분류",
      description: `${Number(month.slice(5, 7))}월 급여`,
      amount: intBetween(rng, 3_400_000, 3_700_000),
      paymentMethod: "급여이체",
      personId: DEMO_PERSON_A,
      beneficiary: DEMO_PERSON_A,
    });
    out.push({
      txnDate: `${month}-25`,
      txnTime: "09:05:00",
      txnType: "수입",
      category: "금융수입",
      subcategory: "미분류",
      description: `${Number(month.slice(5, 7))}월 급여`,
      amount: intBetween(rng, 2_900_000, 3_200_000),
      paymentMethod: "급여이체",
      personId: DEMO_PERSON_B,
      beneficiary: DEMO_PERSON_B,
    });

    // 고정비(통신/보험/관리비/가스비/대출이자) - DEMO_KEYWORD_RULES 키워드로 자동 분류된다.
    pushSpend(out, rng, { month, personId: DEMO_PERSON_A, beneficiary: DEMO_PERSON_A, rawCategory: "주거/통신", rawSubcategory: "휴대폰", merchants: ["휴대폰 요금"], amountMin: 45000, amountMax: 55000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_B, beneficiary: DEMO_PERSON_B, rawCategory: "주거/통신", rawSubcategory: "휴대폰", merchants: ["휴대폰 요금"], amountMin: 40000, amountMax: 50000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_A, beneficiary: "joint", rawCategory: "생활", rawSubcategory: "미분류", merchants: ["아파트 관리비"], amountMin: 250000, amountMax: 320000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_A, beneficiary: DEMO_PERSON_A, rawCategory: "금융", rawSubcategory: "미분류", merchants: ["실손보험료 자동이체"], amountMin: 80000, amountMax: 95000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_B, beneficiary: DEMO_PERSON_B, rawCategory: "금융", rawSubcategory: "미분류", merchants: ["운전자보험료 납입"], amountMin: 30000, amountMax: 40000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_A, beneficiary: "joint", rawCategory: "생활", rawSubcategory: "미분류", merchants: ["도시가스 요금"], amountMin: 30000, amountMax: 70000 });
    pushSpend(out, rng, { month, personId: DEMO_PERSON_A, beneficiary: "joint", rawCategory: "금융", rawSubcategory: "미분류", merchants: ["전세자금대출 이자"], amountMin: 150000, amountMax: 180000 });

    // 변동비 - 카테고리 템플릿마다 건수를 랜덤으로 뽑아 두 사람에게 나눠 붙인다.
    for (const tpl of VARIABLE_TEMPLATES) {
      if (tpl.months && !tpl.months.includes(month)) continue;
      const count = intBetween(rng, tpl.countMin, tpl.countMax);
      for (let i = 0; i < count; i++) {
        const personId = rng() < 0.5 ? DEMO_PERSON_A : DEMO_PERSON_B;
        pushSpend(out, rng, {
          month,
          personId,
          beneficiary: tpl.joint ? "joint" : personId,
          rawCategory: tpl.rawCategory,
          rawSubcategory: tpl.rawSubcategory,
          merchants: tpl.merchants,
          amountMin: tpl.amountMin,
          amountMax: tpl.amountMax,
        });
      }
    }

    // 저축/투자 이체 - 자기 계좌 간 이동(짝이 맞으면 matchSelfTransferPairs가 자기계좌이체로 잡아 제외).
    // "몇 건"만 필요하므로 넉 달에 한 번씩만 넣는다.
    const monthIndex = MONTHS.indexOf(month);
    if (monthIndex % 4 === 0) {
      const amount = 500_000;
      const desc = `적금 자동이체 ${month}`;
      const time = "07:00:00";
      out.push({ txnDate: `${month}-05`, txnTime: time, txnType: "이체", category: "저축", subcategory: "미분류", description: desc, amount: -amount, paymentMethod: "자동이체", personId: DEMO_PERSON_A, beneficiary: DEMO_PERSON_A });
      out.push({ txnDate: `${month}-05`, txnTime: time, txnType: "이체", category: "저축", subcategory: "미분류", description: desc, amount, paymentMethod: "자동이체", personId: DEMO_PERSON_A, beneficiary: DEMO_PERSON_A });
    }
    if (monthIndex % 4 === 2) {
      const amount = 300_000;
      const desc = `적립식 투자 이체 ${month}`;
      const time = "07:30:00";
      out.push({ txnDate: `${month}-10`, txnTime: time, txnType: "이체", category: "투자", subcategory: "미분류", description: desc, amount: -amount, paymentMethod: "자동이체", personId: DEMO_PERSON_B, beneficiary: DEMO_PERSON_B });
      out.push({ txnDate: `${month}-10`, txnTime: time, txnType: "이체", category: "투자", subcategory: "미분류", description: desc, amount, paymentMethod: "자동이체", personId: DEMO_PERSON_B, beneficiary: DEMO_PERSON_B });
    }

    // 부부간 생활비 정산 - 서로 다른 사람의 거래로 나뉘어 들어가지만, 같은 설명+금액+반대부호로
    // matchSelfTransferPairs가 자기계좌이체 쌍으로 잡아 집계에서 제외한다.
    if (monthIndex % 4 === 1) {
      const amount = 300_000;
      const desc = `생활비 정산 ${month}`;
      const time = "20:00:00";
      out.push({ txnDate: `${month}-15`, txnTime: time, txnType: "이체", category: "내계좌이체", subcategory: "미분류", description: desc, amount: -amount, paymentMethod: "계좌이체", personId: DEMO_PERSON_A, beneficiary: "joint" });
      out.push({ txnDate: `${month}-15`, txnTime: time, txnType: "이체", category: "내계좌이체", subcategory: "미분류", description: desc, amount, paymentMethod: "계좌이체", personId: DEMO_PERSON_B, beneficiary: "joint" });
    }
  }

  return out;
}

export interface DemoSeedSummary {
  people: number;
  uploads: number;
  transactions: number;
  assetItems: number;
  allocationTargets: number;
  months: string[];
}

/**
 * "샘플 가구"(DEMO_HOUSEHOLD_ID)를 처음부터 다시 만든다. 멱등 - 먼저 이 가구의 모든 행을
 * FK 안전 순서로 지우고 다시 채운다. neon-http는 트랜잭션을 지원하지 않으므로 db.transaction을
 * 쓰지 않고 순차적으로 실행하며, 대량 insert는 청크(500건)로 나눈다.
 */
export async function seedDemoHousehold(db: AppDb): Promise<DemoSeedSummary> {
  // 1) 기존 샘플 데이터 삭제 (자식 -> 부모 순서)
  await db.delete(transactions).where(eq(transactions.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(assetItems).where(eq(assetItems.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(allocationTargets).where(eq(allocationTargets.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(uploads).where(eq(uploads.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(categoryRules).where(eq(categoryRules.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(categoryMappings).where(eq(categoryMappings.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(budgetCategories).where(eq(budgetCategories.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(people).where(eq(people.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(householdMembers).where(eq(householdMembers.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(householdInvites).where(eq(householdInvites.householdId, DEMO_HOUSEHOLD_ID));
  await db.delete(households).where(eq(households.id, DEMO_HOUSEHOLD_ID));

  // 2) 가구 + 구성원
  await db.insert(households).values({ id: DEMO_HOUSEHOLD_ID, name: "샘플 가구" });
  await db.insert(people).values(DEMO_PEOPLE.map((p) => ({ ...p, householdId: DEMO_HOUSEHOLD_ID })));

  // 3) 사람별 업로드 1건(활성)
  const uploadIdByPerson = new Map<string, string>(DEMO_PEOPLE.map((p) => [p.id, randomUUID()]));
  await db.insert(uploads).values(
    DEMO_PEOPLE.map((p) => ({
      id: uploadIdByPerson.get(p.id)!,
      householdId: DEMO_HOUSEHOLD_ID,
      personId: p.id,
      sourceFilename: "샘플.xlsx",
      periodStart: "2026-01-01",
      periodEnd: "2026-08-31",
      isActive: true,
    }))
  );

  // 4) 기본 카테고리매핑/예산(일반형 - 우리집 전용 항목 제외) + 이 가구만의 고정비 키워드 규칙
  await seedDefaultCategories(db, DEMO_HOUSEHOLD_ID, { generic: true });
  for (const kr of DEMO_KEYWORD_RULES) {
    await db.insert(categoryKeywordRules).values({ ...kr, householdId: DEMO_HOUSEHOLD_ID });
  }
  for (const b of BUDGET_OVERRIDES) {
    await db
      .update(budgetCategories)
      .set({ monthlyBudget: b.monthlyBudget.toString() })
      .where(and(eq(budgetCategories.householdId, DEMO_HOUSEHOLD_ID), eq(budgetCategories.name, b.name)));
  }

  // 5) 거래 생성 - 실제 업로드 경로(deriveTransactionFields/matchSelfTransferPairs)를 그대로 재사용해
  // std_category/included/is_internal_transfer를 계산한다(플래그를 손으로 정하지 않는다).
  const draftTxns = buildTransactions();
  const [mappingRows, ruleRows, keywordRuleRows] = await Promise.all([
    db.select().from(categoryMappings).where(eq(categoryMappings.householdId, DEMO_HOUSEHOLD_ID)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, DEMO_HOUSEHOLD_ID)),
    db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, DEMO_HOUSEHOLD_ID)),
  ]);
  const mappingIndex = buildMappingIndex(mappingRows);
  const ruleIndex = buildRuleIndex(ruleRows);
  const derived = deriveTransactionFields(draftTxns, mappingIndex, ruleIndex, keywordRuleRows);

  const txnRows = draftTxns.map((t, i) => ({
    householdId: DEMO_HOUSEHOLD_ID,
    uploadId: uploadIdByPerson.get(t.personId)!,
    personId: t.personId,
    txnDate: t.txnDate,
    txnTime: t.txnTime,
    txnType: t.txnType,
    category: t.category,
    subcategory: t.subcategory,
    description: t.description,
    amount: t.amount.toString(),
    paymentMethod: t.paymentMethod,
    stdCategory: derived[i].stdCategory,
    included: derived[i].included,
    isInternalTransfer: derived[i].isInternalTransfer,
    beneficiary: t.beneficiary,
  }));
  for (const rows of chunk(txnRows, INSERT_CHUNK_SIZE)) {
    await db.insert(transactions).values(rows);
  }

  // 6) 규칙 변경은 없었지만, 요구사항대로 실제 재계산 경로를 한 번 더 태워 std_category/included가
  // 저장된 값과 항상 일치함을 보장한다(정상 케이스라면 변경 건수는 0).
  await rederiveTransactions(db, DEMO_HOUSEHOLD_ID);

  // 7) 자산(현금/예적금/투자/부채)
  const assetDrafts = buildAssetItems();
  const assetRows = assetDrafts.map((item) => ({
    householdId: DEMO_HOUSEHOLD_ID,
    uploadId: uploadIdByPerson.get(item.personId)!,
    personId: item.personId,
    side: item.side,
    category: item.category,
    productName: item.productName,
    amount: item.amount.toString(),
    costBasis: item.costBasis == null ? null : item.costBasis.toString(),
    sector: item.sector ?? null,
  }));
  for (const rows of chunk(assetRows, INSERT_CHUNK_SIZE)) {
    await db.insert(assetItems).values(rows);
  }

  // 8) 목표 배분
  await db.insert(allocationTargets).values(
    ALLOCATION_TARGETS.map((t) => ({ householdId: DEMO_HOUSEHOLD_ID, category: t.category, targetPct: t.targetPct.toString() }))
  );

  return {
    people: DEMO_PEOPLE.length,
    uploads: uploadIdByPerson.size,
    transactions: txnRows.length,
    assetItems: assetRows.length,
    allocationTargets: ALLOCATION_TARGETS.length,
    months: MONTHS,
  };
}
