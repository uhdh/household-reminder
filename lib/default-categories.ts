import type { AppDb } from "./db";
import { budgetCategories, categoryKeywordRules, categoryMappings } from "./finance-db";

// 참고 파일(가계부자동화_v1.0_7월_수궁.xlsx)의 '카테고리매핑' 시트 61건을 그대로 시딩한다.
// scripts/seed-spending.ts("우리집" 재시딩용)와 온보딩(새 가구 생성 시 기본값)이 이 데이터를 공유한다.
export const CATEGORY_MAPPINGS: {
  txnType: string;
  rawCategory: string;
  rawSubcategory: string;
  stdCategory: string;
}[] = [
  { txnType: "수입", rawCategory: "금융수입", rawSubcategory: "미분류", stdCategory: "금융수입" },
  { txnType: "수입", rawCategory: "기타수입", rawSubcategory: "미분류", stdCategory: "기타수입" },
  { txnType: "수입", rawCategory: "미분류", rawSubcategory: "미분류", stdCategory: "기타수입" },
  { txnType: "지출", rawCategory: "교통", rawSubcategory: "대중교통", stdCategory: "교통" },
  { txnType: "지출", rawCategory: "금융", rawSubcategory: "세금/과태료", stdCategory: "세금" },
  { txnType: "지출", rawCategory: "금융", rawSubcategory: "은행", stdCategory: "기타" },
  { txnType: "지출", rawCategory: "금융", rawSubcategory: "카드", stdCategory: "기타" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "마사지/스파", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "전시/관람", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "취미/체험", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "영화", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "게임", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "미분류", rawSubcategory: "미분류", stdCategory: "기타" },
  { txnType: "지출", rawCategory: "뷰티/미용", rawSubcategory: "헤어샵", stdCategory: "미용" },
  { txnType: "지출", rawCategory: "생활", rawSubcategory: "가구/가전", stdCategory: "생필품" },
  { txnType: "지출", rawCategory: "생활", rawSubcategory: "마트", stdCategory: "식재료" },
  { txnType: "지출", rawCategory: "생활", rawSubcategory: "편의점", stdCategory: "생필품" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "배달", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "양식", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "일식", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "패스트푸드", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "한식", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "피자", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "아시아음식", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "식비", rawSubcategory: "미분류", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "숙박비", stdCategory: "여행" },
  { txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "여행", stdCategory: "여행" },
  { txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "해외결제", stdCategory: "여행" },
  { txnType: "지출", rawCategory: "온라인쇼핑", rawSubcategory: "결제/충전", stdCategory: "기타" },
  { txnType: "지출", rawCategory: "온라인쇼핑", rawSubcategory: "서비스구독", stdCategory: "구독" },
  { txnType: "지출", rawCategory: "온라인쇼핑", rawSubcategory: "인터넷쇼핑", stdCategory: "기타" },
  { txnType: "지출", rawCategory: "의료/건강", rawSubcategory: "내과/가정의학", stdCategory: "병원" },
  { txnType: "지출", rawCategory: "의료/건강", rawSubcategory: "약국", stdCategory: "병원" },
  { txnType: "지출", rawCategory: "의료/건강", rawSubcategory: "이비인후과", stdCategory: "병원" },
  { txnType: "지출", rawCategory: "주거/통신", rawSubcategory: "인터넷", stdCategory: "통신" },
  { txnType: "지출", rawCategory: "주거/통신", rawSubcategory: "휴대폰", stdCategory: "통신" },
  { txnType: "지출", rawCategory: "카페/간식", rawSubcategory: "아이스크림/빙수", stdCategory: "카페" },
  { txnType: "지출", rawCategory: "카페/간식", rawSubcategory: "커피/음료", stdCategory: "카페" },
  { txnType: "지출", rawCategory: "패션/쇼핑", rawSubcategory: "스포츠의류", stdCategory: "패션" },
  { txnType: "지출", rawCategory: "패션/쇼핑", rawSubcategory: "아울렛/몰", stdCategory: "패션" },
  { txnType: "지출", rawCategory: "패션/쇼핑", rawSubcategory: "패션", stdCategory: "패션" },
  { txnType: "지출", rawCategory: "생활", rawSubcategory: "미분류", stdCategory: "생필품" },
  { txnType: "지출", rawCategory: "문화/여가", rawSubcategory: "미분류", stdCategory: "문화" },
  { txnType: "지출", rawCategory: "식사", rawSubcategory: "미분류", stdCategory: "식비" },
  { txnType: "지출", rawCategory: "자동차", rawSubcategory: "정비/수리", stdCategory: "자동차" },
  { txnType: "지출", rawCategory: "자동차", rawSubcategory: "미분류", stdCategory: "자동차" },
  { txnType: "지출", rawCategory: "교육", rawSubcategory: "미분류", stdCategory: "교육" },
  { txnType: "지출", rawCategory: "주거/통신", rawSubcategory: "미분류", stdCategory: "주거/통신" },
  { txnType: "지출", rawCategory: "여행/숙박", rawSubcategory: "미분류", stdCategory: "여행" },
  { txnType: "지출", rawCategory: "카페/간식", rawSubcategory: "미분류", stdCategory: "카페" },
  { txnType: "지출", rawCategory: "의복/미용", rawSubcategory: "미분류", stdCategory: "패션/미용" },
  { txnType: "지출", rawCategory: "술/유흥", rawSubcategory: "미분류", stdCategory: "술/유흥" },
  { txnType: "지출", rawCategory: "육아", rawSubcategory: "미분류", stdCategory: "육아" },
  { txnType: "지출", rawCategory: "의료/건강", rawSubcategory: "미분류", stdCategory: "건강식품" },
  { txnType: "수입", rawCategory: "용돈", rawSubcategory: "미분류", stdCategory: "기타수입" },
  { txnType: "지출", rawCategory: "교통", rawSubcategory: "미분류", stdCategory: "교통" },
  { txnType: "이체", rawCategory: "저축", rawSubcategory: "미분류", stdCategory: "월급" },
  { txnType: "수입", rawCategory: "금융수입", rawSubcategory: "월급", stdCategory: "월급" },
  { txnType: "지출", rawCategory: "금융", rawSubcategory: "엄마용돈", stdCategory: "엄마용돈" },
  { txnType: "이체", rawCategory: "투자", rawSubcategory: "미분류", stdCategory: "월급" },
];

// '카테고리' 시트(고정비/변동비/수입 성격 분류)와 '대쉬보드_월별지출' F열(예산)을 합쳐 시딩한다.
export const BUDGET_CATEGORIES: {
  name: string;
  kind: "고정비" | "변동비" | "고정수입" | "변동수입";
  sortOrder: number;
  monthlyBudget: number | null;
}[] = [
  // 고정비
  { name: "관리비", kind: "고정비", sortOrder: 1, monthlyBudget: 300000 },
  { name: "대출원리금", kind: "고정비", sortOrder: 2, monthlyBudget: 1735300 },
  { name: "통신", kind: "고정비", sortOrder: 3, monthlyBudget: 70000 },
  { name: "교통", kind: "고정비", sortOrder: 4, monthlyBudget: 100000 },
  { name: "보험", kind: "고정비", sortOrder: 5, monthlyBudget: 181663 },
  { name: "세금", kind: "고정비", sortOrder: 6, monthlyBudget: null },
  { name: "가스비", kind: "고정비", sortOrder: 7, monthlyBudget: 63000 },
  { name: "엄마용돈", kind: "고정비", sortOrder: 8, monthlyBudget: 200000 },
  { name: "주유", kind: "고정비", sortOrder: 9, monthlyBudget: 90000 },
  // 변동비
  { name: "식재료", kind: "변동비", sortOrder: 10, monthlyBudget: 200000 },
  { name: "식비", kind: "변동비", sortOrder: 11, monthlyBudget: 400000 },
  { name: "취미", kind: "변동비", sortOrder: 12, monthlyBudget: null },
  { name: "카페", kind: "변동비", sortOrder: 13, monthlyBudget: 40000 },
  { name: "생필품", kind: "변동비", sortOrder: 14, monthlyBudget: 100000 },
  { name: "병원", kind: "변동비", sortOrder: 15, monthlyBudget: null },
  { name: "운동", kind: "변동비", sortOrder: 16, monthlyBudget: 100000 },
  { name: "배달", kind: "변동비", sortOrder: 17, monthlyBudget: 50000 },
  { name: "패션", kind: "변동비", sortOrder: 18, monthlyBudget: 50000 },
  { name: "영양제", kind: "변동비", sortOrder: 19, monthlyBudget: 70000 },
  { name: "선물", kind: "변동비", sortOrder: 20, monthlyBudget: null },
  { name: "데이트", kind: "변동비", sortOrder: 21, monthlyBudget: null },
  { name: "자동차", kind: "변동비", sortOrder: 22, monthlyBudget: null },
  { name: "렌트카", kind: "변동비", sortOrder: 23, monthlyBudget: 10000 },
  { name: "미용", kind: "변동비", sortOrder: 24, monthlyBudget: null },
  { name: "구독", kind: "변동비", sortOrder: 25, monthlyBudget: 20000 },
  { name: "문화", kind: "변동비", sortOrder: 26, monthlyBudget: 100000 },
  { name: "경조사", kind: "변동비", sortOrder: 27, monthlyBudget: 100000 },
  { name: "기타", kind: "변동비", sortOrder: 28, monthlyBudget: null },
  { name: "연간비용", kind: "변동비", sortOrder: 29, monthlyBudget: null },
  { name: "택시", kind: "변동비", sortOrder: 30, monthlyBudget: null },
  { name: "마사지", kind: "변동비", sortOrder: 31, monthlyBudget: null },
  { name: "여행", kind: "변동비", sortOrder: 32, monthlyBudget: null },
  // 카테고리매핑에는 있지만 '카테고리' 시트에는 없던 표준카테고리(누락 보강)
  { name: "교육", kind: "변동비", sortOrder: 33, monthlyBudget: null },
  { name: "주거/통신", kind: "변동비", sortOrder: 34, monthlyBudget: null },
  { name: "패션/미용", kind: "변동비", sortOrder: 35, monthlyBudget: null },
  { name: "술/유흥", kind: "변동비", sortOrder: 36, monthlyBudget: null },
  { name: "육아", kind: "변동비", sortOrder: 37, monthlyBudget: null },
  { name: "건강식품", kind: "변동비", sortOrder: 38, monthlyBudget: null },
  // 수입
  { name: "월급", kind: "고정수입", sortOrder: 40, monthlyBudget: null },
  { name: "금융수입", kind: "변동수입", sortOrder: 41, monthlyBudget: null },
  { name: "기타수입", kind: "변동수입", sortOrder: 42, monthlyBudget: null },
  { name: "자산수정", kind: "변동수입", sortOrder: 43, monthlyBudget: null },
  { name: "수당", kind: "변동수입", sortOrder: 44, monthlyBudget: null },
  { name: "보너스", kind: "변동수입", sortOrder: 45, monthlyBudget: null },
  { name: "기프티콘당근", kind: "변동수입", sortOrder: 46, monthlyBudget: null },
  { name: "부업 블로그", kind: "변동수입", sortOrder: 48, monthlyBudget: null },
];

export const CATEGORY_KEYWORD_RULES: {
  txnType: string;
  keyword: string;
  stdCategory: string;
}[] = [
  { txnType: "지출", keyword: "이니시스(빌링_일반)", stdCategory: "렌트카" },
  { txnType: "지출", keyword: "코스트코", stdCategory: "식재료" },
  { txnType: "지출", keyword: "흥화", stdCategory: "보험" },
  { txnType: "지출", keyword: "79대포", stdCategory: "식비" },
  { txnType: "지출", keyword: "테라피", stdCategory: "카페" },
  { txnType: "지출", keyword: "GS25잠실경기장", stdCategory: "카페" },
  { txnType: "지출", keyword: "농협-박태연", stdCategory: "엄마용돈" },
  { txnType: "지출", keyword: "카카오모빌리티", stdCategory: "식비" },
];

// 위 데이터는 "우리집" 원본이라, 다른 가구에 그대로 주면 안 되는 개인 항목이 섞여 있다.
const HOUSEHOLD_SPECIFIC_CATEGORIES = new Set(["엄마용돈", "기프티콘당근", "부업 블로그"]);

/**
 * 기본 카테고리매핑·키워드규칙·예산카테고리를 시드한다. 멱등(onConflict 갱신).
 * generic=true(새 가구 온보딩)면 우리집 전용 카테고리·예산 금액·키워드 규칙(실명·특정 가맹점)과
 * 저축/투자 이체를 월급으로 보던 우리집 회계 규칙을 빼고 일반적인 기본값만 넣는다.
 */
export async function seedDefaultCategories(db: AppDb, householdId: string, { generic = false } = {}): Promise<void> {
  const mappings = generic
    ? CATEGORY_MAPPINGS.filter((m) => !HOUSEHOLD_SPECIFIC_CATEGORIES.has(m.stdCategory) && m.txnType !== "이체")
    : CATEGORY_MAPPINGS;
  const keywordRules = generic ? [] : CATEGORY_KEYWORD_RULES;
  const budgets = generic
    ? BUDGET_CATEGORIES.filter((b) => !HOUSEHOLD_SPECIFIC_CATEGORIES.has(b.name)).map((b) => ({ ...b, monthlyBudget: null }))
    : BUDGET_CATEGORIES;

  for (const m of mappings) {
    await db
      .insert(categoryMappings)
      .values({ ...m, householdId })
      .onConflictDoUpdate({
        target: [categoryMappings.householdId, categoryMappings.txnType, categoryMappings.rawCategory, categoryMappings.rawSubcategory],
        set: { stdCategory: m.stdCategory },
      });
  }

  for (const kr of keywordRules) {
    await db
      .insert(categoryKeywordRules)
      .values({ ...kr, householdId })
      .onConflictDoUpdate({
        target: [categoryKeywordRules.householdId, categoryKeywordRules.keyword],
        set: { stdCategory: kr.stdCategory, txnType: kr.txnType },
      });
  }

  for (const b of budgets) {
    await db
      .insert(budgetCategories)
      .values({
        householdId,
        name: b.name,
        kind: b.kind,
        sortOrder: b.sortOrder.toString(),
        monthlyBudget: b.monthlyBudget !== null ? b.monthlyBudget.toString() : null,
      })
      .onConflictDoUpdate({
        target: [budgetCategories.householdId, budgetCategories.name],
        set: {
          kind: b.kind,
          sortOrder: b.sortOrder.toString(),
          monthlyBudget: b.monthlyBudget !== null ? b.monthlyBudget.toString() : null,
        },
      });
  }
}
