# 우리집 디자인 시스템

이 프로젝트의 UI는 SEED Design v2 토큰을 단일 기준으로 사용한다. 페이지에서 임의의 색상, 반경, 그림자를 추가하기보다 `components/ui`의 공통 컴포넌트를 먼저 확장한다.

## 디자인 원칙

- 생활 관리 도구답게 따뜻하고 간결한 인상을 유지한다.
- 주요 행동은 SEED의 `brand` 색상 하나로 통일한다.
- 상태 색상은 의미가 있을 때만 사용한다: `critical`, `warning`, `positive`, `informative`.
- 모바일을 기본으로 설계하고, 정보가 많은 화면만 넓은 셸을 사용한다.
- 라이트·다크 모드 모두 동일한 SEED semantic token을 사용한다.

## 토큰 기준

| 영역 | 기준 |
| --- | --- |
| 앱 배경 | `bg.layer.basement` |
| 기본 표면 | `bg.layer.default` |
| 플로팅 표면 | `bg.layer.floating` |
| 기본 텍스트 | `fg.neutral` |
| 보조 텍스트 | `fg.neutralMuted` |
| 브랜드 | `brand` / carrot |
| 구분선 | `stroke.neutralMuted` |
| 포커스 | `stroke.focusRing` |
| 페이지 제목 | SEED `t8 bold` |
| 본문 | SEED `t4 regular` |
| 작은 상태 텍스트 | SEED `t3 bold` |

## 레이아웃 기준

- compact: 최대 448px. 홈, 감정카드, 가족 공간.
- default: 최대 672px. 청소, 생필품.
- wide: 최대 1024px. 자산 및 지출 대시보드.
- 전역 좌우 여백: 모바일 20px, 넓은 화면 24px.
- 섹션 간격: 24px, 항목 간격: 12px.

## 형태 기준

- 일반 카드: 16px 반경, 1px semantic stroke, SEED layer surface.
- 주요 버튼: 14px 반경, 최소 높이 48px, brand solid.
- 아이콘 버튼과 상태 칩: pill 형태.
- 모달과 바텀시트: floating surface와 overlay token 사용.

## 컴포넌트 사용 규칙

- 페이지 루트는 `AppShell`을 사용한다.
- 제목 영역은 `PageHeader`를 사용한다.
- 독립된 정보 묶음은 `Card`를 사용한다.
- 상태 문구는 `StatusBadge`의 의미 기반 tone을 사용한다.
- 텍스트·날짜·파일 입력은 `TextInput`, 선택 입력은 `SelectInput`, 레이블 묶음은 `FormField`를 사용한다.
- 작업 버튼은 `ActionButton`의 `primary`, `secondary`, `danger`, `ghost` 변형으로 의미를 구분한다.
- 성공·오류 안내는 `FeedbackMessage`, 모바일 입력 모달은 `BottomSheet`, 완료 확인은 `CompletionDialog`를 사용한다.
- 반복 관리 항목은 `ItemGrid`와 `ItemTile`을 사용해 상태 배지와 진행 색상을 공유한다.
- 공통 컴포넌트로 표현할 수 없는 경우에만 페이지 전용 스타일을 추가한다.
