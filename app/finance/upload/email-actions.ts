"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHousehold } from "@/lib/require-household";
import { createImportAddress, getOwnedEmailFile } from "@/lib/import-email";
import { detectUploadFileKind, parseUploadFile } from "@/lib/finance-parse";

export async function createAddressAction(formData: FormData) {
  const context = await requireHousehold();
  if (formData.get("emailImportConsent") !== "on") redirect("/finance/upload?error=" + encodeURIComponent("메일 자료 처리 안내를 확인해 주세요."));
  try { await createImportAddress(context); }
  catch { redirect("/finance/upload?error=" + encodeURIComponent("주소를 발급하지 못했습니다. 본인 프로필 연결과 서비스 설정을 확인해 주세요.")); }
  revalidatePath("/finance/upload");
  revalidatePath("/finance/spending/settings");
}

export async function previewEmailAction(id: string, password: string) {
  const context = await requireHousehold();
  try {
    const file = await getOwnedEmailFile(context, id);
    const detected = await detectUploadFileKind(await file.arrayBuffer(), password);
    if (detected.kind !== "banksalad") throw new Error("뱅크샐러드 자료만 지원합니다.");
    const parsed = await parseUploadFile(detected.buffer, file.name, context.personId ?? undefined);
    return { summary: `거래 ${parsed.transactions.length}건 · 자산 ${parsed.assetItems.length}건 (${parsed.periodStart ?? "기간 미상"} ~ ${parsed.periodEnd ?? "기간 미상"})`, error: "" };
  } catch {
    return { summary: "", error: "자료를 열지 못했습니다. 압축 비밀번호와 파일 형식을 확인해 주세요. 만료된 자료는 다시 보내 주세요." };
  }
}
