import { eq, or, type SQL } from "drizzle-orm";
import { transactions } from "@/lib/finance-db";
import type { Txn } from "@/lib/spending-queries";

// "나만 보기" 마스킹의 단일 출처. 조회 함수(spending-queries.ts)가 이 함수를 거치므로 화면·내보내기가
// 같은 규칙을 쓴다. 마스킹 행은 amount/stdCategory/included/txnType/txnDate/beneficiary를 서버 집계용으로
// 유지하지만, 화면은 masked 행의 금액을 절대 렌더링하지 않는다(렌더링하는 곳마다 masked를 확인할 것).

export const PRIVATE_LABEL = "비공개 거래";

export type MaskedTxn = Txn & { masked: boolean };

/** 이 조회자에게 이 행의 내용을 숨겨야 하는가: 비공개이고 내 것이 아니거나, 조회자를 모를 때(fail-closed). */
export function isMaskedFor(row: { isPrivate: boolean; personId: string }, viewerPersonId: string | null | undefined): boolean {
  return row.isPrivate && (!viewerPersonId || row.personId !== viewerPersonId);
}

export function maskPrivateRows(rows: Txn[], viewerPersonId: string | null | undefined): MaskedTxn[] {
  return rows.map((row) =>
    isMaskedFor(row, viewerPersonId)
      ? { ...row, description: null, category: null, subcategory: null, paymentMethod: null, masked: true }
      : { ...row, masked: false }
  );
}

/**
 * SQL 조건: 이 조회자가 내용을 볼 수 있는(=바꿀 수 있는) 행 - 공개이거나 내가 결제한 행.
 * 수정·삭제 액션의 WHERE에 쓴다. 조회자를 모르면 공개 행만 해당한다(fail-closed).
 */
export function visibleToViewer(viewerPersonId: string | null | undefined): SQL {
  return viewerPersonId
    ? (or(eq(transactions.isPrivate, false), eq(transactions.personId, viewerPersonId)) as SQL)
    : eq(transactions.isPrivate, false);
}

/** 세부 내역·내보내기 공통 카테고리 필터. 마스킹 행은 stdCategory로 내용을 유추할 수 없게 조건이 있으면 제외한다. */
export function rowMatchesCategory(t: MaskedTxn, category: string): boolean {
  if (category === "all") return true;
  if (t.masked) return false;
  return category === "미분류" ? !t.stdCategory : t.stdCategory === category;
}

/** 세부 내역·내보내기 공통 검색 필터. 마스킹 행은 검색어가 있으면 제외한다. */
export function rowMatchesQuery(t: MaskedTxn, query: string): boolean {
  if (!query) return true;
  if (t.masked) return false;
  const haystack = [t.description, t.paymentMethod, t.category, t.subcategory, t.stdCategory].filter(Boolean).join(" ").toLocaleLowerCase("ko");
  return haystack.includes(query.toLocaleLowerCase("ko"));
}
