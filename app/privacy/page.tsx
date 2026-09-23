import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 가계부탁",
  description: "가계부탁 서비스의 개인정보처리방침입니다.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm leading-relaxed text-fg-neutral">
      <h1 className="mb-6 text-xl font-bold">개인정보처리방침</h1>
      <p className="mb-6 text-fg-neutral-muted">시행일: 2026년 9월 18일</p>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>회원가입 및 로그인 시: 이메일 주소, 인증 식별자(Google 계정 정보)</li>
          <li>서비스 이용 시: 사용자가 직접 입력하거나 연동한 가계부·자산·지출 내역</li>
          <li>자동 수집 정보: 접속 로그, 기기 및 브라우저 정보</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">2. 개인정보의 수집 및 이용 목적</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별 및 로그인 유지</li>
          <li>가계부·자산 현황 계산 및 화면 제공</li>
          <li>서비스 오류 대응 및 개선</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">3. 개인정보 처리 위탁 및 제3자 제공</h2>
        <p className="mb-2">서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁하고 있으며, 위탁 목적 외 이용이나 제3자 제공은 하지 않습니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Google (회원 인증 처리)</li>
          <li>Neon (데이터베이스 호스팅)</li>
          <li>Vercel (애플리케이션 호스팅)</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">4. 개인정보 보유 및 이용 기간</h2>
        <p>회원 탈퇴 시 지체 없이 파기하며, 관계 법령에 따라 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">5. 이용자의 권리</h2>
        <p>이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있으며, 회원 탈퇴를 통해 개인정보 처리 정지를 요청할 수 있습니다.</p>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">6. 문의처</h2>
        <p>개인정보 관련 문의사항은 아래 이메일로 연락해주세요.</p>
        <p className="mt-1 font-medium">maktubhd@gmail.com</p>
      </section>
    </main>
  );
}
