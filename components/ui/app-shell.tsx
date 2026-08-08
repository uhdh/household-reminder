import type { ReactNode } from "react";

type AppShellSize = "compact" | "default" | "wide";

const widths: Record<AppShellSize, string> = {
  compact: "max-w-md",
  default: "max-w-2xl",
  wide: "max-w-5xl",
};

export function AppShell({
  children,
  size = "default",
  className = "",
}: {
  children: ReactNode;
  size?: AppShellSize;
  className?: string;
}) {
  return (
    <div className="seed-page">
      <main className={`mx-auto flex w-full flex-1 flex-col px-5 py-8 sm:px-6 ${widths[size]} ${className}`}>
        {children}
      </main>
    </div>
  );
}

