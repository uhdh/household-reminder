import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/cleaning(.*)",
  "/supplies(.*)",
  "/emotion-cards(.*)",
  "/family(.*)",
  "/finance(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // layout.tsx/auth-controls.tsx already skip Clerk UI when no publishable key is configured
  // (e.g. local dev without Clerk set up); mirror that here so those environments aren't 500s.
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return;
  if (isProtectedRoute(request)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
