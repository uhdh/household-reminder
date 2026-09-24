import Image from "next/image";
import Link from "next/link";
import { IconArrowDownLine, IconDocumentLine } from "@karrotmarket/react-monochrome-icon";

function SourceChip({ label, tone }: { label: string; tone: "husband" | "wife" }) {
  const toneClass = tone === "husband" ? "bg-husband/15 text-husband" : "bg-wife/15 text-wife";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-r3 bg-bg-neutral-weak px-4 py-3.5">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-r2 ${toneClass}`} aria-hidden="true">
        <IconDocumentLine size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-fg-neutral">{label}</p>
        <p className="mt-0.5 text-xs text-fg-neutral-muted">뱅크샐러드 엑셀</p>
      </div>
    </div>
  );
}

const results = ["소비 내역", "자산 현황", "투자 내역"];

export function BrandHero() {
  return (
    <section className="overflow-hidden rounded-r5 border border-stroke-neutral-muted bg-bg-layer-default px-5 py-8 sm:px-8 sm:py-10 lg:px-14 lg:py-14">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="text-sm font-bold text-fg-brand">귀찮은 돈 관리, 가계부탁에 부탁하세요</p>
          <h1 className="mt-5 text-5xl font-black leading-[1.12] tracking-[-0.045em] text-fg-neutral sm:text-6xl lg:text-[4.5rem]">
            가계부는 <br />부탁만 하세요.
          </h1>
          <p className="mt-6 text-xl font-bold tracking-[-0.025em] text-fg-neutral sm:text-[22px]">
            각자 올리면, 알아서 합쳐져요.
          </p>
          <p className="mt-3 max-w-md text-sm leading-6 text-fg-neutral-muted sm:text-base sm:leading-7">
            뱅크샐러드에서 내려받은 엑셀 파일만 올리면 소비·자산·투자가 한 화면에 정리돼요. 혼자 써도, 가족을 초대해 함께 써도 좋아요.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="seed-button seed-button-primary min-h-14 min-w-48 rounded-r3 px-8 text-base">
              Google로 무료 시작하기
            </Link>
            <Link href="/finance" className="seed-button seed-button-secondary min-h-14 rounded-r3 px-6 text-base">
              로그인 없이 둘러보기
            </Link>
          </div>
        </div>

        <div role="group" aria-label="가족 데이터 통합 과정" className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <SourceChip label="내 파일" tone="husband" />
            <SourceChip label="가족 파일" tone="wife" />
          </div>

          <div className="flex justify-center text-fg-brand" aria-hidden="true">
            <IconArrowDownLine size={24} />
          </div>

          <div className="rounded-r4 border border-stroke-brand-weak bg-bg-brand-weak p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Image src="/icon.svg" alt="" width={36} height={36} className="size-9 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-black tracking-[-0.02em] text-fg-neutral">가계부탁 자동 정리</p>
                  <p className="mt-0.5 truncate text-xs text-fg-neutral-muted">우리 가계 · 자산 · 투자</p>
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-fg-positive">
                <span className="size-1.5 rounded-full bg-bg-positive-solid" aria-hidden="true" />
                정리 완료
              </span>
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {results.map((label) => (
                <li key={label} className="rounded-r2 bg-bg-layer-default px-3 py-1.5 text-[13px] font-bold text-fg-neutral">
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
