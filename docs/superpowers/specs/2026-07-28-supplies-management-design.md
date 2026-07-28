# 생필품 관리(`/supplies`) 이식 — 설계 문서

- 날짜: 2026-07-28
- 상태: 승인됨

## 배경

"우리집" 앱의 세 번째 서브프로젝트로, 홈 화면(`/`)의 "생필품 관리" 행이 가리키는 실제
기능을 만든다. `origin/main`(별개로 갈라진 git 히스토리)에 이미 정적 HTML/CSS/JS로
구현되어 있는 "생활용품 교체주기 리마인더"(설계 문서:
`docs/superpowers/specs/2026-07-27-household-reminder-design.md`, 해당 브랜치 기준)의
시각 언어와 순수 계산 로직을 이 Next.js 앱의 `/supplies` 라우트로 포팅하되, 저장소를
`localStorage`에서 `/cleaning`과 동일한 `node:sqlite` + Server Actions로 교체한다.

`/cleaning`은 청소 관리 쪽에서 원래 생필품 관리 스타일(카드+진행률)을 가져다 썼지만
카테고리 구분과 자유 CRUD가 있는 반면, 생필품 관리는 원본 그대로 **카테고리 컬럼 +
고정 카탈로그**를 유지한다 — 서로 다른 두 방향이 이번 서브프로젝트에서 다시 갈린다.

## 이번 서브프로젝트의 범위

**만드는 것**: `/supplies` 라우트 — 카테고리별 컬럼(욕실용품/주방용품/침실&리빙/가전&설비)
카드 그리드 + 완료 처리(하단 토스트+날짜 선택). 홈 화면(`lib/sections.ts`)의 "생필품 관리"
항목의 `getStatus()`를 실제 구현으로 교체(밀린 개수 반환).

**만들지 않는 것**: 항목 추가/수정/삭제(고정 카탈로그), 완료 취소(undo), 로그인,
`origin/main` 정적 앱 자체의 유지보수(그쪽은 별도 git 히스토리로 계속 독립 존재).

## 데이터 & 저장

- 기존 `data/db.sqlite` 파일(청소 관리와 공유)에 `supplies` 테이블을 추가한다. 별도
  DB 파일을 만들지 않는다.
- DB 경로 환경변수를 `CHORE_DB_PATH`에서 **`APP_DB_PATH`**로 개명한다(청소+생필품이
  같은 파일을 공유하게 되어 기존 이름이 더 이상 정확하지 않음). 참조하는 곳은
  `lib/db.ts`, `lib/db.test.ts` 두 곳뿐이라 변경 비용이 낮다.
- 테이블 `supplies`:

  | 컬럼 | 타입 | 설명 |
  |---|---|---|
  | id | integer PK | |
  | category | text | `"bathroom"` \| `"kitchen"` \| `"bedroom"` \| `"appliance"` |
  | name | text | 항목 이름 |
  | icon | text | 이모지 1개 |
  | cycle_days | integer | 교체/관리 주기(일) — `origin/main`의 `data.js` 값을 그대로 이식 |
  | last_done_at | text (ISO date, NOT NULL) | 시드 시점에 항상 채워짐(아래 "초기 시드" 참고) |
  | sort_order | integer | 카테고리 내 표시 순서(원본 배열 순서 그대로, 삽입 순서와 별개로 명시) |

- **주기 단위**: `interval_value` + `interval_unit`(day/week/month) 대신 **`cycle_days`
  단일 정수**를 쓴다. 매트리스(5년=1825일), 멀티탭(3년=1095일) 등 연 단위 항목이 있어
  `chores.ts`의 `IntervalUnit`(day/week/month, year 없음)을 그대로 재사용하기 어렵고,
  `origin/main`의 원본 값과 1:1 대응시키는 게 가장 단순하다.
- **초기 시드**: `initSchema`에서 `supplies` 테이블 생성 직후, `SELECT COUNT(*) FROM
  supplies`가 0이면 아래 "카탈로그" 21개 항목을 `last_done_at = 오늘(시드 실행일)`로
  INSERT한다. 이후 재실행 시에는 이미 행이 있으므로 시드를 건너뛴다. 이렇게 하면
  원본 정적 앱의 "최초 방문 시 전부 초과 배지가 뜨는 것을 방지"하는 요구사항을
  동일하게 만족한다.
- 마감일 계산: 순수 함수 `computeSupplyStatus(lastDoneISO, cycleDays, todayISO)`를
  `lib/supplies.ts`에 추가한다. `origin/main`의 `reminder.js`(`computeStatus`)와 로직은
  동일(달력 일수 차이 → percent → overdue)하되 TypeScript로 포팅하고, 날짜 연산은
  프로젝트가 이미 쓰는 `date-fns`(`differenceInCalendarDays`, `addDays`, `parseISO`,
  `format`)로 통일해 `lib/chores.ts`와 스타일을 맞춘다.

### 카탈로그 (21개 항목, `origin/main` `data.js` 기준)

| 카테고리 | 항목 | 아이콘 | cycle_days |
|---|---|---|---|
| bathroom | 칫솔 | 🪥 | 90 |
| bathroom | 면도기 | 🪒 | 14 |
| bathroom | 샤워볼 | 🧽 | 30 |
| bathroom | 수건 | 🏖️ | 365 |
| bathroom | 변기솔 | 🪠 | 180 |
| kitchen | 수세미 | 🧽 | 14 |
| kitchen | 주방스펀지 | 🫧 | 14 |
| kitchen | 행주 | 🧣 | 30 |
| kitchen | 고무장갑 | 🧤 | 60 |
| kitchen | 도마 | 🟫 | 365 |
| kitchen | 전기포트 | 🫖 | 730 |
| bedroom | 베개솜 | ☁️ | 365 |
| bedroom | 베개커버(세탁) | 🧺 | 7 |
| bedroom | 이불(세탁) | 🛌 | 30 |
| bedroom | 매트리스 | 🛏️ | 1825 |
| bedroom | 커튼(세탁) | 🧵 | 90 |
| bedroom | 향수 | 🌸 | 730 |
| appliance | 멀티탭 | 🔌 | 1095 |
| appliance | 공기청정기 필터 | 🌬️ | 180 |
| appliance | 에어컨 필터 | ❄️ | 14 |
| appliance | 세탁기 필터 | 💦 | 90 |

카테고리 표시 순서: 욕실용품 → 주방용품 → 침실&리빙 → 가전&설비.

## 화면 (`/supplies`)

- **카테고리 컬럼 레이아웃 유지**(청소 관리와 달리 카테고리 구분을 없애지 않는다).
  데스크톱은 4개 컬럼 가로 배치(`flex`), 모바일은 세로로 쌓임(반응형 클래스).
- 컬럼 헤더는 원본 색상 그대로 inline `style`로 배경색 적용(별도 CSS 파일 없이,
  `chore-grid.tsx`의 `progressColor` 인라인 스타일 패턴을 재사용):
  욕실 `#4a90d9`, 주방 `#4caf7d`, 침실&리빙 `#e05a7e`, 가전&설비 `#2bb3a3`.
- 카드 구조는 `chore-grid.tsx`의 카드와 시각적으로 동일: 이모지 아이콘 + 이름 +
  D-day 라벨(`D-3`/`D+5`) + 진행률 바(초록→주황(70%↑)→빨강(초과)) + 초과 시 카드
  우상단 "!" 배지. **수정(✎) 진입점은 없음**(고정 카탈로그라 편집 대상이 없음).
- 카드 클릭 → 하단 토스트: "{이름} 교체(관리) 완료로 표시할까요?" + 날짜 입력
  (기본값 오늘, 수정 가능) + 취소/완료 버튼. `/cleaning`의 완료 토스트와 동일한
  컴포넌트 패턴을 재사용한다.
- 항목 추가/삭제 UI, 안내 문구("등록된 항목이 없어요" 등) 없음 — 21개 항목이 항상
  존재한다.
- 라이트/다크 테마 지원(기존 프로젝트 전반의 관례 유지).

## 데이터 변경 (Server Actions)

`app/supplies/actions.ts`:

- `completeSupply(id: number, doneDateISO: string)` — `last_done_at` 갱신 →
  `revalidatePath('/supplies')`, `revalidatePath('/')`.

이것이 유일한 mutation이다(고정 카탈로그이므로 생성/수정/삭제 액션 없음).

## 파일 구조

```
app/supplies/
  page.tsx            # 서버 컴포넌트 - DB에서 목록 조회 후 SupplyGrid에 전달
  actions.ts           # 'use server' - completeSupply만
  supply-grid.tsx      # 클라이언트 컴포넌트 - 카테고리 컬럼 + 카드 그리드 + 완료 토스트
lib/
  db.ts                # supplies 테이블 생성 + 시드 로직 + CRUD 함수 추가 (기존 chores 로직과 나란히)
  supplies.ts          # computeSupplyStatus 등 순수 함수 (테스트 대상)
  sections.ts          # "supplies" getStatus를 실제 구현으로 교체
```

## 홈 셸 연동

`lib/sections.ts`의 "supplies" 항목의 `getStatus`를 `cleaning`과 동일한 패턴으로
구현한다: 오늘 날짜 기준 `computeSupplyStatus(...).overdue`인 항목 수를 세어
`{ ready: true, label: "밀린 항목 N개" }`(0개면 `{ ready: true, label: "전부 완료" }`)를
반환한다.

## 테스트 방침

- `lib/supplies.ts`의 `computeSupplyStatus`: 경계 케이스(마감 당일, 마감 초과, 퍼센트
  계산)를 Vitest 유닛 테스트로 검증.
- `lib/db.ts`에 추가되는 supplies 시드/조회/완료 처리 로직: `lib/db.test.ts`에
  케이스 추가(시드가 한 번만 실행되는지, `completeSupplyRow`가 `last_done_at`만
  갱신하는지 등). 기존처럼 `node:sqlite`의 `:memory:` DB를 테스트에 주입한다.
- `app/supplies/supply-grid.tsx`: Vitest + React Testing Library로 카테고리 컬럼별
  렌더링, 배지/진행률 표시 여부, 카드 클릭 → 토스트 → 완료 액션 호출 흐름을 검증
  (`chore-grid.test.tsx` 패턴 재사용, 단 생성/수정 폼 관련 테스트는 없음).
- e2e/브라우저 자동화 테스트는 하지 않는다(YAGNI) — 구현 후 `npm run dev`로 수동
  확인(카테고리별 컬럼 표시 → 완료 처리 → 홈 화면 배지 갱신 → 카드 배지/진행률 갱신).

## 비목표 (YAGNI)

- 항목 추가/수정/삭제 UI (고정 21개 카탈로그로 유지)
- 완료 취소(undo)
- 로그인/여러 사용자 구분
- 실시간 업데이트(polling/웹소켓)
- `origin/main`의 정적 HTML/CSS/JS 구현 자체의 변경 — 그쪽은 별도 git 히스토리로
  독립적으로 남아있고(다른 워크트리에서 별도 작업 중), 이번 작업은 그 시각 언어와
  계산 로직만 참고해서 새로 포팅하는 것이지 그 코드를 직접 가져와 수정하는 게 아니다.
