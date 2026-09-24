import "server-only";
import { auth } from "@/auth";
import { isFinanceAccessAllowed } from "@/lib/auth-allowlist";
import { shouldUseFinanceDemo } from "@/lib/finance-viewer";

export async function isFinanceDemoMode(): Promise<boolean> {
  const authConfigured = Boolean(process.env.AUTH_SECRET);
  if (!authConfigured) {
    // AUTH_SECRET이 없는 로컬 개발 환경에서는 기존처럼 로그인 없이 실데이터를 보여준다(편의).
    // 반면 프로덕션에 설정이 누락된 채 배포되면 실데이터가 열리면 안 되므로 데모만 보여준다(fail-closed).
    return process.env.NODE_ENV === "production";
  }
  const session = await auth();
  const email = session?.user?.email ?? null;
  // proxy.ts와 같은 판정(가입 공개 시 로그인만, 아니면 허용 명단)을 써야 신규 가입자가 샘플이 아닌 온보딩으로 간다.
  const allowed = isFinanceAccessAllowed({
    email,
    allowedEmailsRaw: process.env.ALLOWED_EMAILS,
    openSignupRaw: process.env.AUTH_OPEN_SIGNUP,
  });
  return shouldUseFinanceDemo({ authEnabled: authConfigured, userId: allowed ? email : null });
}
