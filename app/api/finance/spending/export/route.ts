import { NextRequest } from "next/server";
import {
  flowLabel,
  getActiveTransactions,
  isPersonId,
  latestMonth,
  monthKeyOf,
  PERSON_LABELS,
  MONTH_RE,
  type PersonId,
  type Txn,
} from "@/lib/spending-queries";
import { exportTransactionsToExcel } from "@/lib/spending-export";
import { isFinanceDemoMode } from "@/lib/finance-viewer-server";
import { FinanceAuthError, requireFinanceUser } from "@/lib/require-finance-user";

export const dynamic = "force-dynamic";

const sampleTransactions: Txn[] = [
  { id: "demo-1", uploadId: "demo", personId: "husband", txnDate: "2026-07-31", txnTime: "09:00:00", txnType: "수입", category: "급여", subcategory: "미분류", description: "7월 급여", amount: "5772867.00", paymentMethod: "급여통장", stdCategory: "월급", included: true, isInternalTransfer: false, beneficiary: "husband" },
  { id: "demo-2", uploadId: "demo", personId: "husband", txnDate: "2026-07-31", txnTime: "14:20:00", txnType: "지출", category: "식비", subcategory: "마트", description: "주말 장보기", amount: "-83400.00", paymentMethod: "체크카드", stdCategory: "식비", included: true, isInternalTransfer: false, beneficiary: "joint" },
  { id: "demo-3", uploadId: "demo", personId: "wife", txnDate: "2026-07-30", txnTime: "18:30:00", txnType: "지출", category: "생활", subcategory: "편의점", description: "생활용품", amount: "-52900.00", paymentMethod: "신용카드", stdCategory: "생필품", included: true, isInternalTransfer: false, beneficiary: "wife" },
  { id: "demo-4", uploadId: "demo", personId: "wife", txnDate: "2026-07-29", txnTime: "11:00:00", txnType: "지출", category: "주거/통신", subcategory: "관리비", description: "관리비", amount: "-284600.00", paymentMethod: "자동이체", stdCategory: "주거/통신", included: true, isInternalTransfer: false, beneficiary: "joint" },
  { id: "demo-5", uploadId: "demo", personId: "husband", txnDate: "2026-07-28", txnTime: "08:15:00", txnType: "지출", category: "교통", subcategory: "대중교통", description: "대중교통", amount: "-18500.00", paymentMethod: "체크카드", stdCategory: "교통", included: true, isInternalTransfer: false, beneficiary: "husband" },
];

export async function GET(request: NextRequest) {
  try {
    await requireFinanceUser();
  } catch (error) {
    if (error instanceof FinanceAuthError) return new Response(null, { status: 401 });
    throw error;
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");
  const person = searchParams.get("person");
  const flow = searchParams.get("flow");
  const beneficiary = searchParams.get("beneficiary");
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const personFilter: "all" | PersonId = isPersonId(person ?? undefined) ? (person as PersonId) : "all";
  const flowFilter = flow === "income" || flow === "expense" ? flow : "all";
  const beneficiaryFilter = beneficiary === "husband" || beneficiary === "wife" || beneficiary === "joint" ? beneficiary : "all";
  const categoryFilter = category && category !== "all" ? category : "all";
  const query = q?.trim().slice(0, 50) ?? "";

  let allTx: Txn[];
  let displayNameByPerson: Map<string, string>;

  if (await isFinanceDemoMode()) {
    allTx = sampleTransactions;
    displayNameByPerson = new Map([
      ["husband", "남편"],
      ["wife", "아내"],
    ]);
  } else {
    const result = await getActiveTransactions();
    allTx = result.transactions;
    displayNameByPerson = result.displayNameByPerson;
  }

  const visibleTx = allTx.filter((t) => t.included || t.stdCategory === "자산수정");
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : latestMonth(visibleTx);

  const monthTx = visibleTx.filter((t) => monthKeyOf(t.txnDate) === month);
  const filtered = (personFilter === "all" ? monthTx : monthTx.filter((t) => t.personId === personFilter))
    .filter((t) => flowFilter === "all" || (flowFilter === "income" ? flowLabel(t) === "입금" : flowLabel(t) === "지출"))
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

  const personSuffix = personFilter === "all" ? "" : `_${PERSON_LABELS[personFilter] ?? personFilter}`;
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
