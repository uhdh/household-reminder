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
      <AuthControls />
      <Link href="/" aria-label="홈으로 이동" title="홈으로" className="fixed right-16 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-lg shadow-sm backdrop-blur transition hover:scale-105 dark:border-zinc-700 dark:bg-zinc-900/90">🏠</Link>
      <ThemeToggle />
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
