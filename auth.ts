import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedFinanceSignIn } from "@/lib/auth-allowlist";

// Google 로그인만 사용, DB adapter 없이 JWT 세션으로 동작한다. 허용 명단
// (ALLOWED_EMAILS)에 없는 계정은 signIn 단계에서 바로 거부된다(fail-closed).
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
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
      });
    },
  },
});
