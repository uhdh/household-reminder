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
        <div className="flex flex-wrap items-center gap-x-10 px-4 sm:px-6 lg:px-12">
          <Link
            href="/"
            aria-label="가계부탁 홈으로 이동"
            className="order-1 flex h-14 shrink-0 items-center gap-2.5 rounded-r2 text-lg font-extrabold tracking-[-0.02em] text-fg-neutral md:h-[62px]"
          >
            <Image src="/icon.svg" alt="" width={32} height={32} priority />
            <span>가계부탁</span>
          </Link>
          <div className="order-2 ml-auto flex min-w-0 items-center gap-2 md:order-3">
            <ThemeToggle />
            <AuthControls />
          </div>
          <TopTabs />
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
