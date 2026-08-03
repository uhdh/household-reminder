import Link from "next/link";
import { SpendingNav } from "./nav";

export default function SpendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 font-office text-ink">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[16px] font-semibold tracking-tight text-ink">우리집 자산흐름</h1>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/finance" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              자산 대시보드
            </Link>
            <Link href="/finance/upload" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              파일 업로드
            </Link>
          </div>
        </div>

        <SpendingNav />

        {children}
      </div>
    </div>
  );
}
