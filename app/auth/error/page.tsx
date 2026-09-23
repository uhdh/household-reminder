import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인 오류 | 가계부탁",
};

export default function AuthErrorPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold text-fg-neutral">이 계정은 접근 권한이 없어요</h1>
      <p className="text-sm text-fg-neutral-muted">허용된 계정으로만 가계부를 이용할 수 있어요.</p>
      <Link href="/" className="seed-button seed-button-primary">
        돌아가기
      </Link>
    </main>
  );
}
