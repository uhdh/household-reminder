import Image from "next/image";
import Link from "next/link";
import { GoogleStartButton } from "@/app/google-start-button";
import { HeroDemo } from "@/app/hero-demo";

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
      <span className="landing-drift absolute -left-16 top-24 size-72 rounded-full bg-white/70 blur-3xl dark:bg-white/5" />
      <span className="landing-drift absolute right-0 top-10 size-96 rounded-full bg-white/60 blur-3xl [animation-delay:-6s] dark:bg-white/5" />
      <span className="landing-drift absolute left-1/3 top-64 size-80 rounded-full bg-white/50 blur-3xl [animation-delay:-12s] dark:bg-white/5" />
    </div>
  );
}

export function BrandHero() {
  return (
    <section className="landing-sky relative overflow-hidden rounded-[28px]">
      <SkyBlobs />
      <LandingNav />
      <div className="relative px-5 pt-14 text-center sm:pt-20">
        <span className="landing-enter inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-[13px] font-medium text-fg-neutral backdrop-blur dark:border-white/15 dark:bg-white/10">
          뱅크샐러드 엑셀 파일로 바로 시작
        </span>
        <h1 className="landing-enter [animation-delay:80ms] mx-auto mt-6 max-w-3xl text-[40px] font-semibold leading-[1.15] tracking-[-0.04em] text-fg-neutral sm:text-6xl">
          가계부는 <br className="sm:hidden" />부탁만 하세요.
        </h1>
        <p className="landing-enter [animation-delay:160ms] mx-auto mt-5 max-w-xl text-[17px] leading-7 text-fg-neutral-muted sm:text-lg">
          각자 올리면, 알아서 합쳐져요. 소비·자산·투자가 한 화면에 정리돼요.
        </p>
        <div className="landing-enter [animation-delay:240ms] mt-8 flex flex-wrap justify-center gap-3">
          <GoogleStartButton className="inline-flex min-h-12 items-center rounded-full bg-[#141414] px-6 text-[15px] font-bold text-white hover:bg-black dark:bg-white dark:text-[#141414]">
            Google로 무료 시작하기
          </GoogleStartButton>
          <Link href="/finance" className="inline-flex min-h-12 items-center rounded-full border border-black/10 bg-white/70 px-6 text-[15px] font-bold text-fg-neutral backdrop-blur hover:bg-white dark:border-white/15 dark:bg-white/10">
            로그인 없이 둘러보기
          </Link>
        </div>
        <HeroDemo />
      </div>
    </section>
  );
}
