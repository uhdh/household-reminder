"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui";

/** 초대 링크 원문은 서버 액션 결과로 이번 한 번만 내려온다 - 새로고침하면 사라진다(브라우저에서만 렌더됨). */
export function InviteLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  // 손으로 드래그해 복사해도 동작하도록 화면에도 전체 주소를 보여준다.
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-r3 bg-bg-brand-weak px-3 py-2.5 text-[13px]">
      <code className="min-w-0 flex-1 truncate text-ink">{url}</code>
      <ActionButton type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-[12px]" onClick={handleCopy}>
        {copied ? "복사됨" : "복사"}
      </ActionButton>
    </div>
  );
}
