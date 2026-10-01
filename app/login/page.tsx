import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { sanitizeCallbackUrl } from "@/lib/auth-callback-url";

export const metadata: Metadata = {
  title: "로그인 | 가계부탁",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const destination = sanitizeCallbackUrl(callbackUrl);

  const session = await auth();
  if (session?.user?.email) redirect(destination);

  return (
    <main className="seed-shell flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="seed-card flex w-full max-w-sm flex-col items-center gap-4 p-6 text-center">
        <h1 className="seed-title">가계부탁 로그인</h1>
        <p className="text-[14px] text-ink-muted">각자 올린 뱅크샐러드 파일이 하나의 가계부로 합쳐져요.</p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: destination });
          }}
          className="w-full"
        >
          <button type="submit" className="seed-button seed-button-primary min-h-11 w-full">
            Google로 로그인
          </button>
        </form>
        <p className="text-[12px] text-ink-muted">
          로그인하면{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            개인정보처리방침
          </Link>
          에 동의하는 것으로 봐요.
        </p>
      </div>
    </main>
  );
}
