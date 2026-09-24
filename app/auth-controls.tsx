import Link from "next/link";
import { auth, signOut } from "@/auth";

export async function AuthControls() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    // 헤더는 서버 컴포넌트라 현재 경로를 알기 어려우므로 callbackUrl 없이 /login으로 보낸다
    // (로그인 후 기본값인 /finance로 이동한다). proxy.ts가 비GET 요청을 막기 때문에 서버 액션
    // 폼이 아니라 일반 GET 네비게이션(Link)으로 로그인 페이지로 이동해야 한다.
    return (
      <Link href="/login" className="seed-pill">
        Google로 로그인
      </Link>
    );
  }

  const label = email.split("@")[0];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="seed-pill truncate" title={email}>
        {label}
      </span>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <button type="submit" className="seed-pill">
          로그아웃
        </button>
      </form>
    </div>
  );
}
