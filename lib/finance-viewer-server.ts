import "server-only";
import { auth } from "@clerk/nextjs/server";
import { shouldUseFinanceDemo } from "@/lib/finance-viewer";

export async function isFinanceDemoMode(): Promise<boolean> {
  const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!clerkEnabled) return false;
  const { userId } = await auth();
  return shouldUseFinanceDemo({ clerkEnabled, userId });
}
