import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthControls } from "./auth-controls";
import { ThemeToggle } from "./theme-toggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "우리집",
  description: "우리집 청소와 생필품, 감정카드 관리",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <>
      <header className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 border-b border-stroke-neutral-muted bg-bg-layer-default/95 px-3 py-2 backdrop-blur sm:px-4">
        <Link
          href="/"
          aria-label="우리집 홈으로 이동"
          className="flex shrink-0 items-center gap-2 rounded-r2 px-1.5 py-1 text-sm font-bold text-fg-neutral hover:bg-bg-layer-default-pressed"
        >
          <Image src="/icon.svg" alt="" width={28} height={28} priority />
          <span>우리집</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <ThemeToggle />
          <AuthControls />
        </div>
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
