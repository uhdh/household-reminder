"use client";

import { deleteTransactionAction } from "./actions";

export function TransactionDeleteButton({ txnId, returnTo }: { txnId: string; returnTo: string }) {
  return (
    <form
      action={deleteTransactionAction}
      onSubmit={(event) => {
        if (!window.confirm("이 거래를 삭제할까요? 삭제한 거래는 되돌릴 수 없습니다.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="inline-flex min-h-9 items-center rounded-r2 px-3 py-1.5 text-[11px] font-semibold text-fg-critical hover:bg-bg-critical-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-critical"
      >
        삭제
      </button>
    </form>
  );
}
