import { NextRequest } from "next/server";
import {
  flowLabel,
  getActiveTransactions,
  isBeneficiary,
  isExcludedFromTotals,
  isPersonId,
  latestMonth,
  monthKeyOf,
  MONTH_RE,
  type PersonId,
} from "@/lib/spending-queries";
import { exportTransactionsToExcel } from "@/lib/spending-export";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";
import { isVoucherPurchaseRecord } from "@/lib/voucher-exclusion";
import { NoHouseholdError, requireHousehold } from "@/lib/require-household";
import { DEMO_HOUSEHOLD_ID } from "@/lib/demo-household";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 데모 모드(비로그인)는 가구가 없으므로 requireHousehold보다 먼저 확인한다 - 샘플 가구(DEMO_HOUSEHOLD_ID)를
  // 다른 가구와 똑같은 경로(getActiveTransactions)로 내보낸다.
  const isDemo = await isFinanceDemoMode();
  let householdId = DEMO_HOUSEHOLD_ID;
  if (!isDemo) {
    try {
      householdId = (await requireHousehold()).householdId;
    } catch (error) {
      if (error instanceof NoHouseholdError) return new Response(null, { status: 401 });
      throw error;
    }
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const person = searchParams.get("person");
  const flow = searchParams.get("flow");
  const beneficiary = searchParams.get("beneficiary");
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const flowFilter = flow === "income" || flow === "expense" || flow === "excluded" ? flow : "all";
  const categoryFilter = category && category !== "all" ? category : "all";
  const query = q?.trim().slice(0, 50) ?? "";

  const { transactions: allTx, displayNameByPerson } = await getActiveTransactions(householdId);
  const personIds = Array.from(displayNameByPerson.keys());
  const personFilter: "all" | PersonId = isPersonId(person ?? undefined, personIds) ? (person as PersonId) : "all";
  const beneficiaryFilter = isBeneficiary(beneficiary, personIds) ? beneficiary! : "all";

  // 세부 내역 화면과 같은 기준 목록 전환: "집계 제외" 필터는 included=false인 행(장부용 서울페이
  // 구매 행 제외)을, 그 외에는 기존과 같이 included이거나 자산수정인 행을 기준으로 한다.
  const visibleTx =
    flowFilter === "excluded"
      ? allTx.filter((t) => isExcludedFromTotals(t) && !isVoucherPurchaseRecord(t))
      : allTx.filter((t) => (t.included || t.stdCategory === "자산수정") && !isVoucherPurchaseRecord(t));
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(visibleTx);

  const monthTx = visibleTx.filter((t) => monthKeyOf(t.txnDate) === month);
  const filtered = (personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter))
    .filter((t) => flowFilter === "all" || flowFilter === "excluded" || (flowFilter === "income" ? flowLabel(t) === "입금" : flowLabel(t) === "지출"))
    .filter((t) => beneficiaryFilter === "all" || t.beneficiary === beneficiaryFilter)
    .filter((t) => categoryFilter === "all" || t.stdCategory === categoryFilter)
    .filter((t) => {
      if (!query) return true;
      const haystack = [t.description, t.paymentMethod, t.category, t.subcategory, t.stdCategory]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("ko");
      return haystack.includes(query.toLocaleLowerCase("ko"));
    })
    .sort((a, b) => (a.txnDate === b.txnDate ? (b.txnTime ?? "").localeCompare(a.txnTime ?? "") : b.txnDate.localeCompare(a.txnDate)));

  const buffer = await exportTransactionsToExcel(filtered, displayNameByPerson);

  const personSuffix = personFilter === "all" ? "" : `_${displayNameByPerson.get(personFilter) ?? personFilter}`;
  const filename = `가계부_세부내역_${month}${personSuffix}.xlsx`;
  const asciiFilename = `spending_${month}${personFilter === "all" ? "" : `_${personFilter}`}.xlsx`;
  const utf8Filename = encodeURIComponent(filename);

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
