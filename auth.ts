import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedFinanceSignIn } from "@/lib/auth-allowlist";
import { getDb } from "@/lib/db";
import { users } from "@/lib/finance-db";

// Google 로그인만 사용, DB adapter 없이 JWT 세션으로 동작한다. 기본은 허용 명단
// (ALLOWED_EMAILS)에 없는 계정을 signIn 단계에서 바로 거부(fail-closed). AUTH_OPEN_SIGNUP=true면
// 명단 없이도(이메일 인증만 되면) 가입을 허용한다 - 초대 링크로 새 사람을 들이려면 이 플래그가 필요.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // 한 브라우저에서 여러 Google 계정을 쓰는 가족도 계정을 고를 수 있도록 매번 계정 선택 화면을 띄운다.
  providers: [Google({ authorization: { params: { prompt: "select_account" } } })],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ profile }) {
      return isAllowedFinanceSignIn({
        emailVerified: profile?.email_verified as boolean | undefined,
        email: profile?.email,
        allowedEmailsRaw: process.env.ALLOWED_EMAILS,
        openSignupRaw: process.env.AUTH_OPEN_SIGNUP,
      });
    },
  },
  events: {
    // 로그인 성공 후 users 테이블에 upsert(이메일 소문자 + 이름). requireHousehold()가 이 행을
    // 전제로 가구 소속을 조회하므로, 온보딩/초대 수락 전에 미리 만들어둔다. 여기서 실패해도
    // 로그인 자체는 막지 않는다(온보딩·초대 수락 액션이 각자 다시 upsert하는 안전망이 있음).
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return;
      try {
        const db = getDb();
        await db
          .insert(users)
          .values({ email, name: user.name ?? null })
          .onConflictDoUpdate({ target: users.email, set: { name: user.name ?? null } });
      } catch (e) {
        console.error("로그인 후 users upsert 실패:", e);
      }
    },
  },
});
