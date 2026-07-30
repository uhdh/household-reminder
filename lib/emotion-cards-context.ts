import { auth } from "@clerk/nextjs/server";
import { getFamilyMembership } from "./family-db";
import { getDb } from "./db";

export type EmotionFamilyContext = {
  familyId: number;
  userId: string;
};

export async function getEmotionFamilyContext(): Promise<EmotionFamilyContext | null> {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const membership = await getFamilyMembership(getDb(), userId);
  return membership ? { familyId: membership.familyId, userId } : null;
}
