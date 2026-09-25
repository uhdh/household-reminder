import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/lib/db";
import { uploads } from "@/lib/finance-db";

// 수동 입력/서울페이처럼 실제 엑셀 없이 개별 거래를 저장해야 하는 경로가 함께 쓰는 자리표시자
// 업로드의 표시용 파일명. 실제 뱅크샐러드 엑셀을 업로드하면(app/finance/upload/actions.ts) 이
// 업로드에 붙은 거래를 새 업로드로 재연결하므로, 이 업로드 자체는 재사용 전까지만 거래를 담아두는
// 자리표시자다.
export const MANUAL_UPLOAD_FILENAME = "수동 입력";

/**
 * 이 사람의 현재 활성 업로드(uploads.is_active=true)가 있으면 그 id를 그대로 쓰고, 없으면
 * "수동 입력" 자리표시자 업로드를 찾아 재활성화하거나(없으면 새로 만들어) 그 id를 반환한다.
 * 수동 거래 입력과 서울페이 업로드가 공통으로 쓰는 헬퍼 - 둘 다 뱅크샐러드 엑셀 없이도 거래를
 * 저장해야 하고, 기존 활성 업로드(뱅크샐러드든 자리표시자든)를 절대 비활성화하지 않는다.
 */
export async function getOrCreateActiveUploadId(db: AppDb, householdId: string, personId: string): Promise<string> {
  const [activeUpload] = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.householdId, householdId), eq(uploads.personId, personId), eq(uploads.isActive, true)))
    .limit(1);
  if (activeUpload) return activeUpload.id;

  const [manualUpload] = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.householdId, householdId), eq(uploads.personId, personId), eq(uploads.sourceFilename, MANUAL_UPLOAD_FILENAME)))
    .limit(1);

  if (manualUpload) {
    await db.update(uploads).set({ isActive: true }).where(eq(uploads.id, manualUpload.id));
    return manualUpload.id;
  }

  const uploadId = randomUUID();
  await db.insert(uploads).values({ id: uploadId, householdId, personId, sourceFilename: MANUAL_UPLOAD_FILENAME, isActive: true });
  return uploadId;
}
