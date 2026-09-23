# archive/

가계부(finance) 외 기능(청소 관리, 생필품 관리, 감정카드, 가족 초대)을 이 앱이 가계부 전용으로
좁혀지면서 원래 경로 구조를 유지한 채로 옮겨뒀습니다. tsconfig/vitest/eslint 검사·빌드 대상에서
제외되어 있으며, DB 테이블은 그대로 남아 있습니다(스키마/데이터는 건드리지 않았습니다).

되살리려면: 해당 폴더를 원래 경로(예: `archive/app/cleaning` → `app/cleaning`, `archive/lib/chores-db.ts`
→ `lib/chores-db.ts`)로 다시 옮기고, tsconfig.json/vitest.config.mts의 `archive` 제외 항목과
package.json의 `lint` 스크립트 `--ignore-pattern archive/**`를 되돌린 뒤, 각 기능이 쓰던 Clerk 기반
인증 연동(`auth()`, `@clerk/nextjs`)을 지금의 Auth.js(`@/auth`, `requireFinanceUser` 패턴)로 다시
연결해야 합니다. `drizzle.config.ts`의 schema 경로도 함께 되돌리세요.
