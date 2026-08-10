import { AppShell } from "@/components/ui";

export default function SpendingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell size="wide" className="font-office text-ink">
        {children}
    </AppShell>
  );
}
