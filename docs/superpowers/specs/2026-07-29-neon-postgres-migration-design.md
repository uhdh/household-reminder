# node:sqlite → Neon Postgres 마이그레이션 — 설계 문서

- 날짜: 2026-07-29
- 상태: 승인됨

## 배경

이 앱(청소 관리/생필품 관리/감정카드)은 `node:sqlite`로 로컬 파일(`data/db.sqlite`)에
데이터를 저장한다. Vercel에 배포한 뒤(2026-07-28), Lambda 런타임의 배포 번들 경로가
읽기 전용이라 `mkdir '/var/task/data'` 형태의 `ENOENT`가 간헐적으로 발생해
`/cleaning`, `/supplies`, `/emotion-cards`가 500 에러를 낸다. 홈 화면(`/`)만 항상
동작하는 것처럼 보였는데, 이는 `app/page.tsx`의 `revalidate = 3600`으로 정적/ISR
렌더링되기 때문이지 실제 런타임 DB 접근이 안전해서가 아니다(이 설계에서 그대로 둠,
아래 "비목표" 참고).

해결책은 로컬 파일 기반 저장소를 서버리스에서 동작하는 저장소로 옮기는 것이다.
가계부(`couple-finance`) 프로젝트가 이미 Neon + Drizzle 조합을 쓰고 있어, 같은
패턴(같은 코드는 아님 — 별도 저장소라 직접 참조 불가)을 이 앱에도 적용한다.

## 이번 서브프로젝트의 범위

**만드는 것**: `node:sqlite` 기반 `lib/db.ts` + `lib/{chores,supplies,emotion-cards}-db.ts`를
Neon Postgres + Drizzle ORM 기반으로 전면 교체. 모든 호출부(Server Actions, 서버
컴포넌트)를 비동기 호출로 전환. 테스트를 PGlite(in-memory Postgres) 기반으로 전환.

**만들지 않는 것**: 기존 프로덕션 sqlite 데이터의 이전(사용자 결정: 재시작), 정식
마이그레이션 파일 이력 관리(`drizzle-kit push`로 대체), 홈 화면의 캐싱 정책 변경,
스키마/화면/비즈니스 로직(`chores.ts`/`supplies.ts`/`emotions.ts`)의 동작 변경 — 이
서브프로젝트는 순수하게 저장소 계층 교체다.

## 아키텍처

- **드라이버**: `@neondatabase/serverless` + `drizzle-orm/neon-http`. HTTP 기반이라
  Node 런타임에서도 서버리스 콜드스타트에 유리하고 커넥션 풀/웹소켓 관리가 없다.
- **ORM**: Drizzle ORM. 스키마 정의와 쿼리 함수는 기존처럼 도메인별 모듈에 둔다 —
  `lib/chores-db.ts`/`supplies-db.ts`/`emotion-cards-db.ts`가 각자 Drizzle 테이블
  스키마 + CRUD 함수를 갖고, `lib/db.ts`는 커넥션 획득(`getDb()`)과
  `setDbForTesting()` 오버라이드 역할만 유지한다. 모듈 분리 자체는 바꾸지 않는다.
- **`getDb()`는 동기 → 비동기로 바뀌지 않는다**: Drizzle 인스턴스 생성 자체는 동기
  (커넥션은 지연 연결)이므로 `getDb(): NeonHttpDatabase`는 그대로 동기 함수로 두고,
  **쿼리 함수들**(`getAllChores`, `insertChore`, `completeSupplyRow`, `getRecord` 등)이
  `Promise`를 반환하도록 바뀐다.

## 스키마 변환 (sqlite → Postgres)

날짜 컬럼은 지금처럼 ISO 문자열(`text`)로 유지한다 — `chores.ts`/`supplies.ts`의 순수
계산 로직이 문자열 기반이라 여기서 `timestamp` 타입으로 바꾸면 불필요한 연쇄 변경이
생긴다. `INTEGER PRIMARY KEY AUTOINCREMENT`는 Drizzle의 `serial("id").primaryKey()`로,
`CHECK (col IN (...))` enum 제약은 Drizzle `pgEnum`으로 옮긴다.

- **chores**: `id serial pk`, `name/icon text`, `interval_value integer`,
  `interval_unit`은 `pgEnum('interval_unit', ['day','week','month'])`,
  `last_done_at text`(nullable), `created_at text`.
- **supplies**: `id serial pk`, `category`는
  `pgEnum('supply_category', ['bathroom','kitchen','bedroom','appliance'])`,
  `name/icon text`, `cycle_days integer`, `last_done_at text`(NOT NULL),
  `sort_order integer`. 21개 카탈로그 시드 로직은 동일(테이블이 비어있으면 삽입)하게
  유지하되 비동기로 전환.
- **custom_emotions**: `id serial pk`, `name text unique`, `emoji text`,
  `color`는 `pgEnum('emotion_color', ['green','pink','blue','red','yellow','purple'])`,
  `created_at text`.
- **emotion_records**: `id serial pk`, `date text`, `position integer`(1|2|3 체크는
  Drizzle에서 직접 표현 불가하므로 애플리케이션 레벨 검증 유지, 기존 sqlite도 사실상
  애플리케이션이 항상 1~3만 넣었음), `name/emoji text`, `color text`,
  `UNIQUE(date, position)` 복합 유니크 유지.

## 비동기 전환 (호출부 영향 범위)

`node:sqlite`는 동기 API라 지금까지 `getDb()`와 모든 쿼리 함수가 동기였다. 호출부는
이미 `async` 컨텍스트(Server Actions, 서버 컴포넌트)라 기계적으로 `await`만
추가하면 되지만, 영향 범위가 넓다:

- `app/{cleaning,supplies,emotion-cards}/actions.ts` — 각 액션 함수 내부 호출에 `await`
- `app/{cleaning,supplies,emotion-cards}/page.tsx` 및 `emotion-cards`의
  `select`/`result`/`history`/`history/[date]` 페이지 — DB 조회에 `await`
- `lib/sections.ts` — `Section.getStatus`의 시그니처가
  `() => SectionStatus`에서 `() => Promise<SectionStatus>`로 바뀐다.
- `app/home-view.tsx` — `HomeView`가 서버 컴포넌트이므로 `async function HomeView`로
  바꾸고 `sections.map(...)` 대신 `Promise.all(sections.map((s) => s.getStatus()))`로
  전체 상태를 먼저 구한 뒤 렌더링한다.
- 관련 테스트(`app/*/actions.test.ts`, `app/home-view.test.tsx`, `lib/sections.test.ts`
  등)도 비동기 호출/렌더링에 맞게 갱신.

## 마이그레이션/시딩

개인 소규모 앱이라 정식 마이그레이션 파일 이력보다 `drizzle-kit push`로 스키마를
Neon에 직접 동기화하는 방식을 쓴다(`drizzle.config.ts` 하나 추가). `supplies` 21종
시드는 지금처럼 "테이블이 비어있으면 삽입"하는 런타임 체크를 비동기로 유지한다(별도
시드 스크립트를 만들지 않는다 — 첫 요청이 자연히 시드를 트리거함).

## 테스트 방침

- `drizzle-orm/pglite` + `@electric-sql/pglite`로 각 테스트가 매번 새 in-memory
  Postgres 인스턴스를 만들어 쓴다. Postgres 방언을 그대로 쓰므로 Neon과 쿼리
  동작이 사실상 동일하다(`:memory:` sqlite 대비 이식성이 더 좋아지는 효과도 있음).
- `lib/db.test.ts`, `lib/*-db.test.ts`의 기존 케이스(초기화, CRUD, 시드-1회-실행 등)는
  구조를 유지한 채 `DatabaseSync` → PGlite 인스턴스로 교체.
- 순수 계산 로직 테스트(`lib/chores.test.ts`, `lib/supplies.test.ts`,
  `lib/emotions.test.ts`)는 DB와 무관하므로 변경 없음.
- `app/*/actions.test.ts`, `app/home-view.test.tsx`: DB 호출이 비동기가 되므로 관련
  단언을 `await`/`async` 형태로 갱신. `home-view.test.tsx`가 async 서버 컴포넌트를
  렌더링해야 하는데, 이 프로젝트가 쓰는 RTL 버전이 async 컴포넌트를 직접 렌더링하지
  못하면 구현 단계에서 `await HomeView({...})`의 결과(JSX)를 렌더링하는 방식으로
  우회한다(React 19 서버 컴포넌트 테스트의 일반적인 패턴).

## 프로비저닝 (사용자 작업 — 코드 변경 범위 밖)

Neon 프로젝트를 직접 만들 수 있는 도구가 없으므로 사용자가 아래를 진행해야 한다:

1. neon.tech 또는 Vercel 대시보드 Storage 탭의 Neon 연동으로 "우리집" 전용 새 Neon
   프로젝트 생성(가계부/`couple-finance`와는 별도 프로젝트).
2. 연결 문자열(`DATABASE_URL`)을 로컬 `.env.local`과 Vercel 프로젝트(`woorijip`)
   환경변수에 등록 — dev/prod 동일 DB를 쓰기로 했으므로 값도 동일하게 넣는다.
3. `.env.local`은 `.gitignore`에 이미 포함되어 있는지 구현 단계에서 확인.

## 파일 구조 변화

```
lib/
  db.ts                # getDb() — Neon 커넥션 + Drizzle 인스턴스, setDbForTesting
  chores-db.ts         # chores 테이블 스키마(pgTable) + 비동기 CRUD 함수
  supplies-db.ts       # supplies 테이블 스키마 + 시드 + 비동기 CRUD 함수
  emotion-cards-db.ts  # custom_emotions/emotion_records 스키마 + 비동기 CRUD 함수
drizzle.config.ts      # drizzle-kit push 설정 (신규)
```

## 롤아웃 순서

1. 의존성 추가(`drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit`,
   `@electric-sql/pglite` devDependency) + `drizzle.config.ts`.
2. 사용자가 Neon 프로젝트 생성 + `DATABASE_URL` 로컬/Vercel 등록(위 "프로비저닝").
3. 스키마 파일 3개(chores/supplies/emotion-cards) Drizzle로 재작성 + `lib/db.ts`
   교체, `drizzle-kit push`로 Neon에 스키마 반영.
4. 호출부(actions/pages/sections/home-view) 비동기 전환.
5. 테스트를 PGlite 기반으로 전환, 전체 스위트 통과 확인.
6. 로컬 `npm run dev`로 세 섹션 + 홈 배지 수동 확인.
7. Vercel에 배포 후 프로덕션에서 세 섹션 + 홈 배지 재확인(콜드스타트 포함 반복 요청).

## 비목표 (YAGNI)

- 기존 프로덕션 sqlite 데이터 이전 — 사용자가 명시적으로 재시작을 선택함.
- 정식 마이그레이션 파일/이력 관리 — `drizzle-kit push`로 대체.
- Neon 브랜치를 이용한 dev/prod 환경 분리 — 사용자가 단일 DB 공용을 선택함.
- 홈 화면 `revalidate = 3600` 캐싱 정책 변경 — 이번 작업과 무관한 별개 결정이므로
  손대지 않는다(배지가 최대 1시간 지연될 수 있다는 기존 동작 유지).
- `data/db.sqlite` 파일 및 `node:sqlite` 관련 코드 완전 삭제 후 정리 이상의 별도
  아카이빙/백업 작업.
