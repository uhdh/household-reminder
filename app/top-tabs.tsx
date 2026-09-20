"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBarchartSquareLine,
  IconCalendarLine,
  IconGearLine,
  IconHouseLine,
  IconReceiptLine,
} from "@karrotmarket/react-monochrome-icon";

const tabs = [
  { label: "자산관리", href: "/finance", Icon: IconHouseLine, active: (pathname: string) => pathname === "/finance" },
  { label: "월별지출", href: "/finance/spending/monthly", Icon: IconCalendarLine, active: (pathname: string) => pathname.startsWith("/finance/spending/monthly") },
  { label: "세부 내역", href: "/finance/spending", Icon: IconReceiptLine, active: (pathname: string) => pathname === "/finance/spending" },
  { label: "연간 내역", href: "/finance/spending/yearly", Icon: IconBarchartSquareLine, active: (pathname: string) => pathname.startsWith("/finance/spending/yearly") },
  { label: "설정", href: "/finance/spending/settings", Icon: IconGearLine, active: (pathname: string) => pathname.startsWith("/finance/spending/settings") || pathname === "/finance/upload" },
];

export function TopTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="주요 메뉴"
      className="order-3 w-full overflow-x-auto border-t border-stroke-neutral-muted [scrollbar-width:none] md:order-2 md:w-auto md:flex-1 md:border-t-0 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full gap-6 md:gap-7">
        {tabs.map(({ label, href, Icon, active }) => {
          const isActive = active(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px flex h-12 shrink-0 items-center gap-1.5 border-b-[3px] text-[14px] transition-colors md:h-[62px] md:text-[15px] ${
                isActive
                  ? "border-fg-brand font-bold text-fg-neutral"
                  : "border-transparent font-medium text-fg-neutral-muted hover:text-fg-neutral"
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
