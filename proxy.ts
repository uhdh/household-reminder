import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { shouldProtectFinanceRequest } from "@/lib/finance-viewer";

function isFinanceRoute(pathname: string): boolean {
  return pathname === "/finance" || pathname.startsWith("/finance/") || pathname.startsWith("/api/finance/");
}

export default auth((request) => {
  const { pathname } = request.nextUrl;
  if (!isFinanceRoute(pathname)) return;
  if (!shouldProtectFinanceRequest({ pathname, method: request.method })) return;

  const isLoggedIn = Boolean(request.auth?.user);
  if (isLoggedIn) return;

  // API 요청/비GET(서버 액션, 업로드 등)은 401로, 일반 페이지 GET 요청은 로그인으로 보낸다.
  if (pathname.startsWith("/api/") || request.method !== "GET") {
    return new NextResponse(null, { status: 401 });
  }

  const signInUrl = new URL("/api/auth/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
