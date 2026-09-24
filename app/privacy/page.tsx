import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 가계부탁",
  description: "가계부탁 서비스의 개인정보처리방침입니다.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm leading-relaxed text-fg-neutral">
      <h1 className="mb-6 text-xl font-bold">개인정보처리방침</h1>
      <p className="mb-1 text-fg-neutral-muted">시행일: 2026년 9월 24일</p>
      <p className="mb-6 text-fg-neutral-muted">이전 버전: 2026년 9월 18일</p>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">1. 서비스 소개</h2>
        <p>
          가계부탁은 여러 가구가 각자 Google 계정으로 가입해 자신의 가구를 만들고, 초대 링크로
          가족을 합류시켜 함께 가계부·자산을 관리하는 서비스입니다. 이 방침은 가구 단위 이용
          구조를 전제로 개인정보 처리 사항을 안내합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">2. 수집하는 개인정보 항목</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>회원가입 및 로그인 시: 이메일 주소, 이름, Google 계정 식별자(Google OAuth 인증 정보)</li>
          <li>가구·가계부 이용 시: 가구 정보, 구성원 표시 이름, 업로드한 뱅크샐러드 엑셀에서 추출한
            거래내역(거래일시, 유형, 분류, 내용/가맹점, 금액, 결제수단), 자산·부채 항목, 예산 목표 및
            카테고리 분류 규칙. 업로드한 엑셀 파일 원본 자체는 저장하지 않으며, 파일에서 추출한
            거래·자산 내역만 데이터베이스에 저장합니다.</li>
          <li>가족 초대 시: 초대 생성자, 초대 생성·만료 일시. 초대 링크에 담긴 토큰 원문은 저장하지
            않고, 이를 해시 처리한 값만 저장합니다.</li>
          <li>자동 수집 정보: 접속 로그, 기기 및 브라우저 정보</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">3. 개인정보의 수집 및 이용 목적</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인 유지</li>
          <li>가구 단위 가계부·자산 현황 계산 및 화면 제공</li>
          <li>초대 링크를 통한 가족 구성원 합류 처리</li>
          <li>서비스 오류 대응 및 개선</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">4. 가구 구성원 간 정보 공유</h2>
        <p>
          같은 가구에 소속된 구성원은 초대를 통해 합류한 시점부터 해당 가구에 등록된 모든
          가계부·자산 데이터(거래내역, 자산·부채 항목, 예산, 카테고리 규칙 등)를 함께 조회하고
          수정할 수 있습니다. 초대 링크는 발급 후 7일간만 유효하며, 1회 사용하면 즉시 만료됩니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">5. 개인정보 처리 위탁 및 국외 이전</h2>
        <p className="mb-2">
          서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁하며, 위탁 목적 외 이용이나 별도의
          제3자 제공은 하지 않습니다. 아래 업체는 모두 국외에 소재하고 있어, 위탁 과정에서
          네트워크를 통한 개인정보의 국외 이전이 발생합니다.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium">Google</span> — 이전받는 국가: 미국 등 Google의 데이터센터
            소재 국가 / 이전 항목: 이메일, 이름, Google 계정 식별자 / 목적: 회원 인증(로그인) 처리 /
            보유기간: 서비스 이용 기간 및 위탁계약 종료 시까지 / 이전 방법: 네트워크를 통한 전송
          </li>
          <li>
            <span className="font-medium">Vercel</span> — 이전받는 국가: 미국 등 Vercel의 데이터센터
            소재 국가 / 이전 항목: 접속 로그, 서비스 이용 중 발생하는 요청·응답 데이터 / 목적:
            애플리케이션 호스팅 및 실행 / 보유기간: 서비스 이용 기간 및 위탁계약 종료 시까지 /
            이전 방법: 네트워크를 통한 전송
          </li>
          <li>
            <span className="font-medium">Neon</span> — 이전받는 국가: 미국 등 Neon의 데이터센터
            소재 국가 / 이전 항목: 가입 정보 및 가구·가계부 관련 데이터 전체(2. 항목 참고) / 목적:
            데이터베이스 호스팅 및 저장 / 보유기간: 서비스 이용 기간 및 위탁계약 종료 시까지 /
            이전 방법: 네트워크를 통한 전송
          </li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">6. 개인정보 보유 및 파기</h2>
        <p>
          회원 탈퇴 시 본인의 계정 정보와 가구 구성원 정보는 지체 없이 삭제합니다. 탈퇴하는
          회원이 소속 가구의 유일한 구성원이었던 경우 그 가구의 가계부·자산 데이터도 함께
          삭제됩니다. 같은 가구에 다른 구성원이 남아 있는 경우 가구 데이터는 남은 구성원의 이용을
          위해 유지되며, 가구 전체 데이터 삭제는 해당 가구의 owner가 별도로 요청해야 합니다.
          관계 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관 후 파기합니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">7. 쿠키의 사용</h2>
        <p>
          로그인 상태를 유지하기 위한 세션 쿠키(서명된 토큰)만 사용하며, 광고나 통계 분석을 위한
          쿠키는 사용하지 않습니다.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">8. 만 14세 미만 아동의 가입 제한</h2>
        <p>가계부탁은 만 14세 미만 아동의 회원가입을 받지 않습니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">9. 개인정보의 안전성 확보조치</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>모든 통신 구간 HTTPS 암호화 전송</li>
          <li>로그인 및 가구 소속 여부를 기반으로 한 접근 통제</li>
          <li>가구별 데이터 분리 관리로 다른 가구의 데이터 접근 차단</li>
          <li>초대 링크 토큰은 원문이 아닌 해시 값으로만 저장</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">10. 이용자의 권리</h2>
        <p>
          이용자는 언제든지 자신의 개인정보를 열람·정정·삭제할 수 있으며, 회원 탈퇴를 통해 개인정보
          처리 정지를 요청할 수 있습니다. 가계부 화면에서 엑셀 다운로드 기능을 이용하면 본인 가구의
          거래내역 사본을 직접 내려받을 수 있습니다.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">11. 개인정보 보호책임자 및 문의처</h2>
        <p>개인정보 관련 문의사항은 아래 이메일로 연락해주세요.</p>
        <p className="mt-1 font-medium">maktubhd@gmail.com</p>
        <p className="mt-2 text-fg-neutral-muted">
          이 방침이 변경되는 경우 시행일 7일 전부터 이 페이지를 통해 고지합니다.
        </p>
      </section>
    </main>
  );
}
