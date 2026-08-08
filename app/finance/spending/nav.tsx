"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance/spending", label: "지출 내역" },
  { href: "/finance/spending/monthly", label: "월별지출" },
  { href: "/finance/spending/yearly", label: "연지출" },
  { href: "/finance/spending/settings", label: "설정" },
];

export function SpendingNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="지출 분석 메뉴" className="seed-card mb-4 flex w-full gap-1 overflow-x-auto p-1 sm:inline-flex sm:w-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/finance/spending" ? pathname === "/finance/spending" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 rounded-full px-3 py-2 text-[12px] font-semibold transition-colors ${
              active ? "bg-bg-brand-solid text-fg-neutral-inverted" : "text-fg-neutral-muted hover:bg-bg-neutral-weak hover:text-fg-neutral"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
