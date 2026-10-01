"use client";

import Link from "next/link";

// 서버/렌더링 오류 시 기본 영어 오류 화면 대신 보여준다. 오류 내용(error.message)은 노출하지 않는다.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="seed-card max-w-md p-8 text-center shadow-none">
        <h1 className="text-[22px] font-extrabold text-ink">일시적인 오류가 생겼어요</h1>
        <p className="mt-2 text-[14px] text-ink-muted">잠시 후 다시 시도해 주세요. 계속되면 새로고침해 보세요.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="seed-button seed-button-primary min-h-11 px-5 py-2 text-[14px]">
            다시 시도
          </button>
          <Link href="/finance" className="seed-button seed-button-secondary inline-flex min-h-11 items-center px-5 py-2 text-[14px]">
            가계부로 가기
          </Link>
        </div>
      </div>
    </main>
  );
}
