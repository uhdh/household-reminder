import { SpendingNav } from "./nav";
import { AppShell, PageHeader } from "@/components/ui";

export default function SpendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell size="wide" className="font-office text-ink">
        <PageHeader
          title="우리집 자산흐름"
          description="월별 소비와 연간 흐름을 비교하고 관리해요."
          className="mb-5"
        />

        <SpendingNav />

        {children}
    </AppShell>
  );
}
