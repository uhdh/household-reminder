import type { Metadata } from "next";
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
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: destination });
          }}
        >
          <button type="submit" className="seed-button seed-button-primary">
            Google로 로그인
          </button>
        </form>
      </div>
    </main>
  );
}
