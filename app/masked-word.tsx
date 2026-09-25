"use client";

import { useEffect, useState } from "react";

const MASK = "•";

// 글자를 한 자씩 입력한 뒤 비밀번호처럼 앞에서부터 가리고, 잠시 멈췄다가 반복하는 애니메이션.
function buildFrames(word: string): string[] {
  const chars = Array.from(word);
  const frames: string[] = [];
  for (let i = 1; i <= chars.length; i++) frames.push(chars.slice(0, i).join(""));
  for (let i = 0; i < 6; i++) frames.push(word); // 다 입력된 상태로 잠깐 보여줌
  for (let i = 1; i <= chars.length; i++) {
    frames.push(chars.map((c, index) => (index < i && c !== " " ? MASK : c)).join(""));
  }
  const masked = frames[frames.length - 1];
  for (let i = 0; i < 12; i++) frames.push(masked);
  frames.push("");
  return frames;
}

export function MaskedWord({ word }: { word: string }) {
  const [frames] = useState(() => buildFrames(word));
  // 첫 렌더(서버·움직임 줄이기 설정)는 가려진 최종 상태로 고정한다.
  const [index, setIndex] = useState(frames.length - 2);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % frames.length), 130);
    return () => window.clearInterval(id);
  }, [frames]);

  const text = frames[index];
  return (
    <span className="relative inline-block whitespace-nowrap" aria-label={word} role="img">
      {/* 폭이 흔들리지 않도록 원문 폭만큼 자리를 잡아 둔다. */}
      <span className="invisible" aria-hidden="true">{word}</span>
      <span aria-hidden="true" className="absolute inset-0 text-left text-fg-brand">
        {text}
        <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] animate-pulse rounded-full bg-fg-brand align-baseline" />
      </span>
    </span>
  );
}
