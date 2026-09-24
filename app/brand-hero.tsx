import Image from "next/image";
import Link from "next/link";
import { GoogleStartButton } from "@/app/google-start-button";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";

// 히어로 안의 앱 화면 미리보기. 모두 가상의 숫자다.
const sampleFixed = [
  { name: "주거", value: 900_000, fill: "#2E7DD7" },
  { name: "보험", value: 250_000, fill: "#F36B2A" },
  { name: "통신", value: 150_000, fill: "#17A875" },
  { name: "교통", value: 120_000, fill: "#F2A900" },
];
const sampleVariable = [
  { name: "식비", value: 820_000, fill: "#2E7DD7" },
  { name: "생필품", value: 460_000, fill: "#F36B2A" },
  { name: "문화", value: 140_000, fill: "#17A875" },
  { name: "기타", value: 210_000, fill: "#DD6B9A" },
];

export function LandingNav() {
  return (
    <nav aria-label="가계부탁" className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
      <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-[-0.02em] text-fg-neutral">
        <Image src="/icon.svg" alt="" width={30} height={30} priority />
        가계부탁
      </Link>
      <div className="flex items-center gap-5">
        <Link href="/finance" className="hidden text-[15px] font-medium text-fg-neutral hover:opacity-70 sm:inline">
          둘러보기
        </Link>
        <Link href="/privacy" className="hidden text-[15px] font-medium text-fg-neutral hover:opacity-70 sm:inline">
          개인정보 보호
        </Link>
        <GoogleStartButton className="rounded-full bg-[#141414] px-4 py-2 text-[14px] font-bold text-white hover:bg-black dark:bg-white dark:text-[#141414]">
          로그인
        </GoogleStartButton>
      </div>
    </nav>
  );
}

function SkyBlobs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span className="absolute -left-16 top-24 size-72 rounded-full bg-white/70 blur-3xl dark:bg-white/5" />
      <span className="absolute right-0 top-10 size-96 rounded-full bg-white/60 blur-3xl dark:bg-white/5" />
      <span className="absolute left-1/3 top-64 size-80 rounded-full bg-white/50 blur-3xl dark:bg-white/5" />
    </div>
  );
}

function AppPreview() {
  return (
    <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-t-[18px] border border-b-0 border-black/10 bg-bg-layer-basement text-left shadow-[0_30px_80px_-20px_rgba(120,60,20,0.35)] sm:mt-16">
      <div className="flex items-center gap-3 border-b border-stroke-neutral-muted bg-bg-layer-default px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="truncate text-[13px] text-fg-neutral-muted">가계부탁 · 월별지출 · 2026년 7월</span>
        <span className="ml-auto shrink-0 rounded-full bg-bg-neutral-weak px-2.5 py-1 text-[11px] font-medium text-fg-neutral-muted">예시 화면</span>
      </div>
      <div className="max-h-[420px] overflow-hidden p-4 sm:max-h-[520px] sm:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="총수입" value={6_200_000} format="compactKrw" />
          <SummaryCard label="총지출" value={3_050_000} format="compactKrw" />
          <SummaryCard label="당월 저축" value={3_150_000} format="compactKrw" />
          <SummaryCard label="저축률" value={50.8} format="signedPct" />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CategoryPie title="고정비" data={sampleFixed} />
          <CategoryPie title="변동비" data={sampleVariable} />
        </div>
      </div>
    </div>
  );
}

export function BrandHero() {
  return (
    <section className="landing-sky relative overflow-hidden rounded-[28px]">
      <SkyBlobs />
      <LandingNav />
      <div className="relative px-5 pt-14 text-center sm:pt-20">
        <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-[13px] font-medium text-fg-neutral backdrop-blur dark:border-white/15 dark:bg-white/10">
          뱅크샐러드 엑셀 파일로 바로 시작
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-[40px] font-semibold leading-[1.15] tracking-[-0.04em] text-fg-neutral sm:text-6xl">
          가계부는 <br className="sm:hidden" />부탁만 하세요.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-7 text-fg-neutral-muted sm:text-lg">
          각자 올리면, 알아서 합쳐져요. 소비·자산·투자가 한 화면에 정리돼요.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <GoogleStartButton className="inline-flex min-h-12 items-center rounded-full bg-[#141414] px-6 text-[15px] font-bold text-white hover:bg-black dark:bg-white dark:text-[#141414]">
            Google로 무료 시작하기
          </GoogleStartButton>
          <Link href="/finance" className="inline-flex min-h-12 items-center rounded-full border border-black/10 bg-white/70 px-6 text-[15px] font-bold text-fg-neutral backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/10">
            로그인 없이 둘러보기
          </Link>
        </div>
        <AppPreview />
      </div>
    </section>
  );
}
