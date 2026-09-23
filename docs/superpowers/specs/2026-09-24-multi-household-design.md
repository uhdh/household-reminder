# 여러 가구(가족) 지원 설계

작성일: 2026-09-24 · 상태: 초안(사용자 검토 대기, 구현은 별도 브랜치에서만 진행)

## 목표

- 누구나 Google로 가입해 **자기 가구**를 만들고, 초대 링크로 가족을 합류시킨다.
- 한 가구의 데이터는 **다른 가구에서 절대 보이거나 바뀌지 않는다**(최우선 요구사항).
- 기존 우리집 데이터·사용 흐름은 그대로 유지된다(이전 후 화면 수치 동일).

## 하지 않는 것

- 은행 API 자동 연동, 결제/구독, 이메일 발송(초대는 링크 복사 방식), 한 사용자의 여러 가구 동시 소속 UI(데이터 모델은 허용하되 첫 버전은 가구 1개만 선택).

## 데이터 모델

새 테이블

| 테이블 | 컬럼 |
|---|---|
| `households` | id uuid PK, name, created_at |
| `users` | id uuid PK, email unique(소문자), name, created_at |
| `household_members` | household_id FK, user_id FK, role `'owner' \| 'member'`, created_at, unique(household_id, user_id) |
| `household_invites` | id uuid PK, household_id FK, token_hash unique, created_by FK users, expires_at, used_at, used_by |

기존 가계부 테이블 9개(`people, uploads, asset_items, transactions, allocation_targets, category_mappings, category_rules, category_keyword_rules, budget_categories`)에 `household_id uuid NOT NULL FK` 추가. 전역 unique 제약은 가구 단위로 변경:

- `allocation_targets(category)` → `(household_id, category)`
- `category_mappings(txn_type, raw_category, raw_subcategory)` → `+household_id`
- `category_rules(txn_type, payment_method)` → `+household_id`
- `category_keyword_rules(keyword)` → `(household_id, keyword)`
- `budget_categories(name)` → `(household_id, name)`

`people`(자산·거래의 주체)은 로그인 사용자와 분리된 "구성원 프로필"로 유지한다(로그인 안 하는 가족도 표현 가능). 기존 `'husband'`, `'wife'` id는 그대로 두고, 새 가구의 구성원은 uuid 문자열 id를 쓴다. `transactions.beneficiary`는 `people.id` 또는 `'joint'`.

## 접근 제어

- 모든 서버 코드는 `requireHousehold()` 하나로 현재 사용자 → 가구 id를 얻는다(세션 이메일 → users → household_members). 기존 `requireFinanceUser()`/`ALLOWED_EMAILS`를 대체.
- 모든 조회·수정·삭제 쿼리에 `household_id = 현재 가구` 조건. id로 단건 수정하는 액션도 `WHERE id = ? AND household_id = ?`.
- `proxy.ts`는 로그인 여부만 확인(가구 소속 판정은 DB 필요 → 서버 코드에서).
- 격리 테스트: PGlite에 가구 2개를 시드하고, 페이지 데이터 함수·서버 액션·export API가 다른 가구 행을 읽거나 바꾸지 못하는지 검증(가구 B의 거래 id로 A가 카테고리 변경 시도 → 0행 변경 등).
- 후속 강화(선택): Postgres Row Level Security. 첫 버전은 앱 레벨 + 격리 테스트.

## 가입·초대 흐름

1. Google 로그인 → `users`에 없으면 생성.
2. 소속 가구 없음 → `/onboarding`: "새 가계부 만들기"(가구 이름, 내 표시 이름) 또는 "초대 링크로 합류".
3. 가구 생성 시 기본 카테고리·매핑·예산 카테고리를 시드(`scripts/seed-spending.ts` 기본값 재사용), 생성자는 owner, `people`에 본인 프로필 생성.
4. owner는 설정 > 구성원에서 초대 링크 생성(7일, 1회용, 토큰은 해시로 저장) → 카톡 등으로 전달 → 상대가 `/invite/[token]`에서 로그인 후 수락 → member + `people` 프로필 생성.
5. 로그아웃 상태 `/finance`는 기존처럼 샘플 데모.

## 남편/아내 일반화

- 사람 필터, 순자산 카드, 업로드 "보유자", beneficiary 선택 등 하드코딩(현재 15개 파일)을 가구의 `people` 목록 기반으로 변경. 1인·3인 이상 가구도 동작.

## 기존 데이터 이전(우리집)

1. Neon에서 **DB 브랜치(백업) 생성** 후 진행.
2. 멱등 마이그레이션 스크립트: 가구 "우리집" 생성 → 두 이메일로 users·members(owner/owner) 생성 → 모든 기존 행 `household_id` 채움 → NOT NULL·새 unique 제약 적용.
3. 이전 전후로 월별/연간/자산 핵심 수치 스냅샷 비교(동일해야 함).

## 단계

| 단계 | 내용 | 배포 |
|---|---|---|
| P0 | Auth.js 전환(허용 명단) — 완료, 비밀 키 등록 후 배포 | 즉시 |
| P1 | 스키마·마이그레이션 스크립트·`requireHousehold`·쿼리 스코핑·격리 테스트 | 브랜치 |
| P2 | 온보딩·초대·구성원 설정 | 브랜치 |
| P3 | 남편/아내 일반화 | 브랜치 |
| P4 | Neon 백업 → 운영 마이그레이션 → 배포 → Google 동의 화면 '프로덕션' 게시 | 사용자 확인 후 |

## 위험

- 쿼리 스코핑 누락 = 타 가구 금융 데이터 노출. → 격리 테스트 + 리뷰에서 `db.select/update/delete` 전수 점검.
- 운영 마이그레이션 실패 → Neon 브랜치로 복구.
- 개인정보처리방침: 다수 이용자 대상으로 문구 갱신 필요(P4 전).
