import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isFinanceAccessAllowed } from "@/lib/auth-allowlist";
import { shouldProtectFinanceRequest } from "@/lib/finance-viewer";

function isFinanceRoute(pathname: string): boolean {
  return (
    pathname === "/finance" ||
    pathname.startsWith("/finance/") ||
    pathname.startsWith("/api/finance/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/")
  );
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  if (!isFinanceRoute(pathname)) return;
  if (!shouldProtectFinanceRequest({ pathname, method: request.method })) return;

  // 로그인 여부만이 아니라 허용 명단(또는 AUTH_OPEN_SIGNUP)도 매 요청 확인해, 명단에서 빠진
  // 계정의 기존 세션도 막는다. 가구 소속 여부는 여기서 판정하지 않는다(서버 코드/requireHousehold).
  if (
    isFinanceAccessAllowed({
      email: request.auth?.user?.email,
      allowedEmailsRaw: process.env.ALLOWED_EMAILS,
      openSignupRaw: process.env.AUTH_OPEN_SIGNUP,
    })
  )
    return;

  // API 요청/비GET(서버 액션, 업로드 등)은 401로, 일반 페이지 GET 요청은 로그인으로 보낸다.
  if (pathname.startsWith("/api/") || request.method !== "GET") {
    return new NextResponse(null, { status: 401 });
  }

  const signInUrl = new URL("/login", request.url);
  signInUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
