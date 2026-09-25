"use client";

import { memo, useEffect, useRef, useState } from "react";
import { IconDocumentLine } from "@karrotmarket/react-monochrome-icon";
import { SummaryCard } from "@/app/finance/_components/summary-card";
import { CategoryPie } from "@/app/finance/spending/monthly/chart";

// 히어로 앱 화면 안에서 "파일 올리기 → 자동 정리 → 결과"를 반복 재생하는 데모(aside.com 히어로 방식).
// 모든 숫자는 가상의 값이다. 서버 렌더·움직임 줄이기 설정에서는 결과 화면으로 멈춰 있다.

const LOOP_MS = 12_000;
const PROCESS_AT = 2_600;
const RESULT_AT = 6_000;
const STILL_T = 9_000; // 정지 화면(결과 단계)

const files = [
  { name: "지훈_뱅크샐러드.xlsx", tone: "bg-husband/15 text-husband", at: 300 },
  { name: "수아_뱅크샐러드.xlsx", tone: "bg-wife/15 text-wife", at: 900 },
];

const steps = [
  "거래 563건 읽는 중",
  "카테고리 자동 분류 · 98% 완료",
  "가족 간 이체 12건은 지출에서 제외",
  "자산·투자 14개 항목 합산",
];

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

function useLoopTime(): number {
  const [t, setT] = useState(STILL_T);
  const startRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    startRef.current = performance.now();
    const id = window.setInterval(() => setT((performance.now() - startRef.current) % LOOP_MS), 100);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

function Spinner() {
  return <span className="block size-3.5 animate-spin rounded-full border-2 border-fg-brand border-t-transparent" aria-hidden="true" />;
}

function Check() {
  return (
    <span className="flex size-3.5 items-center justify-center rounded-full bg-bg-positive-solid text-[9px] font-black text-white" aria-hidden="true">
      ✓
    </span>
  );
}

function UploadStage({ t }: { t: number }) {
  const clicked = t > 2_000;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <p className="text-[14px] font-semibold text-fg-neutral">뱅크샐러드 엑셀 파일을 올려주세요</p>
      <div className="flex w-full max-w-sm flex-col gap-2">
        {files.map((file) => {
          const visible = t > file.at;
          const progress = Math.min(Math.max((t - file.at) / 900, 0), 1);
          return (
            <div
              key={file.name}
              className={`flex items-center gap-3 rounded-[12px] bg-bg-layer-default px-3 py-2.5 shadow-sm transition-all duration-300 ${visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] ${file.tone}`}>
                <IconDocumentLine size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg-neutral">{file.name}</p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-neutral-weak">
                  <div className="h-full rounded-full bg-fg-brand transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <span
        className={`relative rounded-full px-5 py-2 text-[13px] font-bold transition-all ${clicked ? "scale-95 bg-fg-brand text-white" : "bg-[#141414] text-white dark:bg-white dark:text-[#141414]"}`}
      >
        정리 시작
        {/* 가짜 커서: 버튼 위로 이동해 클릭한다. */}
        <svg
          viewBox="0 0 24 24"
          className="absolute size-5 drop-shadow transition-all duration-700 ease-out"
          style={{ left: t > 1_300 ? "70%" : "160%", top: t > 1_300 ? "55%" : "170%", opacity: t > 900 ? 1 : 0 }}
          aria-hidden="true"
        >
          <path d="M4 3l7 17 2.5-7.5L21 10z" fill="#141414" stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

function ProcessStage({ t }: { t: number }) {
  const local = t - PROCESS_AT;
  return (
    <div className="flex h-full flex-col justify-center gap-3 px-2 sm:px-10">
      <p className="text-[13px] font-semibold text-fg-neutral-muted">가계부탁이 정리하는 중…</p>
      <ul className="flex flex-col gap-2.5">
        {steps.map((step, index) => {
          const start = index * 750;
          if (local < start) return null;
          const done = local > start + 650;
          return (
            <li key={step} className="flex animate-[landing-rise_0.35s_ease-out_both] items-center gap-2.5 rounded-[12px] bg-bg-layer-default px-3.5 py-2.5 text-[13px] text-fg-neutral shadow-sm">
              {done ? <Check /> : <Spinner />}
              <span className={done ? "" : "text-fg-neutral-muted"}>{step}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// t 대신 boolean만 받아 memo로 감싼다 — 100ms마다 차트(recharts)가 다시 그려지지 않도록.
const ResultStage = memo(function ResultStage({ counted }: { counted: boolean }) {
  return (
    <div className="animate-[landing-rise_0.4s_ease-out_both]">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="총수입" value={counted ? 6_200_000 : 0} format="compactKrw" />
        <SummaryCard label="총지출" value={counted ? 3_050_000 : 0} format="compactKrw" />
        <SummaryCard label="당월 저축" value={counted ? 3_150_000 : 0} format="compactKrw" />
        <SummaryCard label="저축률" value={counted ? 50.8 : 0} format="signedPct" />
      </div>
      <div className="mt-3 hidden grid-cols-2 gap-3 sm:grid">
        <CategoryPie title="고정비" data={sampleFixed} />
        <CategoryPie title="변동비" data={sampleVariable} />
      </div>
    </div>
  );
});

export function HeroDemo() {
  const t = useLoopTime();
  const stage = t < PROCESS_AT ? "upload" : t < RESULT_AT ? "process" : "result";
  const title = stage === "upload" ? "파일 올리기" : stage === "process" ? "자동 정리" : "월별지출 · 2026년 7월";

  return (
    <div className="landing-scale mx-auto mt-14 max-w-5xl overflow-hidden rounded-t-[18px] border border-b-0 border-black/10 bg-bg-layer-basement text-left shadow-[0_30px_80px_-20px_rgba(120,60,20,0.35)] sm:mt-16">
      <div className="flex items-center gap-3 border-b border-stroke-neutral-muted bg-bg-layer-default px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="truncate text-[13px] text-fg-neutral-muted">가계부탁 · {title}</span>
        <span className="ml-auto shrink-0 rounded-full bg-bg-neutral-weak px-2.5 py-1 text-[11px] font-medium text-fg-neutral-muted">예시 화면</span>
      </div>
      <div className="relative h-[330px] overflow-hidden p-4 sm:h-[480px] sm:p-6" aria-hidden="true">
        {stage === "upload" && <UploadStage t={t} />}
        {stage === "process" && <ProcessStage t={t} />}
        {/* 결과 카드가 나타난 직후 0 → 실제 값으로 바꿔 AnimatedNumber가 숫자를 올리도록 한다. */}
        {stage === "result" && <ResultStage counted={t > RESULT_AT + 250} />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-28 bg-gradient-to-t from-bg-layer-basement to-transparent sm:block" />
      </div>
    </div>
  );
}
