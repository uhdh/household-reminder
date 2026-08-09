import type { Metadata } from "next";
import Link from "next/link";
import { AppShell, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Get Started | 우리집",
  description: "뱅크샐러드 데이터로 부부의 자산과 가계부를 자동으로 관리하는 방법을 소개합니다.",
};

const benefits = [
  {
    icon: "⚡",
    title: "일일이 입력하지 않아도 돼요",
    description: "뱅크샐러드 엑셀 파일을 업로드하면 거래 내역을 읽고 수입·지출과 카테고리를 자동으로 정리합니다.",
  },
  {
    icon: "💑",
    title: "부부의 돈을 한곳에서 봐요",
    description: "각자의 소비 내역과 자산을 합쳐 우리집 전체 흐름은 물론 남편·아내별 현황도 함께 확인할 수 있어요.",
  },
  {
    icon: "📊",
    title: "월별·연간 흐름이 바로 보여요",
    description: "정리된 데이터로 월별 지출, 연간 추이, 저축률과 자산 구성을 자동으로 계산해 보여줍니다.",
  },
];

const steps = [
  ["1", "데이터 받기", "뱅크샐러드에서 자산·가계부 엑셀 파일을 내려받아요."],
  ["2", "파일 업로드", "남편과 아내의 파일을 각각 우리집에 올려요."],
  ["3", "자동 정리 확인", "합쳐진 자산과 소비 내역, 자동 분류 결과를 바로 확인해요."],
] as const;

export default function GetStartedPage() {
  return (
    <AppShell size="default" className="font-sans">
      <Link href="/" className="mb-6 text-sm font-semibold text-fg-neutral-muted hover:text-fg-neutral">
        ← 홈으로
      </Link>

      <section className="rounded-r4 bg-bg-brand-weak px-5 py-8 sm:px-8 sm:py-10">
        <span className="seed-pill bg-bg-brand-solid text-fg-neutral-inverted">Get Started</span>
        <h1 className="mt-5 text-3xl font-bold leading-tight tracking-[-0.03em] text-fg-neutral sm:text-4xl">
          자산관리와 가계부,
          <br />이제 입력보다 확인에 집중하세요
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-fg-neutral-muted">
          뱅크샐러드 데이터를 업로드하면 우리집이 거래를 자동으로 분류하고, 부부의 소비와 자산 내역을 하나로 합쳐줍니다.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row">
          <Link href="/finance/upload" className="seed-button seed-button-primary min-h-12 px-5">
            파일 업로드로 시작하기
          </Link>
          <Link href="/finance" className="seed-button seed-button-secondary min-h-12 px-5">
            자산관리 둘러보기
          </Link>
        </div>
      </section>

      <section className="py-10">
        <p className="text-sm font-bold text-fg-brand">왜 우리집인가요?</p>
        <h2 className="mt-2 text-2xl font-bold text-fg-neutral">귀찮은 정리는 자동으로, 중요한 판단은 직접</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-5 shadow-none">
              <span className="flex h-11 w-11 items-center justify-center rounded-r3 bg-bg-neutral-weak text-2xl" aria-hidden>
                {benefit.icon}
              </span>
              <h3 className="mt-4 text-base font-bold text-fg-neutral">{benefit.title}</h3>
              <p className="mt-2 text-sm leading-6 text-fg-neutral-muted">{benefit.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-y border-stroke-neutral-muted py-10">
        <p className="text-sm font-bold text-fg-brand">사용 방법</p>
        <h2 className="mt-2 text-2xl font-bold text-fg-neutral">파일만 올리면 세 단계로 끝나요</h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <li key={number} className="flex gap-3 sm:block">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-sm font-bold text-fg-neutral-inverted">
                {number}
              </span>
              <div className="sm:mt-3">
                <h3 className="font-bold text-fg-neutral">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-fg-neutral-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="py-10 text-center">
        <p className="mx-auto max-w-xl text-xl font-bold leading-8 text-fg-neutral">
          “그동안 엑셀로 수작업하던 노가다는 제가 해놨어요.
          <br className="hidden sm:block" /> 여러분은 파일만 올리고 편하게 확인하세요.”
        </p>
        <p className="mt-3 text-sm text-fg-neutral-muted">우리집을 직접 쓰기 위해 만든 사람이 드리는 약속</p>
        <Link href="/finance/upload" className="seed-button seed-button-primary mt-6 min-h-12 px-6">
          우리집 돈 관리 시작하기
        </Link>
      </section>
    </AppShell>
  );
}
