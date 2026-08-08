import Link from "next/link";
import { SpendingNav } from "./nav";
import { AppShell, PageHeader } from "@/components/ui";

export default function SpendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell size="wide" className="font-office text-ink">
        <PageHeader
          title="우리집 자산흐름"
          description="월별 소비와 연간 흐름을 비교하고 관리해요."
          className="mb-5"
          action={
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/finance" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              자산 대시보드
            </Link>
            <Link href="/finance/upload" className="text-[13px] text-ink-muted transition-colors hover:text-ink">
              파일 업로드
            </Link>
            </div>
          }
        />

        <SpendingNav />

        {children}
    </AppShell>
  );
}
