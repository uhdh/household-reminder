# 감정카드(`/emotion-cards`) 이식 — 설계 문서

- 날짜: 2026-07-28
- 상태: 승인됨

## 배경

"우리집" 앱의 네 번째 서브프로젝트로, 홈 화면(`/`)의 "감정카드" 행이 가리키는 실제 기능을
만든다. 이미 별도 Next.js 프로젝트로 1차 버전이 완성되어 있는 "마음 3장"
(`C:\Users\maktu\Desktop\project\감정카드\mind3`, 별도 git 저장소, 원격 없음)을 이
앱의 `/emotion-cards` 라우트로 포팅한다. mind3는 매일 감정 카드 3장을 골라 기록하고
히스토리를 보는 흐름이 이미 검증되어 있으므로 UX 흐름은 그대로 가져오되, 저장소와
시각 언어, 일부 의존성을 이 앱의 관례에 맞게 바꾼다.

## 이번 서브프로젝트의 범위

**만드는 것**: `/emotion-cards`(오늘 상태), `/emotion-cards/select`(카드 선택 + 커스텀
감정 추가), `/emotion-cards/result`(오늘 결과), `/emotion-cards/history`(히스토리 목록),
`/emotion-cards/history/[date]`(히스토리 상세). 홈 화면(`lib/sections.ts`)의 "감정카드"
항목의 `getStatus()`를 실제 구현으로 교체.

**만들지 않는 것 (mind3와의 명시적 차이):**
- **배우자 공유 기능** — mind3의 원래 이름("마음 3장: 감정 카드 공유 앱")이 암시하는
  공유 기능은 1차 버전에서 이미 제외되어 있었고, 이번 포팅에서도 추가하지 않는다.
  단일 사용자(기기가 아니라 서버 DB에 저장되므로 정확히는 "단일 기록 스트림")로만
  동작한다. 나중에 공유가 필요해지면 그때 별도 서브프로젝트로 다룬다.
- **`framer-motion`** — mind3는 모달/시트 오픈 애니메이션(fade/scale/slide, 0.18초)에
  `framer-motion`을 쓰지만, 이 앱은 애니메이션 라이브러리를 쓰지 않는 관례라 Tailwind
  `transition-*` 클래스로 재구현하고 의존성을 추가하지 않는다.
- **`shadcn`/`@base-ui/react`/`lucide-react`** — mind3에 스캐폴딩되어 있지만
  (`src/components/ui/button.tsx`) 실제 페이지 코드 어디에서도 import되지 않는 죽은
  코드로 확인됨. 이식 대상에서 완전히 제외한다.
- mind3의 PWA 설정(`manifest.json`, 전용 아이콘, `Pretendard` 폰트 CDN, 고정
  480px 컨테이너) — 우리집은 여러 섹션을 한 앱으로 묶은 통합 앱이므로 섹션별 PWA
  정체성을 두지 않는다. 폰트는 기존 `app/layout.tsx`의 Geist를 그대로 쓴다.

## 아키텍처

`/cleaning`, `/supplies`와 동일한 계층(순수 함수 → DB 접근 → Server Actions → Server
Component 페이지 → 필요한 곳만 Client Component)을 따른다.

**`lib/db.ts` 분리 (이번 작업에 포함되는 목표한 리팩터):** 이 파일이 청소 관리·생필품
관리에 이어 세 번째 도메인(감정카드)까지 떠안게 되면 책임이 섞이므로, 연결 관리
(`getDb`, `initSchema`, `setDbForTesting`)만 `lib/db.ts`에 남기고 도메인별 테이블
스키마·CRUD 함수는 아래처럼 분리한다:

- `lib/chores-db.ts` — 기존 `chores` 테이블 스키마(`initChoresSchema`)와
  `getAllChores`/`insertChore`/`updateChoreRow`/`completeChoreRow`/`deleteChoreRow`를
  `lib/db.ts`에서 그대로 옮긴다(동작 변경 없음, 위치만 이동).
- `lib/supplies-db.ts` — 기존 `supplies` 테이블 스키마(`initSuppliesSchema`, 시드
  포함)와 `getAllSupplies`/`completeSupplyRow`를 옮긴다(동작 변경 없음).
- `lib/emotion-cards-db.ts` — 이번에 새로 추가하는 `custom_emotions`/`emotion_records`
  테이블 스키마(`initEmotionCardsSchema`)와 관련 CRUD.
- `lib/db.ts`의 `initSchema(database)`는 이제 `initChoresSchema(database)`,
  `initSuppliesSchema(database)`, `initEmotionCardsSchema(database)`를 순서대로
  호출하는 조합 함수가 된다.
- 기존에 `@/lib/db`에서 `getAllChores`/`insertChore`/... 등을 import하던 모든 파일
  (`app/cleaning/page.tsx`, `app/cleaning/actions.ts`, `app/supplies/page.tsx`,
  `app/supplies/actions.ts`, `lib/sections.ts`, 그리고 각 테스트 파일)은 import 경로를
  `@/lib/chores-db` / `@/lib/supplies-db`로 바꾼다. `getDb`/`setDbForTesting`은 계속
  `@/lib/db`에서 가져온다. 이 리팩터는 **동작을 바꾸지 않으므로**, 구현 단계에서는
  파일 이동 직후 기존 청소/생필품 테스트 전체(54개)가 그대로 통과하는 것으로 회귀
  여부를 확인한다.

**`lib/emotions.ts` (신규, leaf 모듈):** mind3의 `src/lib/emotions.ts`를 그대로 포팅 —
34개 프리셋 감정(`EMOTIONS`), 색상 팔레트(`COLORS`), 감정별 한 줄 정의(`DEFINITIONS`).
DB에 저장하지 않는다(생필품의 카탈로그처럼 절대 바뀌지 않는 코드 데이터).

**Server Component 우선:** mind3는 `localStorage`가 서버에는 없어서 `useIsClient` 훅으로
하이드레이션 불일치를 우회했다. 이 앱은 서버에서 DB를 직접 읽으므로 이 훅과 관련
우회 로직은 전부 제거되고, 상호작용이 필요한 화면(선택 그리드, 카드 확대)만 Client
Component로 남는다.

## 데이터 모델

```sql
CREATE TABLE IF NOT EXISTS custom_emotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL CHECK (color IN ('green','pink','blue','red','yellow','purple')),
  created_at TEXT NOT NULL
)

CREATE TABLE IF NOT EXISTS emotion_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position IN (1, 2, 3)),
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  color TEXT NOT NULL,
  UNIQUE(date, position)
)
```

- `emotion_records`는 하루당 정확히 3행(1~3번 자리)이고, 그날 고른 카드의
  이름/이모지/색상을 **그대로 저장**한다(프리셋이든 커스텀이든 구분 없이 — 나중에
  카탈로그가 바뀌거나 커스텀 감정이 삭제되어도 과거 기록은 그대로 남도록, mind3의
  원본 설계를 그대로 따름). 하루를 다시 저장(수정)하면 그 날짜의 기존 행을 지우고
  새 3행을 넣는 "전체 교체" 방식 — mind3의 "수정 시 통째로 덮어쓰기" 동작과 동일.
- `custom_emotions`는 이름이 유니크. 추가 전에 프리셋(`EMOTIONS`)과 기존 커스텀을
  합쳐 이름 중복을 먼저 확인하고, 있으면 새로 만들지 않고 기존 것을 재사용한다(mind3의
  `addCustomEmotion` 로직 그대로). 이모지는 항상 `💭`, 색상은 항상 `purple`(mind3와 동일
  — 커스텀 감정에 색상 선택 UI를 두지 않는 원본 결정을 유지).
- `lib/emotion-cards-db.ts`가 내보내는 함수: `getCustomEmotions(db)`,
  `insertCustomEmotion(db, name, existingEmotions)`(중복이면 기존 행 반환),
  `getRecord(db, date)`(3장 배열 또는 `undefined`), `saveRecord(db, date, emotions)`
  (해당 날짜 행을 지우고 3행 삽입), `getAllRecordsDesc(db)`(날짜 내림차순
  `{date, cards}[]` — 단일 쿼리로 전체 행을 읽어 JS에서 날짜별로 묶음, N+1 쿼리 없음).

## 화면 / 라우팅

- **`/emotion-cards`** — Server Component. `hasRecord(오늘)`(= `getRecord`가
  `undefined`가 아닌지)을 서버에서 읽어 "감정 선택하기" 링크 또는 "✅ 오늘 기록 완료"
  카드 + "오늘 결과 보기" 링크를 렌더링. 클라이언트 JS 불필요(순수 `<Link>`).
- **`/emotion-cards/select`** — `page.tsx`(Server: 오늘 기록 여부 확인, `?edit=1`이면
  기존 3장을, 아니면 빈 배열을 초기 선택값으로, 커스텀 감정 목록을 읽어 prop으로
  전달) + `emotion-select.tsx`(Client: 34개 프리셋+커스텀 그리드, 최대 3장 토글,
  "+ 추가하기" 타일 → 커스텀 감정 이름 입력 시트 → `addCustomEmotion` 액션 호출 후
  로컬 상태에 즉시 반영, "완료" 버튼(정확히 3장일 때만 활성화) → `saveRecord` 액션
  호출 후 `/emotion-cards/result`로 이동). 이미 오늘 기록이 있고 edit 모드가
  아니면 서버에서 바로 `redirect("/emotion-cards/result")`.
- **`/emotion-cards/result`** — Server Component가 오늘 기록을 읽어 없으면
  `redirect("/emotion-cards")`, 있으면 `cards-view.tsx`(Client: 카드 3장 표시, 카드
  탭 시 확대 오버레이로 이모지+이름+정의 표시, "수정하기" 링크 → `/select?edit=1`)에
  전달.
- **`/emotion-cards/history`** — Server Component. `getAllRecordsDesc()`를 읽어
  날짜별 행(날짜/요일 + 카드 3장 이모지 미리보기) 목록을 렌더링, 각 행은 `<Link>`로
  상세 페이지 연결 — 클라이언트 JS 불필요. 기록이 없으면 "아직 기록이 없어요" 안내.
- **`/emotion-cards/history/[date]`** — Server Component가 날짜 형식이 유효하지
  않거나 기록이 없으면 `redirect("/emotion-cards/history")`, 있으면 같은
  `cards-view.tsx`를 재사용(수정 링크 없이 조회 전용).

**시각 언어:** mind3의 6색 팔레트(`COLORS`: green/pink/blue/red/yellow/purple, 각각
bg/border/text)는 카드 배경·테두리·글자색에 그대로 쓰되, 페이지 전체 배경/기본
텍스트/다크모드는 우리집의 zinc 팔레트(`bg-zinc-50 dark:bg-black` 등, `/cleaning`·
`/supplies`와 동일한 클래스 관례)를 따른다. 애니메이션은 오버레이/시트 열림에
Tailwind `transition-opacity`/`transition-transform`(약 200ms, ease-out)으로
재구현한다.

## Server Actions

`app/emotion-cards/actions.ts`:

- `addCustomEmotion(name: string): Promise<{ emotion?: Emotion; error?: string }>` —
  trim, 6자 제한, 빈 문자열이면 에러. 프리셋(`EMOTIONS`)+기존 커스텀과 이름 중복을
  확인해 있으면 그 감정을 반환(새로 만들지 않음), 없으면 삽입 후 반환.
  `revalidatePath` 없음 — select 화면의 로컬 상태(클라이언트가 반환값을 배열에
  append)에만 즉시 반영되면 되고, 다른 페이지가 이 목록을 캐시하지 않는다.
- `saveRecord(date: string, emotions: Emotion[]): Promise<{ error?: string }>` —
  정확히 3장인지 검증(아니면 에러) 후 그 날짜의 기존 레코드를 지우고 새로 저장.
  `revalidatePath("/emotion-cards")`, `revalidatePath("/emotion-cards/history")`,
  `revalidatePath("/")`(홈 배지 갱신).

## 파일 구조

```
app/emotion-cards/
  page.tsx                    # 서버 컴포넌트 - 오늘 상태
  select/
    page.tsx                  # 서버 컴포넌트 - 오늘 기록/커스텀 목록 조회 후 전달
  result/
    page.tsx                  # 서버 컴포넌트 - 오늘 기록 조회, 없으면 redirect
  history/
    page.tsx                  # 서버 컴포넌트 - 전체 기록 목록
    [date]/
      page.tsx                # 서버 컴포넌트 - 특정 날짜 기록, 없으면 redirect
  emotion-select.tsx           # 클라이언트 컴포넌트 - 그리드 + 토글 + 커스텀 추가 + 완료
  cards-view.tsx               # 클라이언트 컴포넌트 - 카드 3장 표시 + 탭 확대 (result/history/[date] 공용)
  actions.ts                   # 'use server' - addCustomEmotion, saveRecord
lib/
  db.ts                        # getDb/initSchema(조합)/setDbForTesting만 남김 (리팩터)
  chores-db.ts                 # 기존 chores 스키마+CRUD 이동 (리팩터, 동작 변경 없음)
  supplies-db.ts                # 기존 supplies 스키마+CRUD 이동 (리팩터, 동작 변경 없음)
  emotion-cards-db.ts           # 신규 - custom_emotions/emotion_records 스키마+CRUD
  emotions.ts                   # 신규 - 프리셋 카탈로그/색상/정의 (leaf 모듈)
  sections.ts                   # "emotion-cards" getStatus를 실제 구현으로 교체
```

## 홈 셸 연동

`lib/sections.ts`의 "emotion-cards" 항목의 `getStatus`를 실제 구현으로 교체한다:
오늘 `getRecord(todayISO())`가 존재하면 `{ ready: true, label: "오늘 기록 완료" }`,
없으면 `{ ready: true, label: "아직 기록 전" }`을 반환한다. 청소·생필품 관리의
"밀린 개수" 패턴과 달리 이 섹션은 "오늘 했는지 여부"라 라벨 문구만 다르고 구조는
동일하다.

## 테스트 방침

기존 프로젝트 관례(Vitest + React Testing Library, `node:sqlite` in-memory DB 주입,
e2e 없이 수동 QA로 마무리) 그대로 따른다.

- `lib/emotions.ts`: 프리셋 34개 이름이 서로 중복되지 않는지 정도의 가벼운 검증
  (계산 로직이 없는 정적 데이터라 그 이상은 YAGNI).
- `lib/emotion-cards-db.ts`: 커스텀 감정 중복 삽입 방지, 레코드 저장이 정확히 3행을
  만드는지, 재저장 시 이전 3행이 교체(추가 아님)되는지, `getAllRecordsDesc`가 날짜
  내림차순으로 올바르게 묶는지.
- `app/emotion-cards/actions.test.ts`: `addCustomEmotion`/`saveRecord`의 입력 검증
  (6자 제한, 3장 아닌 경우 에러)과 DB 반영을 in-memory DB로 확인.
- `app/emotion-cards/emotion-select.test.tsx`: 카드 4번째 선택 시 무시되는지, 커스텀
  추가 흐름이 그리드에 즉시 반영되는지, "완료" 버튼이 정확히 3장일 때만 활성화되는지.
- `app/emotion-cards/cards-view.test.tsx`: 카드 3장 렌더링, 탭 시 확대 오버레이에
  이름+정의가 뜨는지, 배경 클릭 시 닫히는지.
- `lib/sections.test.ts`: emotion-cards 섹션이 실제 상태(완료/미완료)를 반환하는지
  테스트 추가, 기존 cleaning/supplies 섹션 테스트는 그대로 유지.
- `lib/db.ts` 분리 리팩터 직후에는 새 기능 테스트 없이, 기존 청소/생필품 테스트
  54개가 import 경로만 바뀐 채 그대로 통과하는지부터 확인한다(회귀 없음이 이
  리팩터의 유일한 성공 기준).

## 비목표 (YAGNI)

- 배우자/다른 사용자와의 공유 기능
- `framer-motion`, `shadcn`, `@base-ui/react`, `lucide-react` 의존성
- PWA manifest, 전용 아이콘, 전용 폰트 CDN
- 완료 취소(undo) — 수정 화면에서 다시 골라 덮어쓰면 됨(기존 청소 관리 결정과 동일한
  기조)
- 커스텀 감정 삭제/수정 UI, 색상 선택 UI (mind3에도 없던 기능)
- e2e/브라우저 자동화 테스트 — 구현 후 수동 QA로 대체
