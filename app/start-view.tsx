import Image from "next/image";
import Link from "next/link";
import { BrandHero } from "@/app/brand-hero";

// 비로그인 방문자용 소개 페이지. 실데이터를 절대 쿼리하지 않는다.

const features = [
  {
    title: "자동 분류",
    description: "뱅크샐러드 분류를 우리집 카테고리로 바꾸고, 한 번 고친 가맹점은 다음부터 알아서 분류해요.",
    art: "from-[#ffd6b0] via-[#ffc4d6] to-[#e6d4ff]",
  },
  {
    title: "가족 합산",
    description: "각자 올린 파일이 한 가계부로 합쳐지고, 가족끼리 보낸 돈은 지출에서 빠져요.",
    art: "from-[#bfe7ff] via-[#c9f0e4] to-[#fff1c2]",
  },
  {
    title: "자산·연간 흐름",
    description: "순자산, 투자 비중, 월별 추이와 예산 대비 지출을 한 화면에서 확인해요.",
    art: "from-[#d7f5c8] via-[#c8ecf5] to-[#d9d6ff]",
  },
];

const steps = [
  { title: "Google로 가입", description: "가구 이름과 표시 이름만 정하면 끝이에요." },
  { title: "뱅크샐러드 엑셀 올리기", description: "앱에서 내려받은 파일을 그대로 올리면 자동으로 정리돼요." },
  { title: "가족 초대(선택)", description: "초대 링크를 보내면 각자 올린 내역이 한 가계부로 합쳐져요." },
];

const privacyPoints = [
  { title: "원본 미저장", description: "엑셀 원본은 저장하지 않고, 필요한 거래·자산 항목만 남겨요." },
  { title: "가구별 분리", description: "데이터는 가구 단위로 분리되어 우리 가족만 볼 수 있어요." },
  { title: "암호화 전송", description: "모든 통신은 HTTPS로 암호화되고, 초대 링크는 해시로만 저장해요." },
  { title: "언제든 삭제", description: "설정에서 가구를 삭제하면 가계부 데이터가 모두 지워져요." },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] font-semibold text-fg-brand">{children}</p>;
}

export function StartView() {
  return (
    <div className="flex-1 bg-bg-layer-default font-sans text-fg-neutral">
      <div className="p-2 sm:p-4">
        <BrandHero />
      </div>

      <section className="mx-auto grid max-w-5xl gap-6 px-5 py-20 sm:grid-cols-[1fr_2fr] sm:py-28" aria-labelledby="intro-heading">
        <SectionLabel>
          <span id="intro-heading">가계부탁 소개</span>
        </SectionLabel>
        <div className="space-y-5 text-[19px] leading-8 text-fg-neutral-muted sm:text-[21px] sm:leading-9">
          <p>
            <b className="font-semibold text-fg-neutral">가계부, 같이 쓰기는 어려웠어요.</b> 은행과 카드는 제각각이고, 서로 보낸 돈은 두 번 잡히고, 결국 엑셀로 다시
            정리하게 되죠.
          </p>
          <p>
            <b className="font-semibold text-fg-neutral">가계부탁은 각자 올린 뱅크샐러드 파일을 하나의 가계부로 합쳐요.</b> 분류, 이체 정리, 집계는 알아서 합니다. 혼자 써도 좋아요.
          </p>
        </div>
      </section>

      <section className="mx-2 rounded-[28px] bg-bg-layer-basement px-5 py-20 sm:mx-4 sm:py-28" aria-labelledby="features-heading">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <SectionLabel>자동 정리</SectionLabel>
            <h2 id="features-heading" className="mx-auto mt-3 max-w-2xl text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
              파일 하나 올리면,
              <br />
              가계부는 끝났어요.
            </h2>
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title}>
                <div className={`aspect-[4/3] rounded-[20px] bg-gradient-to-br ${feature.art}`} aria-hidden="true" />
                <p className="mt-4 text-[15px] leading-6 text-fg-neutral-muted">
                  <b className="font-semibold text-fg-neutral">{feature.title}</b> {feature.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Link href="/finance" className="text-[15px] font-semibold text-fg-brand hover:underline">
              샘플 가계부 둘러보기 →
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-20 sm:py-28" aria-labelledby="steps-heading">
        <div className="text-center">
          <SectionLabel>시작하기</SectionLabel>
          <h2 id="steps-heading" className="mt-3 text-[32px] font-semibold tracking-[-0.035em] sm:text-5xl">
            3분이면 시작해요.
          </h2>
        </div>
        <ol className="mt-14 grid gap-8 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t border-stroke-neutral-muted pt-6">
              <span className="text-[14px] font-semibold tabular-nums text-fg-brand">0{index + 1}</span>
              <h3 className="mt-2 text-xl font-semibold tracking-[-0.02em]">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-6 text-fg-neutral-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-2 rounded-[28px] bg-bg-layer-basement px-5 py-20 sm:mx-4 sm:py-28" aria-labelledby="privacy-heading">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <SectionLabel>개인정보 보호</SectionLabel>
            <h2 id="privacy-heading" className="mt-3 text-[32px] font-semibold tracking-[-0.035em] sm:text-5xl">
              <span className="font-mono tracking-normal text-fg-neutral-muted" aria-hidden="true">******</span> 원본은
              <br className="sm:hidden" /> 저장하지 않아요.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] leading-7 text-fg-neutral-muted">돈 이야기라 더 조심해요. 필요한 만큼만 저장하고, 우리 가족만 볼 수 있어요.</p>
          </div>
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {privacyPoints.map((point) => (
              <div key={point.title} className="rounded-[20px] bg-bg-layer-default p-6">
                <h3 className="text-[16px] font-semibold">{point.title}</h3>
                <p className="mt-2 text-[14px] leading-6 text-fg-neutral-muted">{point.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link href="/privacy" className="text-[15px] font-semibold text-fg-neutral-muted hover:text-fg-neutral hover:underline">
              개인정보처리방침 보기
            </Link>
          </div>
        </div>
      </section>

      <div className="p-2 pt-16 sm:p-4 sm:pt-24">
        <section className="landing-sky relative overflow-hidden rounded-[28px] px-5 py-24 text-center sm:py-32">
          <h2 className="text-[32px] font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
            가계부는 이제,
            <br />
            가계부탁에 부탁하세요.
          </h2>
          <Link
            href="/login"
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-[#141414] px-6 text-[15px] font-bold text-white hover:bg-black dark:bg-white dark:text-[#141414]"
          >
            Google로 무료 시작하기
          </Link>
        </section>
      </div>

      <footer className="mx-auto max-w-5xl px-5 py-14">
        <div className="flex flex-wrap justify-between gap-10">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-[-0.02em]">
            <Image src="/icon.svg" alt="" width={28} height={28} />
            가계부탁
          </Link>
          <div className="grid grid-cols-2 gap-x-16 gap-y-2 text-[14px] sm:grid-cols-3">
            <div className="space-y-2">
              <p className="font-semibold">서비스</p>
              <Link href="/finance" className="block text-fg-neutral-muted hover:text-fg-neutral">둘러보기</Link>
              <Link href="/login" className="block text-fg-neutral-muted hover:text-fg-neutral">시작하기</Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">정책</p>
              <Link href="/privacy" className="block text-fg-neutral-muted hover:text-fg-neutral">개인정보처리방침</Link>
              <Link href="/account-deletion" className="block text-fg-neutral-muted hover:text-fg-neutral">계정 삭제 안내</Link>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">문의</p>
              <a href="mailto:maktubhd@gmail.com" className="block text-fg-neutral-muted hover:text-fg-neutral">maktubhd@gmail.com</a>
            </div>
          </div>
        </div>
        <p className="mt-12 text-[13px] text-fg-neutral-muted">© 2026 가계부탁</p>
      </footer>
    </div>
  );
}
