"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "자산관리", href: "/finance", active: (pathname: string) => pathname === "/finance" },
  { label: "월별지출", href: "/finance/spending/monthly", active: (pathname: string) => pathname.startsWith("/finance/spending/monthly") },
  { label: "세부 내역", href: "/finance/spending", active: (pathname: string) => pathname === "/finance/spending" },
  { label: "연간 내역", href: "/finance/spending/yearly", active: (pathname: string) => pathname.startsWith("/finance/spending/yearly") },
  { label: "설정", href: "/finance/spending/settings", active: (pathname: string) => pathname.startsWith("/finance/spending/settings") || pathname === "/finance/upload" },
];

export function TopTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="w-full overflow-x-auto border-t border-stroke-neutral-muted px-3 sm:px-4">
      <div className="mx-auto flex w-max min-w-full max-w-5xl gap-1 py-1">
        {tabs.map((tab) => {
          const isActive = tab.active(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`shrink-0 rounded-r2 px-3 py-2 text-[13px] font-semibold transition-colors ${
                isActive ? "bg-bg-brand-weak text-fg-brand" : "text-fg-neutral-muted hover:bg-bg-neutral-weak hover:text-fg-neutral"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
