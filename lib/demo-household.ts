// 데모 모드(비로그인 체험)에서 보여줄 고정된 "샘플 가구" id·구성원. lib/demo-seed.ts(시드 데이터 생성),
// scripts/seed-demo-household.ts, lib/require-household.ts(resolveFinanceViewer)가 함께 쓴다.
// tsx로 직접 실행하는 스크립트/PGlite 테스트에서도 안전하게 import할 수 있도록, 이 파일에는
// "server-only"·"next/navigation" 등 Next 서버 컴포넌트 전용 의존성을 절대 넣지 않는다(순수 상수만).
export const DEMO_HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000de0";

// people.id는 가구 소속과 무관하게 전역 text PK라, 기존 "우리집"(husband/wife)이나 다른 가구가 발급한
// uuid 문자열과 절대 겹치면 안 된다. "demo-" 접두사로 구분한다.
export const DEMO_PERSON_A = "demo-a";
export const DEMO_PERSON_B = "demo-b";

export const DEMO_PEOPLE: { id: string; displayName: string }[] = [
  { id: DEMO_PERSON_A, displayName: "지훈" },
  { id: DEMO_PERSON_B, displayName: "수아" },
];
