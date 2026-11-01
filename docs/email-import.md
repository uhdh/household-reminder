# 뱅크샐러드 이메일 가져오기

## 구현된 흐름

로그인 → 자료 가져오기 → 내 수신 주소 만들기 → 뱅크샐러드에서 해당 주소로 내보내기 → 도착 확인 → 비밀번호 입력 → 건수·기간 확인 → 가계부에 반영.

- 주소는 가구 구성원별 192비트 무작위 토큰이다. 같은 가구의 다른 계정도 수신 자료를 볼 수 없다.
- 가구 구성원 삭제 시 주소·수신 메타데이터가 함께 삭제된다. 원본 메일의 Resend 보관은 별도다.
- 앱 DB에는 수신 식별자, 주소 연결, 처리 상태만 저장한다. 원본 첨부와 비밀번호는 저장하지 않는다.
- Resend에는 메일·첨부가 보관되므로 운영 활성화 전에 실제 플랜의 보관기간·삭제 절차를 확인하고 개인정보처리방침에 반영해야 한다.
- 최근 7일/20개 수신 내역을 표시한다. 버튼으로 도착 확인하며 푸시 알림은 없다.
- 자료는 확인 버튼을 누를 때 복호화하고, 반영 버튼을 누를 때 다시 검증한다. 비밀번호는 양쪽 요청 중에만 사용한다.
- 반영은 본인 프로필에만 허용한다. 공동 계좌 여부는 사용자가 선택한다.
- 웹훅은 SDK로 원문 서명·시간을 검증하고 실제 API의 `received_for`를 주소와 대조한다. 공용 주소로 받은 메일은 개인에게 자동 할당하지 않는다.
- 중복 웹훅은 동일 ID로 무시한다. 반영 시작은 조건부 UPDATE로 한 번만 허용한다. 쓰기 중 오류는 `failed`로 남겨 자동 재시도를 막는다. 기존 업로드 로직은 여러 DB 요청을 사용하므로 실패 시 일부 반영될 수 있다. 원본을 재전송하기 전에 기존 내역 확인이 필요하다.
- ZIP은 암호화 AES/ZipCrypto를 지원한다. 첨부 10MB, 내부 총 40MB, 엔트리 1,000개 제한이 있으며 XLSX 한 개만 선택한다.

## 운영 연결 순서

1. 대상 DB를 확인한 뒤 `scripts/migrate-import-email.sql` 실행. 두 테이블과 조회 인덱스만 추가한다.
2. Resend의 수신 조회 가능한 API 키를 서버 환경변수 `RESEND_API_KEY`에 설정한다. 키를 클라이언트에 전달하지 않는다.
3. `IMPORT_EMAIL_DOMAIN=iecrisiofl.resend.app` 설정.
4. 배포된 `/api/import-email`에 `email.received` 이벤트 웹훅을 등록하고 `RESEND_WEBHOOK_SECRET`을 서버 환경변수에 설정한다.
5. 개인정보처리방침에 실제 수신 서비스 보관·삭제 조건을 반영한 뒤 `EMAIL_IMPORT_ENABLED=true`로 활성화하고 배포한다. 기본은 비활성화다.
6. 앱에서 발급한 개인 주소로 새 자료를 보내고 미리보기·반영을 확인한다. `banksalad@...`로 받은 기존 시험 메일은 자동 배정되지 않는다.
7. 다른 계정에서는 자료가 보이지 않는지 확인한다. 장애 복구로 웹훅 재전송 시에도 중복 행이 생성되지 않아야 한다.

Resend의 수신 서비스 API 문서: https://resend.com/docs/api-reference/emails/retrieve-received-email
웹훅 검증: https://resend.com/docs/webhooks/verify-webhooks-requests

## 로컬 검증

`npm test -- lib/finance-parse/zip.test.ts lib/import-email.test.ts app/api/import-email/route.test.ts app/finance/upload lib/finance-parse/seoulpay.test.ts`

실제 사용자의 파일 비밀번호는 코드·테스트·로그에 넣지 않는다. 테스트는 합성 파일과 인메모리 DB를 사용한다.
