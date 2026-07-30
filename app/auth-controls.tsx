"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="min-h-9 rounded-full border border-zinc-200 bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90">로그인</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="min-h-9 rounded-full bg-zinc-900 px-3 py-2 text-xs font-semibold text-white shadow-sm dark:bg-white dark:text-zinc-900">가입</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/family" className="min-h-9 rounded-full border border-zinc-200 bg-white/90 px-3 py-2 text-xs font-semibold shadow-sm backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/90">가족</Link>
        <UserButton />
      </Show>
    </div>
  );
}
