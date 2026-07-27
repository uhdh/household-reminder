# 청소 관리(`/cleaning`) 이식 — 설계 문서

- 날짜: 2026-07-27
- 상태: 승인됨

## 배경

"우리집" 앱의 두 번째 서브프로젝트로, 홈 화면(`/`)의 "청소 관리" 행이 가리키는 실제 기능을
만든다. 기존에 확정되어 있던 iOS 아이콘 그리드 방향(`design/chore-planner-mockup.html`)은
이번 작업에서 **폐기**하고, 대신 생필품 관리(`origin/main`의 정적 HTML/JS 구현)의 카드
디자인을 따르기로 사용자가 명시적으로 결정했다. 이전에 반려됐던 "인포그래픽 그대로
재현" 방향과 결이 비슷해 보여 재확인을 거쳤고, 사용자가 다시 한번 확정했다.

원래 아키텍처 계획(`design/architecture-plan.md`)의 데이터 모델과 CRUD 요구사항은 유효하게
유지하되, 화면 구성(원래 "/" + "/chores" 2페이지)과 스토리지 선택(`better-sqlite3`)은
아래처럼 갱신한다.

## 이번 서브프로젝트의 범위

**만드는 것**: `/cleaning` 라우트 하나 — 항목 카드 그리드(전체 목록, 밀린 것은 배지+진행률로
강조) + 완료 처리(하단 토스트+날짜선택) + 추가/수정/삭제. 홈 화면(`lib/sections.ts`)의
"청소 관리" 항목의 `getStatus()`를 실제 구현으로 교체(밀린 개수 반환).

**만들지 않는 것**: 생필품 관리/감정카드/포트폴리오의 실제 이식(별도 서브프로젝트),
완료 취소(undo), 카테고리 분류, 로그인.

## 데이터 & 저장

- **`node:sqlite`** (Node 24 내장 모듈) 사용. `better-sqlite3` 같은 네이티브 애드온
  설치가 필요 없고, 이 환경(Node 24 + Windows)에서 네이티브 빌드 실패 위험이 없다.
  API가 `better-sqlite3`와 유사한 동기(sync) 스타일이라 원래 계획의 사용 패턴을 그대로
  따를 수 있다.
- DB 파일: `data/db.sqlite` (프로젝트 루트, `.gitignore`에 추가).
- 테이블 `chores` (카테고리 필드 없음 — 결정 유지):

  | 컬럼 | 타입 | 설명 |
  |---|---|---|
  | id | integer PK | |
  | name | text | 항목 이름 |
  | icon | text | 이모지 1개 |
  | interval_value | integer | 주기 숫자 |
  | interval_unit | text | `"day"` \| `"week"` \| `"month"` |
  | last_done_at | text (ISO date, nullable) | null이면 "한 번도 안 함" → 항상 마감 지남 |
  | created_at | text (ISO datetime) | |

- 마감일 계산: `last_done_at`이 없으면 즉시 due. 있으면 `interval_unit`에 따라
  `date-fns`의 `addDays`/`addWeeks`/`addMonths`로 `last_done_at + interval`을 계산해
  오늘과 비교한다 (달력 기준 계산 — "3개월마다"가 정확하도록. 원래 architecture-plan.md
  결정 유지). 카드의 진행률(%)은 생필품 관리의 `computeStatus` 패턴을 참고해
  `경과일수 / 전체주기일수`로 계산하되, "개월" 단위의 전체주기일수는 `addMonths`로 구한
  실제 캘린더 일수를 쓴다(28~31일 등 월별 차이 반영).

## 화면 (`/cleaning`)

- 카테고리 컬럼 없이 **단일 반응형 카드 그리드** (생필품 관리의 `card-list` 그리드 참고).
- 카드 하나 = 이모지 아이콘 + 이름 + D-day 라벨(`D-3` / `D+5` 등) + 진행률 바
  (초록 → 주황(70% 이상) → 빨강(마감 초과)) + 마감 초과 시 카드 우상단 "!" 배지.
- 카드 클릭 → 하단 토스트 오픈: "{이름} 완료로 표시할까요?" + 날짜 입력(기본값 오늘) +
  확인/취소 버튼. 확인 시 `completeChore` 서버 액션 호출 → `last_done_at` 갱신 →
  카드 갱신.
- 상단 "+ 추가" 버튼 → 간단한 폼(이름 / 이모지 1글자 입력 / 주기 값+단위)으로 새 항목
  생성. 생필품 관리 정적 데모에는 이 기능이 없으므로(고정 목록이라) 새로 설계한다.
- 각 카드에 수정/삭제 진입점(예: 카드 내 작은 편집 아이콘, 또는 카드 롱프레스) → 같은
  폼을 값 채운 채로 열어 수정, 또는 삭제 버튼.
- 항목이 하나도 없으면 "아직 등록된 집안일이 없어요 — + 버튼으로 추가해보세요" 안내.
- 라이트/다크 테마 지원 (기존 프로젝트 전반의 관례 유지).

## 데이터 변경 (Server Actions)

이 Next.js 버전은 mutation에 Server Functions(`'use server'`)를 표준으로 쓴다
(`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` 확인).
원래 계획의 Route Handler(`api/chores/route.ts`) 대신 `app/cleaning/actions.ts`에
작성한다:

- `completeChore(id: number, doneDateISO: string)` — `last_done_at` 갱신
- `createChore(formData: FormData)` — 이름/이모지/주기 값 파싱 후 새 행 삽입
- `updateChore(id: number, formData: FormData)` — 기존 행 수정
- `deleteChore(id: number)` — 행 삭제

각 함수는 변경 후 `revalidatePath('/cleaning')`을 호출해 목록을 갱신한다. 입력값 검증
(이름 공백 아님, 주기 값 1 이상 정수 등)은 각 액션 내부에서 수행하고, 실패 시 에러
메시지를 반환해 폼에 표시한다(별도 클라이언트 검증 라이브러리 없이 최소한으로).

## 파일 구조

```
app/cleaning/
  page.tsx           # 서버 컴포넌트 - DB에서 목록 조회 후 ChoreGrid에 전달
  actions.ts         # 'use server' - CRUD + 완료 처리
  chore-grid.tsx      # 클라이언트 컴포넌트 - 카드 그리드 + 토스트 + 추가/수정 폼
lib/
  db.ts              # node:sqlite 초기화 + 테이블 생성(최초 실행 시 CREATE TABLE IF NOT EXISTS)
  chores.ts          # due-date/진행률 계산 순수 함수 (테스트 대상)
```

`lib/sections.ts`의 "cleaning" 항목의 `getStatus`를 실제 구현으로 교체 — `lib/db.ts`를
읽어 밀린 항목 개수를 세고 `{ ready: true, label: "밀린 항목 N개" }` (0개면
`{ ready: true, label: "전부 완료" }` 등, 정확한 문구는 구현 단계에서 확정)를 반환한다.

## 테스트 방침

- `lib/chores.ts`의 마감일/진행률 계산 함수: day/week/month 각 케이스, `last_done_at`
  null 케이스, 정확히 마감일 당일인 경계 케이스, 월 단위의 달력 일수 차이(28~31일)
  케이스를 Vitest 유닛 테스트로 검증.
- `app/cleaning/chore-grid.tsx`: Vitest + React Testing Library로 카드 렌더링(이름/
  아이콘/배지/진행률 표시 여부)을 검증. 서버 액션은 mock 함수로 대체해 테스트한다.
- `app/cleaning/actions.ts`의 DB 접근 로직은 `lib/db.ts`를 통해서만 이루어지므로,
  `lib/db.ts`에 임시 in-memory DB(`node:sqlite`의 `:memory:`)를 주입할 수 있게 만들어
  액션 함수도 유닛 테스트 가능하게 한다.
- e2e/브라우저 자동화 테스트는 하지 않는다(YAGNI) — 구현 후 `npm run dev`로 수동
  확인(추가 → 홈 화면 배지 갱신 → 완료 처리 → 배지 사라짐 → 수정/삭제).

## 비목표 (YAGNI)

- 완료 취소(undo) — 실수하면 수정 화면에서 날짜를 직접 고친다 (기존 결정 유지)
- 카테고리 분류
- 로그인/여러 사용자 구분
- 실시간 업데이트(polling/웹소켓)
- `design/chore-planner-mockup.html`의 아이콘 그리드 UI — 이번 결정으로 폐기, 더 이상
  참고하지 않는다 (파일 자체는 기록으로 남겨두되 실제 구현 기준에서 제외)
