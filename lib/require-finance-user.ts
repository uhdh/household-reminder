import "server-only";
import { auth } from "@/auth";
import { isEmailAllowed } from "./auth-allowlist";

// proxy.ts가 이미 비로그인/미허용 요청을 막아주지만, 서버 액션과 /api/finance/** 라우트는
// proxy만 믿지 않고 각자 세션 + 허용 명단을 다시 확인한다(방어 심층화).
export class FinanceAuthError extends Error {
  constructor() {
    super("가계부 접근 권한이 없습니다.");
    this.name = "FinanceAuthError";
  }
}

export async function requireFinanceUser(): Promise<{ email: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!isEmailAllowed(email, process.env.ALLOWED_EMAILS)) {
    throw new FinanceAuthError();
  }
  return { email: email! };
}
