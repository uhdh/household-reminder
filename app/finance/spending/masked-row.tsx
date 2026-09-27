import { PRIVATE_LABEL, type MaskedTxn } from "@/lib/spending-private";
import { beneficiaryLabel } from "@/lib/spending-queries";

/** 파트너의 비공개 거래: 날짜와 "비공개 거래"만 보이고 금액·내용·분류·컨트롤은 없다. */
export function MaskedTransactionRow({ t, displayNameByPerson }: { t: MaskedTxn; displayNameByPerson: Map<string, string> }) {
  return (
    <tr className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 border-b border-stroke-neutral-muted/60 px-4 py-3 last:border-0 md:table-row md:p-0 md:[&>td]:py-3">
      <td className="col-start-1 row-span-2 row-start-1 self-start md:table-cell md:px-2 md:text-center" />
      <td className="col-start-2 row-start-2 truncate text-[12px] text-ink-muted md:table-cell md:whitespace-nowrap md:px-3 md:text-[14px]">
        {t.txnDate.slice(5)}
      </td>
      <td colSpan={3} className="col-start-2 row-start-1 min-w-0 md:table-cell md:px-3">
        <span className="font-semibold text-ink-muted">{PRIVATE_LABEL}</span>
        <span className="ml-2 text-[12px] text-ink-muted/70">{beneficiaryLabel(t.personId, displayNameByPerson)}님이 결제</span>
      </td>
      <td className="col-start-3 row-start-1 text-right text-[13px] text-ink-muted md:table-cell md:whitespace-nowrap md:px-3">금액 비공개</td>
      <td className="col-start-3 row-start-2 md:table-cell" />
    </tr>
  );
}
