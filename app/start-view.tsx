import Link from "next/link";
import { IconArrowUpBracketDownLine, IconLinechartUpXaxisLine, IconPerson2Line } from "@karrotmarket/react-monochrome-icon";
import { AppShell, Card } from "@/components/ui";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";
import { BrandHero } from "@/app/brand-hero";

// 비로그인 방문자용 소개 페이지. 실데이터를 절대 쿼리하지 않는다 - 아래 숫자는 모두 가상의 예시다.

const benefits = [
  { Icon: IconArrowUpBracketDownLine, title: "한 번만 올리면", description: "카테고리 분류·집계는 자동" },
  { Icon: IconPerson2Line, title: "각자 올리면", description: "가족 데이터를 한 화면에 합쳐서" },
  { Icon: IconLinechartUpXaxisLine, title: "소비부터 투자까지", description: "월별·연간 흐름을 한눈에" },
];

const steps = [
  { title: "Google로 가입", description: "가구 이름과 표시 이름만 정하면 끝이에요." },
  { title: "뱅크샐러드 엑셀 올리기", description: "앱에서 내려받은 파일을 그대로 올리면 자동으로 분류돼요." },
  { title: "가족 초대(선택)", description: "초대 링크를 보내면 각자 올린 내역이 한 가계부로 합쳐져요." },
];

const privacyPoints = [
  "업로드한 엑셀 원본은 저장하지 않고, 필요한 거래·자산 항목만 저장해요.",
  "가구별로 데이터가 분리되어 우리 가족만 볼 수 있어요.",
  "모든 통신은 HTTPS로 암호화되고, 언제든 탈퇴·가구 삭제가 가능해요.",
];

const sampleVariable = [
  { name: "식비", value: 820_000, fill: "#2E7DD7" },
  { name: "생필품", value: 460_000, fill: "#F36B2A" },
  { name: "교통", value: 180_000, fill: "#17A875" },
  { name: "문화", value: 140_000, fill: "#F2A900" },
  { name: "기타", value: 210_000, fill: "#DD6B9A" },
];

export function StartView() {
  return (
    <AppShell size="wide" className="font-sans">
      <BrandHero />

      <section className="py-6 sm:py-8" aria-label="가계부탁의 주요 기능">
        <div className="grid gap-3 sm:grid-cols-3">
          {benefits.map((benefit) => (
            <Card key={benefit.title} className="p-7 shadow-none">
              <span className="flex size-14 items-center justify-center rounded-r3 bg-bg-brand-weak text-fg-brand" aria-hidden="true">
                <benefit.Icon size={28} />
              </span>
              <h3 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em] text-fg-neutral">{benefit.title}</h3>
              <p className="mt-1 text-base text-fg-neutral-muted">{benefit.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-stroke-neutral-muted py-10" aria-labelledby="preview-heading">
        <p className="text-sm font-bold text-fg-brand">가계부탁이 만든 결과</p>
        <h2 id="preview-heading" className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-fg-neutral">입력은 한 번, 이후에는 확인만 하세요</h2>
        <Card className="mt-6 overflow-hidden p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-fg-neutral">이번 달 가계부</h3>
            <span className="rounded-r2 bg-bg-neutral-weak px-3 py-1.5 text-[13px] font-medium text-fg-neutral-muted">예시 화면 · 가상의 숫자</span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <SummaryCard label="총수입" value={6_200_000} format="compactKrw" />
            <SummaryCard label="총지출" value={3_610_000} format="compactKrw" />
            <SummaryCard label="당월 저축" value={2_590_000} format="compactKrw" />
            <SummaryCard label="저축률" value={41.8} format="signedPct" />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CategoryPie title="변동비" data={sampleVariable} />
            <div className="flex flex-col justify-center gap-3 rounded-r3 bg-bg-neutral-weak p-5 text-sm leading-6 text-fg-neutral-muted">
              <p><b className="text-fg-neutral">자동 분류</b> — 뱅크샐러드 분류를 우리집 카테고리로 바꾸고, 가족 간 이체는 지출에서 빼요.</p>
              <p><b className="text-fg-neutral">한 번 고치면 기억</b> — 분류를 고칠 때 같은 가맹점 거래도 한 번에 바꿀 수 있어요.</p>
              <p><b className="text-fg-neutral">예산·연간 흐름</b> — 카테고리별 예산과 월별 추이를 한 화면에서 봐요.</p>
            </div>
          </div>
        </Card>
        <Link href="/finance" className="mt-4 inline-block text-sm font-bold text-fg-brand hover:underline">
          샘플 가계부 전체 둘러보기 →
        </Link>
      </section>

      <section className="border-t border-stroke-neutral-muted py-10" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="text-3xl font-extrabold tracking-[-0.03em] text-fg-neutral">3분이면 시작해요</h2>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="seed-card p-6 shadow-none">
              <span className="flex size-9 items-center justify-center rounded-full bg-bg-brand-solid text-sm font-black text-fg-neutral-inverted">{index + 1}</span>
              <h3 className="mt-4 text-lg font-extrabold text-fg-neutral">{step.title}</h3>
              <p className="mt-1 text-sm leading-6 text-fg-neutral-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-stroke-neutral-muted py-10" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-3xl font-extrabold tracking-[-0.03em] text-fg-neutral">돈 이야기라 더 조심해요</h2>
        <ul className="mt-6 space-y-3">
          {privacyPoints.map((point) => (
            <li key={point} className="flex gap-3 text-base text-fg-neutral">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-bg-positive-solid" aria-hidden="true" />
              {point}
            </li>
          ))}
        </ul>
        <Link href="/privacy" className="mt-4 inline-block text-sm font-bold text-fg-neutral-muted hover:text-fg-neutral hover:underline">
          개인정보처리방침 보기
        </Link>
      </section>

      <section className="rounded-r5 bg-bg-brand-weak px-6 py-10 text-center">
        <h2 className="text-2xl font-extrabold tracking-[-0.03em] text-fg-neutral sm:text-3xl">이번 달 가계부, 가계부탁에 맡겨 보세요</h2>
        <p className="mt-2 text-fg-neutral-muted">무료로 시작하고, 필요 없으면 언제든 탈퇴할 수 있어요.</p>
        <Link href="/login" className="seed-button seed-button-primary mt-6 min-h-14 rounded-r3 px-8 text-base">
          Google로 무료 시작하기
        </Link>
      </section>
    </AppShell>
  );
}
