"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq, gte, isNull, lte, max, min, notInArray, or, type SQL } from "drizzle-orm";
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

// 뱅크샐러드 거래가 아닌 별도 출처의 카테고리: 수동 입력과 서울페이는 뱅크샐러드
// 엑셀 재업로드로 지워지면 안 되는 별도 출처의 거래다.
const PRESERVED_CATEGORIES = ["직접 입력", "서울페이"];

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function uploadAction(formData: FormData) {
  const { householdId, personId: viewerPersonId } = await requireHousehold();
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

  // 공동 계좌/카드 내역 파일이면 새 거래의 사용 대상 기본값을 업로더 대신 '우리'로 한다(개인 용돈 한도 왜곡 방지).
  const defaultBeneficiary = formData.get("jointAccount") === "on" ? "joint" : personId;
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
    await handleSeoulPayUpload(db, householdId, personId, viewerPersonId, displayName, workBuffer, defaultBeneficiary);
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

  // 누적 업로드: 이 사람의 이전 뱅크샐러드 업로드가 이미 다룬 날짜는 기존 거래를 그대로 두고(교체하지 않음),
  // 처음 들어오는 날짜의 거래만 추가한다. 새 업로드 행을 넣기 전에 읽어야 이번 파일 기간이 섞이지 않는다.
  const coveredRanges = await loadCoveredRanges(db, householdId, personId);
  const newTransactions = parsed.transactions.filter((t) => !isCovered(t.txnDate, coveredRanges));
  const skippedCount = parsed.transactions.length - newTransactions.length;

  const context = await loadCategoryDerivationContext(db, householdId);

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

  const derived = deriveTransactionFields(newTransactions, context.mappingIndex, context.ruleIndex, context.keywordRules, {
    history: context.history,
    historyFirst: true,
  });
  const transactionsWithDerived = newTransactions.map((t, i) => ({ t, d: derived[i] }));
  const classifiedCount = transactionsWithDerived.filter(({ d }) => d.stdCategory !== null).length;

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
        beneficiary: defaultBeneficiary,
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
  const skippedSuffix = skippedCount > 0 ? `, 이미 올린 기간 거래 ${skippedCount}건은 기존 내역 유지` : "";
  const summary = `${displayName}님 자산 ${parsed.assetItems.length}건, 거래내역 ${newTransactions.length}건 추가${skippedSuffix}${exclusionSuffix}${classifiedSuffix}${pairSuffix}`;
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
  viewerPersonId: string | null,
  displayName: string,
  buffer: ArrayBuffer,
  defaultBeneficiary: string
): Promise<void> {
  let parsed: ParsedSeoulPay;
  try {
    parsed = await parseSeoulPayFile(buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일을 처리하는 중 오류가 발생했습니다.";
    redirect("/finance/upload?error=" + encodeURIComponent(message));
  }

  // 재업로드 멱등성: 조회기간(없으면 파싱된 날짜의 최소~최대)에 걸치는 이 사람의 기존 서울페이
  // 행을 지우고 다시 넣는다. 뱅크샐러드 거래는 category가 달라 이 delete에 걸리지 않는다.
  const allDates = [...parsed.payments.map((p) => p.txnDate), ...parsed.purchases.map((p) => p.txnDate)];
  const periodStart = parsed.periodStart ?? (allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : null);
  const periodEnd = parsed.periodEnd ?? (allDates.length ? allDates.reduce((a, b) => (a > b ? a : b)) : null);
  if (periodStart && periodEnd) {
    await rejectIfOthersPrivateInPeriod(db, householdId, personId, viewerPersonId, periodStart, periodEnd);
  }

  const uploadId = await getOrCreateActiveUploadId(db, householdId, personId);
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
        beneficiary: d.beneficiary ?? defaultBeneficiary,
        categoryLocked: d.categoryLocked,
        isPrivate: d.isPrivate,
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

type DateRange = { start: string; end: string };

/**
 * 이 사람의 뱅크샐러드 업로드들이 이미 다룬 날짜 구간. 업로드에 기록된 조회 기간을 쓰고, 기간이 없는
 * 옛 업로드는 그 업로드에 남은 뱅크샐러드 거래의 최소~최대 날짜로 대신한다(수동 입력·서울페이는 제외).
 */
async function loadCoveredRanges(db: AppDb, householdId: string, personId: string): Promise<DateRange[]> {
  const [uploadPeriods, txnSpans] = await Promise.all([
    db
      .select({ start: uploads.periodStart, end: uploads.periodEnd })
      .from(uploads)
      .where(and(eq(uploads.householdId, householdId), eq(uploads.personId, personId))),
    db
      .select({ start: min(transactions.txnDate), end: max(transactions.txnDate) })
      .from(transactions)
      .where(and(
        eq(transactions.householdId, householdId),
        eq(transactions.personId, personId),
        or(isNull(transactions.category), notInArray(transactions.category, PRESERVED_CATEGORIES))
      ))
      .groupBy(transactions.uploadId),
  ]);
  return [...uploadPeriods, ...txnSpans].filter((r): r is DateRange => r.start != null && r.end != null);
}

function isCovered(date: string, ranges: DateRange[]): boolean {
  return ranges.some((r) => r.start <= date && date <= r.end);
}

/**
 * 서울페이 파일을 다른 사람 몫으로 올리면 그 사람의 기간 서울페이 거래가 지워지고 교체된다. 그 기간에 그 사람이
 * "나만 보기"로 표시한 거래가 하나라도 있으면(조회자가 연결 전이어도) 아무것도 쓰기 전에 거부한다 -
 * 본인 몫 업로드는 막지 않는다. 기간 밖 비공개 행은 applyVoucherPurchaseExclusion이 여전히 건드릴 수 있다.
 */
async function rejectIfOthersPrivateInPeriod(
  db: AppDb,
  householdId: string,
  personId: string,
  viewerPersonId: string | null,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  if (personId === viewerPersonId) return;
  const [hit] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      eq(transactions.isPrivate, true),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd)
    ))
    .limit(1);
  if (hit) {
    redirect("/finance/upload?error=" + encodeURIComponent("다른 사람이 '나만 보기'로 표시한 거래가 있는 기간이에요. 그 사람이 직접 올려주세요."));
  }
}

// ── 다시 올릴 때 "직접 고친 분류"와 "나만 보기" 되살리기 ─────────────────────
// 기간 삭제 후 재삽입하면 사용자가 고친(잠긴) 분류와 나만 보기 표시가 사라지므로, 지우기 전에 기억해
// 두었다가 날짜·시간·타입·금액·메모가 똑같은 거래가 다시 들어오면 되살린다. 분류를 직접 고친(locked)
// 행은 카테고리·사용 대상·잠금까지, 나만 보기만 켠 행은 비공개 표시만 되살린다(잠그지 않는다 -
// 자동 분류 재계산은 계속 적용되어야 한다).
type LockedSnapshot = Map<string, { stdCategory: string | null; beneficiary: string; locked: boolean; isPrivate: boolean }[]>;

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
      categoryLocked: transactions.categoryLocked,
      isPrivate: transactions.isPrivate,
    })
    .from(transactions)
    .where(and(
      eq(transactions.householdId, householdId),
      eq(transactions.personId, personId),
      or(eq(transactions.categoryLocked, true), eq(transactions.isPrivate, true)),
      gte(transactions.txnDate, periodStart),
      lte(transactions.txnDate, periodEnd),
      categoryCondition
    ));
  const snapshot: LockedSnapshot = new Map();
  for (const row of rows) {
    const key = restoreKey(row);
    const list = snapshot.get(key) ?? [];
    list.push({ stdCategory: row.stdCategory, beneficiary: row.beneficiary, locked: row.categoryLocked, isPrivate: row.isPrivate });
    snapshot.set(key, list);
  }
  return snapshot;
}

function withRestoredLock(
  t: ParsedTransaction,
  d: DerivedResult,
  snapshot: LockedSnapshot
): DerivedResult & { beneficiary: string | null; categoryLocked: boolean; isPrivate: boolean } {
  const saved = snapshot.get(restoreKey(t))?.shift(); // 같은 키가 여러 건이면 하나씩 소진
  if (!saved) return { ...d, beneficiary: null, categoryLocked: false, isPrivate: false };
  if (!saved.locked) return { ...d, beneficiary: null, categoryLocked: false, isPrivate: saved.isPrivate };
  return {
    ...d,
    stdCategory: saved.stdCategory,
    included: saved.stdCategory !== "자산수정" && computeIncluded(t, isTransferCandidate(t), d.isInternalTransfer),
    beneficiary: saved.beneficiary,
    categoryLocked: true,
    isPrivate: saved.isPrivate,
  };
}
