"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/finance/spending", label: "정리본" },
  { href: "/finance/spending/monthly", label: "월별지출" },
  { href: "/finance/spending/yearly", label: "연지출" },
  { href: "/finance/spending/settings", label: "설정" },
];

export function SpendingNav() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex w-full gap-1 overflow-x-auto border-[0.8px] border-hairline bg-card p-1 sm:inline-flex sm:w-auto">
      {TABS.map((tab) => {
        const active =
          tab.href === "/finance/spending" ? pathname === "/finance/spending" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`shrink-0 px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? "bg-canvas text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
