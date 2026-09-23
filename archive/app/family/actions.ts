"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { createFamily, getFamilyMembership, joinFamily } from "@/lib/family-db";

export type FamilyActionState = { error?: string; success?: string };

export async function createFamilyAction(): Promise<FamilyActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "먼저 Google로 로그인해주세요." };
  const membership = await createFamily(getDb(), userId);
  revalidatePath("/family");
  return { success: `가족 공간이 준비됐습니다. 초대코드: ${membership.inviteCode}` };
}

export async function joinFamilyAction(_previous: FamilyActionState, formData: FormData): Promise<FamilyActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "먼저 Google로 로그인해주세요." };
  const inviteCode = String(formData.get("inviteCode") ?? "");
  if (!inviteCode.trim()) return { error: "초대코드를 입력해주세요." };
  try {
    const membership = await joinFamily(getDb(), userId, inviteCode);
    revalidatePath("/family");
    return { success: `가족 공간에 참여했습니다. 초대코드: ${membership.inviteCode}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "가족 공간에 참여하지 못했습니다." };
  }
}

export async function getCurrentFamily() {
  const { userId } = await auth();
  return userId ? getFamilyMembership(getDb(), userId) : null;
}
