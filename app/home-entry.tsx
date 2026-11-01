"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppExperience } from "./app-experience";

export function HomeEntry({ signedIn, children }: { signedIn: boolean; children?: React.ReactNode }) {
  const isApp = useAppExperience();
  const router = useRouter();

  useEffect(() => {
    if (isApp === null) return;
    if (isApp) {
      router.replace(signedIn ? "/finance/spending/monthly" : "/login?callbackUrl=%2Ffinance%2Fspending%2Fmonthly");
    } else if (signedIn) {
      router.replace("/finance");
    }
  }, [isApp, router, signedIn]);

  if (signedIn || isApp) {
    return <main className="seed-shell py-20 text-center" role="status">가계부를 여는 중이에요…</main>;
  }
  return <div className="web-only flex flex-1 flex-col">{children}</div>;
}
