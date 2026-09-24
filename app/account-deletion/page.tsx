import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "계정 삭제 요청 | 가계부탁",
  description: "가계부탁 계정 및 데이터 삭제를 요청하는 방법을 안내합니다.",
};

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-sm leading-relaxed text-fg-neutral">
      <h1 className="mb-6 text-xl font-bold">계정 삭제 요청</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">삭제 요청 방법</h2>
        <p>
          앱 안에서 설정 → 구성원 탭의 위험 구역에서 직접 가구 나가기(탈퇴)·가구 삭제를 실행할 수
          있습니다. 이메일로 요청하실 경우 아래 이메일로
          <strong> 가입하신 이메일 주소</strong>와 함께 삭제 요청을 보내주세요. 가구(가족) 전체의
          가계부 데이터 삭제를 원하시는 경우, 해당 가구의 owner가 요청해주셔야 합니다.
        </p>
        <p className="mt-2 font-medium">maktubhd@gmail.com</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">처리 기한</h2>
        <p>요청을 받은 날로부터 영업일 기준 7일 이내에 계정과 관련 데이터를 삭제합니다.</p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-base font-semibold">삭제되는 항목</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>계정 정보(이메일, 이름, Google 계정 식별자) 및 가구 구성원 정보</li>
          <li>
            요청하신 분이 소속 가구의 유일한 구성원인 경우: 그 가구에 등록된 가계부·자산·지출 내역
            전체를 함께 삭제합니다.
          </li>
          <li>
            같은 가구에 다른 구성원이 남아 있는 경우: 계정과 구성원 정보만 삭제되고, 가구의
            가계부·자산 데이터는 남은 구성원을 위해 유지됩니다. 가구 데이터 전체 삭제는 그 가구의
            owner가 별도로 요청해야 처리됩니다.
          </li>
        </ul>
        <p className="mt-2 text-fg-neutral-muted">
          관계 법령에 따라 일정 기간 보관이 의무화된 정보는 해당 기간이 지난 후 삭제됩니다. 자세한 내용은{" "}
          <a href="/privacy" className="underline">
            개인정보처리방침
          </a>
          을 참고해주세요.
        </p>
      </section>
    </main>
  );
}
