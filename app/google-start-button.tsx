import { signIn } from "@/auth";

// /login 중간 화면 없이 바로 Google 로그인으로 보낸다. "/"는 proxy 보호 대상이 아니라
// 비로그인 상태에서도 서버 액션(POST)이 막히지 않는다(/finance 하위 페이지에서는 쓰면 안 됨).
export function GoogleStartButton({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/finance" });
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
