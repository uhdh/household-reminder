import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthControls } from "./auth-controls";
import { ThemeToggle } from "./theme-toggle";
import { TopTabs } from "./top-tabs";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "가계부탁",
  description: "각자 올리면 알아서 합쳐지는 부부 자산·가계부·투자 자동화 서비스",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-stroke-neutral-muted bg-bg-layer-default/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4">
          <Link
            href="/"
            aria-label="가계부탁 홈으로 이동"
            className="flex shrink-0 items-center gap-2 rounded-r2 px-1.5 py-1 text-sm font-bold text-fg-neutral hover:bg-bg-layer-default-pressed"
          >
            <Image src="/icon.svg" alt="" width={28} height={28} priority />
            <span>가계부탁</span>
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <ThemeToggle />
            <AuthControls />
          </div>
        </div>
        <TopTabs />
      </header>
      {children}
    </>
  );

  return (
    <html
      lang="ko"
      data-seed
      data-seed-color-mode="system"
      data-seed-user-color-scheme="light"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
