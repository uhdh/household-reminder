"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gte, isNull, lte, notInArray, or, type SQL } from "drizzle-orm";
import { getDb, type AppDb } from "@/lib/db";
import { assetItems, transactions, uploads } from "@/lib/finance-db";
import {
  detectUploadFileKind,
  parseSeoulPayFile,
  parseUploadFile,
  type ParsedSeoulPay,
  type ParsedTransaction,
  type ParsedUpload,
} from "@/lib/finance-parse";
import { computeIncluded, deriveTransactionFields, isTransferCandidate, type DerivedResult } from "@/lib/spending-derive";
import { requireHousehold } from "@/lib/require-household";
import { getHouseholdPeople, isPersonId } from "@/lib/spending-queries";
import { getOrCreateActiveUploadId } from "@/lib/manual-upload";
import { applyVoucherPurchaseExclusion } from "@/lib/voucher-exclusion";
import { loadCategoryDerivationContext } from "@/lib/rederive-transactions";
import { applyHouseholdTransferPairs } from "@/lib/household-transfer-pairs";

// neon-http는 요청 하나에 실어보낼 수 있는 페이로드 크기에 한도가 있어
// 거래 내역이 많은 파일은 한 번에 insert하면 "value too large to transmit" 오류가 난다.
const INSERT_CHUNK_SIZE = 200;

// 재업로드 기간 삭제·재연결에서 항상 보존해야 하는 카테고리: 수동 입력과 서울페이는 뱅크샐러드
// 엑셀 재업로드로 지워지면 안 되는 별도 출처의 거래다.
const PRESERVED_CATEGORIES = ["직접 입력", "서울페이"];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function uploadAction(formData: FormData) {
  const { householdId } = await requireHousehold();
  const personId = String(formData.get("personId") ?? "");
  const file = formData.get("file");
  // 비어있으면 undefined로 - decryptWorkbookBuffer는 빈 문자열도 "비밀번호 없음"으로 취급해야 한다.
  const filePassword = String(formData.get("filePassword") ?? "").trim() || undefined;

  const householdPeople = await getHouseholdPeople(householdId);
  const knownIds = householdPeople.map((p) => p.id);
  if (!isPersonId(personId, knownIds)) {
    redirect("/finance/upload?error=" + encodeURIComponent("보유자를 선택해 주세요."));
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect("/finance/upload?error=" + encodeURIComponent("엑셀 파일을 선택해 주세요."));
  }

  // 표시 이름은 온보딩/초대 수락 때 그 사람이 직접 정한 것을 그대로 쓴다(여기서 덮어쓰지 않는다).
  const displayName = householdPeople.find((p) => p.id === personId)?.displayName ?? personId;
  const db = getDb();

  let kind: "seoulpay" | "banksalad";
  let workBuffer: ArrayBuffer;
  try {
    const buffer = await file.arrayBuffer();
    const detected = await detectUploadFileKind(buffer, filePassword);
    kind = detected.kind;
    workBuffer = detected.buffer;
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  if (kind === "seoulpay") {
    await handleSeoulPayUpload(db, householdId, personId, displayName, workBuffer);
    return;
  }

  let parsed: ParsedUpload;
  try {
    parsed = await parseUploadFile(workBuffer, file.name, personId);
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  const uploadId = randomUUID();

  // 분류 이력과 "직접 고친 분류"는 기존 기간 거래를 지우기 전에 읽어 둔다(다시 올리는 기간의 이력도 쓰기 위해).
  const context = await loadCategoryDerivationContext(db, householdId);
  const lockedSnapshot: LockedSnapshot =
    parsed.periodStart && parsed.periodEnd
      ? await snapshotLockedRows(db, householdId, personId, parsed.periodStart, parsed.periodEnd,
          or(isNull(transactions.category), notInArray(transactions.category, PRESERVED_CATEGORIES)))
      : new Map();

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
      or(isNull(transactions.category), notInArray(transactions.category, PRESERVED_CATEGORIES))
    ));
  }

  await db
    .update(transactions)
    .set({ uploadId })
    .where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      or(
        and(eq(transactions.category, "직접 입력"), eq(transactions.subcategory, "직접 입력")),
        eq(transactions.category, "서울페이")
      )
    ));

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

  const derived = deriveTransactionFields(parsed.transactions, context.mappingIndex, context.ruleIndex, context.keywordRules, {
    history: context.history,
    historyFirst: true,
  });
  const transactionsWithDerived = parsed.transactions.map((t, i) => ({ t, d: withRestoredLock(t, derived[i], lockedSnapshot) }));
  const classifiedCount = transactionsWithDerived.filter(({ d }) => d.stdCategory !== null).length;
  const restoredCount = transactionsWithDerived.filter(({ d }) => d.categoryLocked).length;

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
        beneficiary: d.beneficiary ?? personId,
        categoryLocked: d.categoryLocked,
      }))
    );
  }

  // 뱅크샐러드 재업로드로 새 카드결제 출금 거래가 다시 들어왔을 수 있으니, 이미 서울페이 구매로
  // 잠긴 적 없는 것들에 대해 매칭을 다시 시도한다(applyVoucherPurchaseExclusion은 멱등).
  const { excludedCount } = await applyVoucherPurchaseExclusion(db, householdId, personId);
  // 가구 단위 계좌이동 짝짓기(배우자 간 이체 등)는 rederive 성격의 std_category/included 재계산이
  // 끝난 뒤에 실행해야 한다(household-transfer-pairs.ts 순서 계약 참고).
  const { pairs } = await applyHouseholdTransferPairs(db, householdId);
  const exclusionSuffix = excludedCount > 0 ? `, 서울페이 상품권 구매 출금 ${excludedCount}건 집계 제외` : "";
  const classifiedSuffix = classifiedCount > 0 ? `, 자동 분류 ${classifiedCount}건` : "";
  const pairSuffix = pairs > 0 ? `, 내 계좌 이동 ${pairs}쌍 제외` : "";
  const restoredSuffix = restoredCount > 0 ? `, 직접 고친 분류 ${restoredCount}건 유지` : "";
  const summary = `${displayName}님 자산 ${parsed.assetItems.length}건, 거래내역 ${parsed.transactions.length}건 저장 완료${exclusionSuffix}${classifiedSuffix}${restoredSuffix}${pairSuffix}`;
  redirect("/finance/upload?success=" + encodeURIComponent(summary));
}

/**
 * 서울페이 이용내역 업로드 경로. 뱅크샐러드 업로드와 달리 새 활성 업로드를 만들며 기존 걸 비활성화하는
 * 대신, 이 사람의 현재 활성 업로드(없으면 수동 입력과 같은 자리표시자)에 그대로 붙인다 - asset_items도
 * 건드리지 않는다.
 */
async function handleSeoulPayUpload(
  db: AppDb,
  householdId: string,
  personId: string,
  displayName: string,
  buffer: ArrayBuffer
): Promise<void> {
  let parsed: ParsedSeoulPay;
  try {
    parsed = await parseSeoulPayFile(buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  const uploadId = await getOrCreateActiveUploadId(db, householdId, personId);

  // 재업로드 멱등성: 조회기간(없으면 파싱된 날짜의 최소~최대)에 걸치는 이 사람의 기존 서울페이
  // 행을 지우고 다시 넣는다. 뱅크샐러드 거래는 category가 달라 이 delete에 걸리지 않는다.
  const allDates = [...parsed.payments.map((p) => p.txnDate), ...parsed.purchases.map((p) => p.txnDate)];
  const periodStart = parsed.periodStart ?? (allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null);
  const periodEnd = parsed.periodEnd ?? (allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null);
  const context = await loadCategoryDerivationContext(db, householdId);
  const lockedSnapshot: LockedSnapshot =
    periodStart && periodEnd
      ? await snapshotLockedRows(db, householdId, personId, periodStart, periodEnd,
          and(eq(transactions.category, "서울페이"), eq(transactions.subcategory, "결제")))
      : new Map();

  if (periodStart && periodEnd) {
    await db.delete(transactions).where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      eq(transactions.category, "서울페이"),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd)
    ));
  }

  // 결제 내역: 기존 뱅크샐러드 업로드와 같은 mapStdCategory/computeIncluded 경로를 그대로 태운다.
  const paymentPseudos: ParsedTransaction[] = parsed.payments.map((p) => ({
    txnDate: p.txnDate,
    txnTime: p.txnTime,
    txnType: "지출",
    category: "서울페이",
    subcategory: "결제",
    description: p.merchant,
    amount: p.amount,
    paymentMethod: "서울페이",
  }));
  const derived = deriveTransactionFields(paymentPseudos, context.mappingIndex, context.ruleIndex, context.keywordRules, {
    history: context.history,
    historyFirst: true,
  });
  const paymentRows = paymentPseudos.map((t, i) => ({ t, d: withRestoredLock(t, derived[i], lockedSnapshot) }));
  const classifiedCount = paymentRows.filter(({ d }) => d.stdCategory !== null).length;

  for (const rows of chunk(paymentRows, INSERT_CHUNK_SIZE)) {
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
        beneficiary: d.beneficiary ?? personId,
        categoryLocked: d.categoryLocked,
      }))
    );
  }

  // 구매 내역: 지원금(B)은 버리고, 사용자가 실제로 지출한 A만 기록용(자산수정/집계제외/잠금)으로 남긴다.
  for (const rows of chunk(parsed.purchases, INSERT_CHUNK_SIZE)) {
    await db.insert(transactions).values(
      rows.map((p) => ({
        householdId,
        uploadId,
        personId,
        txnDate: p.txnDate,
        txnTime: p.txnTime,
        txnType: "이체" as const,
        category: "서울페이",
        subcategory: "구매",
        description: `${p.productName} 구매`,
        amount: (-p.amountA).toString(),
        paymentMethod: "서울페이",
        stdCategory: "자산수정",
        included: false,
        isInternalTransfer: false,
        beneficiary: personId,
        categoryLocked: true,
      }))
    );
  }

  const { excludedCount } = await applyVoucherPurchaseExclusion(db, householdId, personId);
  const { pairs } = await applyHouseholdTransferPairs(db, householdId);
  const exclusionSuffix = excludedCount > 0 ? `, 상품권 구매 출금 ${excludedCount}건 집계 제외` : "";
  const classifiedSuffix = classifiedCount > 0 ? `, 자동 분류 ${classifiedCount}건` : "";
  const pairSuffix = pairs > 0 ? `, 내 계좌 이동 ${pairs}쌍 제외` : "";
  const summary = `${displayName}님 서울페이 결제 ${parsed.payments.length}건 추가${exclusionSuffix}${classifiedSuffix}${pairSuffix}`;
  redirect("/finance/upload?success=" + encodeURIComponent(summary));
}

// ── 다시 올릴 때 "직접 고친 분류" 되살리기 ──────────────────────────────
// 기간 삭제 후 재삽입하면 사용자가 고친(잠긴) 분류가 사라지므로, 지우기 전에 기억해 두었다가 날짜·시간·
// 타입·금액·메모가 똑같은 거래가 다시 들어오면 그 카테고리·사용 대상·잠금을 그대로 되살린다.
type LockedSnapshot = Map<string, { stdCategory: string | null; beneficiary: string }[]>;

function restoreKey(t: { txnDate: string; txnTime: string | null; txnType: string; amount: number | string; description: string | null }): string {
  return `${t.txnDate}|${(t.txnTime ?? "").slice(0, 8)}|${t.txnType}|${Number(t.amount)}|${(t.description ?? "").trim()}`;
}

async function snapshotLockedRows(
  db: AppDb,
  householdId: string,
  personId: string,
  periodStart: string,
  periodEnd: string,
  categoryCondition: SQL | undefined
): Promise<LockedSnapshot> {
  const rows = await db
    .select({
      txnDate: transactions.txnDate,
      txnTime: transactions.txnTime,
      txnType: transactions.txnType,
      amount: transactions.amount,
      description: transactions.description,
      stdCategory: transactions.stdCategory,
      beneficiary: transactions.beneficiary,
    })
    .from(transactions)
    .where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      eq(transactions.categoryLocked, true),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd),
      categoryCondition
    ));
  const snapshot: LockedSnapshot = new Map();
  for (const row of rows) {
    const key = restoreKey(row);
    const list = snapshot.get(key) ?? [];
    list.push({ stdCategory: row.stdCategory, beneficiary: row.beneficiary });
    snapshot.set(key, list);
  }
  return snapshot;
}

function withRestoredLock(
  t: ParsedTransaction,
  d: DerivedResult,
  snapshot: LockedSnapshot
): DerivedResult & { beneficiary: string | null; categoryLocked: boolean } {
  const saved = snapshot.get(restoreKey(t))?.shift(); // 같은 키가 여러 건이면 하나씩 소진
  if (!saved) return { ...d, beneficiary: null, categoryLocked: false };
  return {
    ...d,
    stdCategory: saved.stdCategory,
    included: saved.stdCategory !== "자산수정" && computeIncluded(t, isTransferCandidate(t), d.isInternalTransfer),
    beneficiary: saved.beneficiary,
    categoryLocked: true,
  };
}
