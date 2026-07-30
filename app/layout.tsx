import type { Metadata } from "next";
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
      <header className="sticky top-0 z-50 flex w-full items-center justify-between gap-3 border-b border-zinc-200/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur sm:px-4 dark:border-zinc-800/70 dark:bg-black/85">
        <AuthControls />
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/" aria-label="홈으로 이동" title="홈으로" className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-base shadow-sm backdrop-blur transition hover:scale-105 sm:h-10 sm:w-10 sm:text-lg dark:border-zinc-700 dark:bg-zinc-900/90">🏠</Link>
          <ThemeToggle />
        </div>
      </header>
      {children}
    </>
  );

  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? <ClerkProvider>{content}</ClerkProvider> : content}
      </body>
    </html>
  );
}
