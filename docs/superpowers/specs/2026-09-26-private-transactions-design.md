# 나만 보기 거래 · 개인 지출 현황 · 월 용돈 한도 설계

## 목표

- 선물·개인 용돈 같은 거래를 **"나만 보기"**로 표시해, 파트너에게는 합계에만 반영하고 내용은 숨긴다.
- 공동 계좌/카드 하나로 생활비를 내고 개인 지출만 따로 쓰는 부부를 위해, 월별로 **개인 지출 현황**(사람별·공동)과 **월 용돈 한도**를 보여준다.
- 목적은 갈등·잔소리 감소다. 1인·3인 이상 가구에서도 깨지지 않는다.

## 결정된 사항

| 항목 | 결정 |
|---|---|
| 공개 범위 | **합계만 공개**: 파트너에게 세부 내역은 "비공개 거래 + 날짜"만 보이고, 가맹점·메모·카테고리·결제수단·금액은 숨긴다. 월 총지출·카테고리 합계·예산 집계에는 포함한다. |
| 정산 방식 | 공동 계좌/카드 하나로 내고 개인 지출만 별도. **반반 정산 기능은 만들지 않는다.** |
| 용돈 한도 | 사람별 월 한도(원). 초과 시 표시. |

## 하지 않는 것

- 정산(누가 누구에게 얼마 송금) 계산, 지출 비율 조정.
- 카테고리·결제수단 기준 자동 비공개 규칙(건별 토글만).
- 거래 코멘트/채팅, 알림.
- Postgres Row Level Security(기존 설계서의 후속 강화 항목으로 남김).
- 기존 거래의 사용 대상 일괄 변경 기능(필요하면 별도 과제).

## 데이터 모델

- `household_members.person_id text NULL REFERENCES people(id)`: 로그인 계정과 부부 프로필 연결. **현재 이 연결이 없어 서버가 "지금 보는 사람이 누구인지" 모른다**(사전 조건).
- `transactions.is_private boolean NOT NULL DEFAULT false`.
- `people.monthly_allowance integer NULL`: 월 용돈 한도(원). 비어 있으면 한도 없음.
- 연결 채우기:
  - 새 가구: 온보딩(`app/onboarding/actions.ts`)에서 owner 생성 시, 초대 수락(`app/invite/[token]/actions.ts`)에서 member 생성 시 방금 만든 `people.id`를 함께 저장.
  - 기존 가구(우리집): 멱등 스크립트 `scripts/migrate-private-link.ts`. 이메일→person id 매핑을 인자로 받고, 기본은 미리보기(`cleanup-keyword-rules.ts`와 같은 방식).
- 연결이 없는 계정(`personId = null`)은 **fail-closed**: 어떤 비공개 거래도 자기 것이 아니므로 모두 마스킹되고 토글도 거부된다.

## 조회 계층 (모든 화면·내보내기가 한 곳을 거침)

- `requireHousehold()`가 돌려주는 컨텍스트와 `resolveFinanceViewer()`에 `personId: string | null`을 추가한다. 데모 모드는 `null`.
- `getActiveTransactions`, `getActiveTransactionsInRange`, `getMerchantHistory`가 **`viewerPersonId`를 필수 인자**로 받는다(기본값 없음 → 호출부를 컴파일러가 강제로 점검).
- 마스킹은 새 모듈 `lib/spending-private.ts`의 순수 함수 하나가 담당:
  - 대상: `is_private = true` 이고 `person_id ≠ viewerPersonId`인 행.
  - 반환 행에 `masked: true`를 붙이고 `description`, `category`, `subcategory`, `paymentMethod`를 `null`로 비운다.
  - `amount`, `stdCategory`, `included`, `txnType`, `txnDate`는 **서버 집계용으로 유지**한다. 화면은 `masked` 행의 금액을 절대 렌더링하지 않는다(표시용 행 타입에서 금액을 뺌).
  - 파트너가 카테고리로 세부 내역을 필터하면 마스킹 행은 카테고리가 비어 목록에서 빠지므로, 합계와 건수가 어긋날 수 있다. 목록 상단에 "비공개 거래 N건 포함" 문구로 알린다.
- 가맹점 이력(`getMerchantHistory`)은 파트너의 비공개 행을 **제외**한다(카테고리 추천·가맹점 건수로 새어 나가는 경로).
- 내보내기(`/api/finance/spending/export`)도 같은 조회 함수를 쓰므로 마스킹 행은 설명 "비공개 거래"로 나오고 금액·분류·결제수단은 비운다.

## 변경 권한

- 나만 보기 토글 액션 `setTransactionPrivateAction(txnId, value)`: `WHERE id = ? AND household_id = ? AND person_id = viewerPersonId`. 0행이면 무시.
- 기존 수정·삭제 액션(카테고리 변경, 사용 대상 변경, 개별/일괄 삭제)에 `AND (is_private = false OR person_id = viewerPersonId)` 조건 추가. 파트너의 비공개 거래는 바꾸거나 지울 수 없다.
- 수기 입력 폼에 "나만 보기" 체크박스를 둔다(선물처럼 입력 시점에 바로 숨기는 경우).

## 다시 업로드해도 유지

`app/finance/upload/actions.ts`의 재업로드 복원(`snapshotLockedRows`/`withRestoredLock`)은 `categoryLocked = true`인 행만 저장한다. 비공개만 켜고 분류는 안 고친 행이 사라지지 않도록:

- 스냅샷 조건을 `categoryLocked = true OR is_private = true`로 넓힌다.
- 스냅샷 항목에 `isPrivate`를 추가하고 복원 시 `is_private`를 되살린다. **`isPrivate`만 복원되는 행은 `categoryLocked`를 true로 만들지 않는다**(자동 분류 재계산이 계속 적용되어야 함).

## 공동 내역 업로드 옵션

사용 대상의 기본값은 업로드한 사람(`beneficiary = personId`)이라, 공동 계좌 내역을 올리면 전부 개인 지출로 잡혀 용돈 한도가 왜곡된다.

- 업로드 폼에 "이 파일은 공동 계좌/카드 내역" 체크박스를 추가한다.
- 체크하면 새 거래의 기본 `beneficiary`를 `'joint'`로 한다(`d.beneficiary ?? (공동 ? "joint" : personId)`).
- 기존 거래에는 영향이 없다. 이미 올린 데이터는 건별로 사용 대상을 고치거나 재업로드로 정리한다.

## 개인 지출 현황 카드 · 용돈 한도

- 위치: 월별 화면(`app/finance/spending/monthly/page.tsx`).
- 계산 `summarizeBeneficiarySpending`(`lib/spending-queries.ts`): 선택 월의 지출 중 집계에 포함되는 행(`countsInTotals`, `flowLabel` = "지출")을 `beneficiary`별로 합산. **파트너의 비공개 거래도 합계에 포함**(서버가 마스킹 전 금액으로 합산해 합계만 화면에 전달).
- 표시: 사람별 "개인 ○원 / 한도 ○원"(한도 있으면 진행 막대, 초과 시 "초과 ○원"을 `fg-critical` 색으로), 공동 ○원. 사람을 누르면 세부 내역을 해당 사용 대상 필터로 이동.
- 한도 입력: 설정 → 구성원 탭에서 **본인 행만** 수정(`setAllowanceAction`, `WHERE id = viewerPersonId`). 파트너의 한도는 읽기 전용으로 보인다. `personId`가 없는 계정은 입력 불가.
- 사람 수(1인·3인 이상)와 무관하게 `people` 목록 기준으로 동작.

## 알려진 한계 (수용)

- "합계만 공개"이므로 파트너가 월 합계 변화나 개인 지출 합계 증가로 큰 금액을 추정할 수는 있다. 내용(가맹점·메모·카테고리)은 알 수 없다.
- DB 접근 권한이 있는 관리자에게는 보인다. 앱 레벨 보호이며 RLS는 아니다.

## 롤아웃

1. Neon 브랜치(백업) 생성.
2. 스키마 컬럼 3개 추가(모두 NULL 허용 또는 기본값이라 기존 코드와 호환).
3. `migrate-private-link.ts`로 우리집 계정↔프로필 연결(미리보기 → 적용).
4. 코드 배포. 연결 전에는 비공개 거래가 없어 동작 변화가 없고, 연결이 빠진 계정은 fail-closed로 안전하다.
5. 개인정보처리방침에 "비공개 표시" 기능의 범위(같은 가구 구성원에게만 적용)를 한 줄 추가.

## 테스트

PGlite에 가구 2개·부부 2인을 시드해 다음을 확인한다(기존 `household-isolation.test.ts` 방식).

- 파트너 시점: 목록에서 비공개 거래의 설명·카테고리·결제수단이 비고, 화면용 행에는 금액이 없다. 월 합계·카테고리 합계는 비공개 거래를 포함한 값과 일치.
- 소유자 시점: 자기 비공개 거래는 그대로 보인다.
- `personId = null`(연결 없음, 데모 포함): 모든 비공개 거래가 마스킹되고 토글이 거부된다.
- 내보내기·가맹점 이력에 파트너의 비공개 정보가 없다.
- 파트너가 남의 비공개 거래의 토글·카테고리 변경·사용 대상 변경·삭제·일괄 삭제를 시도하면 0행 변경.
- 재업로드 후 `is_private`가 유지되고, 분류를 안 고친 행의 `categoryLocked`는 여전히 false.
- 개인 지출 합계: 파트너 비공개 거래 포함, 공동 업로드 옵션의 기본 `beneficiary = 'joint'`, 한도 초과 판정, 사람 1명·3명 가구.
- 한도 수정은 본인 프로필만 가능. 연결 스크립트는 멱등(두 번 실행해도 결과 동일).

## 변경 파일(예상)

`lib/finance-db.ts`, `lib/require-household.ts`, `lib/spending-queries.ts`, `lib/spending-export.ts`, 신규 `lib/spending-private.ts`, `app/finance/spending/{page,actions,manual-transaction-form}.tsx|ts`, `app/finance/spending/monthly/page.tsx`, `app/finance/spending/settings/{page,members-actions}.tsx|ts`, `app/finance/upload/{actions,upload-form}.ts|tsx`, `app/onboarding/actions.ts`, `app/invite/[token]/actions.ts`, 신규 `scripts/migrate-private-link.ts`, 관련 테스트, `app/privacy/page.tsx`.
