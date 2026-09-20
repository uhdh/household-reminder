import { PERSON_IDS, PERSON_LABELS, type PersonId } from "@/lib/spending-queries";
import { addManualTransactionAction } from "./actions";

export function ManualTransactionForm({
  month,
  defaultPerson,
  categories,
  returnTo,
}: {
  month: string;
  defaultPerson: PersonId;
  categories: { name: string; kind: string }[];
  returnTo: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = today.startsWith(month) ? today : `${month}-01`;

  return (
    <details className="seed-card mb-3 shadow-none">
      <summary className="cursor-pointer list-none px-5 py-4 text-[14px] font-extrabold text-fg-brand">
        + 세부 내역 추가
      </summary>
      <form action={addManualTransactionAction} className="grid gap-3 border-t border-stroke-neutral-muted p-5 sm:grid-cols-2 lg:grid-cols-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <label className="text-[12px] font-medium text-ink-muted">
          날짜
          <input name="txnDate" type="date" required defaultValue={defaultDate} className="seed-input mt-1.5 text-[14px]" />
        </label>
        <label className="text-[12px] font-medium text-ink-muted">
          결제한 사람
          <select name="personId" defaultValue={defaultPerson} className="seed-input mt-1.5 text-[14px]">
            {PERSON_IDS.map((person) => <option key={person} value={person}>{PERSON_LABELS[person]}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-ink-muted">
          사용 대상
          <select name="beneficiary" defaultValue={defaultPerson} className="seed-input mt-1.5 text-[14px]">
            <option value="husband">남편</option>
            <option value="wife">아내</option>
            <option value="joint">우리</option>
          </select>
        </label>
        <label className="text-[12px] font-medium text-ink-muted">
          카테고리
          <select name="stdCategory" required className="seed-input mt-1.5 text-[14px]">
            <option value="">선택</option>
            {categories.map((category) => <option key={category.name} value={category.name}>{category.name}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-ink-muted">
          금액
          <input name="amount" type="number" min="1" step="1" required placeholder="0" className="mt-1 min-h-10 w-full rounded-r2 border border-hairline bg-card px-3 text-right text-[13px] text-ink" />
        </label>
        <label className="text-[12px] font-medium text-ink-muted">
          결제수단
          <input name="paymentMethod" placeholder="예: 신용카드" className="seed-input mt-1.5 text-[14px]" />
        </label>
        <label className="text-[12px] font-medium text-ink-muted sm:col-span-2">
          메모
          <input name="description" maxLength={100} placeholder="지출 내용을 입력하세요" className="seed-input mt-1.5 text-[14px]" />
        </label>
        <div className="flex justify-end sm:col-span-2 lg:col-span-4">
          <button type="submit" className="seed-primary-button px-5">저장</button>
        </div>
      </form>
    </details>
  );
}
