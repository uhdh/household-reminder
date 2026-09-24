"use client";

import { useState } from "react";
import { ActionButton } from "@/components/ui";

/** 초대 링크는 서버가 리다이렉트 쿼리로 이번 한 번만 원문을 내려준다 - 새로고침하면 사라진다. */
export function InviteLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-r3 bg-bg-brand-weak px-3 py-2.5 text-[13px]">
      <code className="min-w-0 flex-1 truncate text-ink">{path}</code>
      <ActionButton type="button" variant="secondary" className="min-h-9 px-3 py-1.5 text-[12px]" onClick={handleCopy}>
        {copied ? "복사됨" : "복사"}
      </ActionButton>
    </div>
  );
}
