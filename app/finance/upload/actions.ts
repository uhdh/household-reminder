"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gte, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { assetItems, categoryKeywordRules, categoryMappings, categoryRules, transactions, uploads } from "@/lib/finance-db";
import { parseUploadFile, type ParsedUpload } from "@/lib/finance-parse";
import { buildMappingIndex, buildRuleIndex, deriveTransactionFields } from "@/lib/spending-derive";
import { requireHousehold } from "@/lib/require-household";
import { getHouseholdPeople, isPersonId } from "@/lib/spending-queries";

// neon-http는 요청 하나에 실어보낼 수 있는 페이로드 크기에 한도가 있어
// 거래 내역이 많은 파일은 한 번에 insert하면 "value too large to transmit" 오류가 난다.
const INSERT_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function uploadAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const personId = String(formData.get("personId") ?? "");
  const file = formData.get("file");

  const householdPeople = await getHouseholdPeople(householdId);
  const knownIds = householdPeople.map((p) => p.id);
  if (!isPersonId(personId, knownIds)) {
    redirect("/finance/upload?error=" + encodeURIComponent("보유자를 선택해 주세요."));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect("/finance/upload?error=" + encodeURIComponent("엑셀 파일을 선택해 주세요."));
  }

  let parsed: ParsedUpload;
  try {
    const buffer = await file.arrayBuffer();
    parsed = await parseUploadFile(buffer, file.name, personId);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  const db = getDb();
  // 표시 이름은 온보딩/초대 수락 때 그 사람이 직접 정한 것을 그대로 쓴다(여기서 덮어쓰지 않는다).
  const displayName = householdPeople.find((p) => p.id === personId)?.displayName ?? personId;
  const uploadId = randomUUID();

  await db
    .update(uploads)
    .set({ isActive: false })
    .where(and(eq(uploads.householdId, householdId), eq(uploads.personId, personId), eq(uploads.isActive, true)));
  await db.insert(uploads).values({
    id: uploadId,
    householdId,
    personId,
    sourceFilename: file.name,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    isActive: true,
  });

  if (parsed.periodStart && parsed.periodEnd) {
    await db.delete(transactions).where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      gte(transactions.txnDate, parsed.periodStart),
      lte(transactions.txnDate, parsed.periodEnd),
      or(isNull(transactions.category), ne(transactions.category, "직접 입력"))
    ));
  }

  await db
    .update(transactions)
    .set({ uploadId })
    .where(and(eq(transactions.householdId, householdId), eq(transactions.personId, personId), eq(transactions.category, "직접 입력"), eq(transactions.subcategory, "직접 입력")));

  for (const rows of chunk(parsed.assetItems, INSERT_CHUNK_SIZE)) {
    await db.insert(assetItems).values(
      rows.map((item) => ({
        householdId,
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

  const [mappingRows, ruleRows, keywordRuleRows] = await Promise.all([
    db.select().from(categoryMappings).where(eq(categoryMappings.householdId, householdId)),
    db.select().from(categoryRules).where(eq(categoryRules.householdId, householdId)),
    db.select().from(categoryKeywordRules).where(eq(categoryKeywordRules.householdId, householdId)),
  ]);
  const mappingIndex = buildMappingIndex(mappingRows);
  const ruleIndex = buildRuleIndex(ruleRows);
  const derived = deriveTransactionFields(parsed.transactions, mappingIndex, ruleIndex, keywordRuleRows);
  const transactionsWithDerived = parsed.transactions.map((t, i) => ({ t, d: derived[i] }));

  for (const rows of chunk(transactionsWithDerived, INSERT_CHUNK_SIZE)) {
    await db.insert(transactions).values(
      rows.map(({ t, d }) => ({
        householdId,
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
        stdCategory: d.stdCategory,
        included: d.included,
        isInternalTransfer: d.isInternalTransfer,
        beneficiary: personId,
      }))
    );
  }

  const summary = `${displayName}님 자산 ${parsed.assetItems.length}건, 거래내역 ${parsed.transactions.length}건 저장 완료`;
  redirect("/finance/upload?success=" + encodeURIComponent(summary));
}
