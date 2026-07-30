"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetItems, people, transactions, uploads } from "@/lib/finance-db";
import { parseUploadFile, type ParsedUpload } from "@/lib/finance-parse";

const PERSON_IDS = ["husband", "wife"] as const;
type PersonId = (typeof PERSON_IDS)[number];

const PERSON_LABELS: Record<PersonId, string> = {
  husband: "남편",
  wife: "아내",
};

function isPersonId(value: string): value is PersonId {
  return (PERSON_IDS as readonly string[]).includes(value);
}

// neon-http는 요청 하나에 실어보낼 수 있는 페이로드 크기에 한도가 있어
// 거래 내역이 많은 파일은 한 번에 insert하면 "value too large to transmit" 오류가 난다.
const INSERT_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function uploadAction(formData: FormData) {
  const personId = String(formData.get("personId") ?? "");
  const file = formData.get("file");

  if (!isPersonId(personId)) {
    redirect("/finance/upload?error=" + encodeURIComponent("보유자를 선택해 주세요."));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect("/finance/upload?error=" + encodeURIComponent("엑셀 파일을 선택해 주세요."));
  }

  let parsed: ParsedUpload;
  try {
    const buffer = await file.arrayBuffer();
    parsed = await parseUploadFile(buffer, file.name);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  const db = getDb();
  const displayName = parsed.customerName ?? PERSON_LABELS[personId];
  const uploadId = randomUUID();

  await db
    .insert(people)
    .values({ id: personId, displayName })
    .onConflictDoUpdate({
      target: people.id,
      set: { displayName, updatedAt: new Date() },
    });
  await db
    .update(uploads)
    .set({ isActive: false })
    .where(and(eq(uploads.personId, personId), eq(uploads.isActive, true)));
  await db.insert(uploads).values({
    id: uploadId,
    personId,
    sourceFilename: file.name,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    isActive: true,
  });

  for (const rows of chunk(parsed.assetItems, INSERT_CHUNK_SIZE)) {
    await db.insert(assetItems).values(
      rows.map((item) => ({
        uploadId,
        personId,
        side: item.side,
        category: item.category,
        productName: item.productName,
        amount: item.amount.toString(),
        costBasis: item.costBasis == null ? null : item.costBasis.toString(),
        sector: item.sector,
      }))
    );
  }

  for (const rows of chunk(parsed.transactions, INSERT_CHUNK_SIZE)) {
    await db.insert(transactions).values(
      rows.map((t) => ({
        uploadId,
        personId,
        txnDate: t.txnDate,
        txnTime: t.txnTime,
        txnType: t.txnType,
        category: t.category,
        subcategory: t.subcategory,
        description: t.description,
        amount: t.amount.toString(),
        paymentMethod: t.paymentMethod,
      }))
    );
  }

  const summary = `${displayName}님 자산 ${parsed.assetItems.length}건, 거래내역 ${parsed.transactions.length}건 저장 완료`;
  redirect("/finance/upload?success=" + encodeURIComponent(summary));
}
