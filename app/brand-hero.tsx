import Image from "next/image";
import Link from "next/link";

function SourceRow({ label, tone }: { label: string; tone: "husband" | "wife" }) {
  const dotClass = tone === "husband" ? "bg-husband" : "bg-wife";

  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-4 sm:px-5">
      <span className={`size-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-bold text-fg-neutral">{label}</p>
        <p className="mt-0.5 text-xs text-fg-neutral-muted">소비 · 자산 · 투자 파일</p>
      </div>
    </div>
  );
}

const results = [
  { label: "소비 내역", detail: "자동 분류" },
  { label: "자산 현황", detail: "부부 통합" },
  { label: "투자 내역", detail: "함께 확인" },
];

export function BrandHero() {
  return (
    <section className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default px-5 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.95fr)] lg:gap-12">
        <div>
          <p className="text-sm font-bold text-fg-brand">귀찮은 돈 관리, 가계부탁에 부탁하세요</p>
          <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-[-0.055em] text-fg-neutral sm:text-5xl lg:text-[3.5rem]">
            가계부는 부탁만 하세요.
          </h1>
          <p className="mt-5 text-xl font-bold tracking-[-0.025em] text-fg-neutral sm:text-2xl">
            각자 올리면, 알아서 합쳐져요.
          </p>
          <p className="mt-4 max-w-xl text-sm leading-6 text-fg-neutral-muted sm:text-base sm:leading-7">
            남편과 아내의 뱅크샐러드 파일을 각각 올리면 소비 내역부터 자산과 주식 투자까지 자동으로 분류해 한 화면에 정리합니다.
          </p>
          <Link href="/finance/upload" className="seed-button seed-button-primary mt-7 min-w-44">
            파일 올리고 시작하기
          </Link>
        </div>

        <div
          role="group"
          aria-label="남편과 아내 데이터 통합 과정"
          className="overflow-hidden rounded-r4 border border-stroke-neutral-muted bg-bg-layer-default"
        >
          <div className="grid divide-y divide-stroke-neutral-muted sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <SourceRow label="남편 데이터" tone="husband" />
            <SourceRow label="아내 데이터" tone="wife" />
          </div>

          <div className="flex items-center justify-between gap-3 border-y border-stroke-brand-weak bg-bg-brand-weak px-4 py-3 sm:px-5">
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

          <div className="grid grid-cols-3 divide-x divide-stroke-neutral-muted">
            {results.map((result) => (
              <div key={result.label} className="px-2 py-4 text-center sm:px-4 sm:py-5">
                <p className="text-sm font-bold text-fg-neutral">{result.label}</p>
                <p className="mt-1 text-[11px] text-fg-neutral-muted sm:text-xs">{result.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
