"use client";

import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export function AuthControls() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="seed-pill">로그인</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="seed-pill bg-bg-brand-solid text-fg-neutral-inverted">가입</button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Link href="/family" className="seed-pill">가족</Link>
        <UserButton />
      </Show>
    </div>
  );
}
