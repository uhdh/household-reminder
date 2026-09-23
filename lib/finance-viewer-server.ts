import "server-only";
import { auth } from "@/auth";
import { isEmailAllowed } from "@/lib/auth-allowlist";
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
  const allowed = isEmailAllowed(email, process.env.ALLOWED_EMAILS);
  return shouldUseFinanceDemo({ authEnabled: authConfigured, userId: allowed ? email : null });
}
