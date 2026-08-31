"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { deleteTransactionsAction } from "./actions";

const FORM_ID = "transaction-bulk-delete";
const SelectionContext = createContext<{
  transactionIds: string[];
  selected: Set<string>;
  setSelected: (selected: Set<string>) => void;
} | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Transaction selection must be inside TransactionBulkDeleteForm");
  return value;
}

export function TransactionBulkDeleteForm({
  transactionIds,
  returnTo,
  children,
}: {
  transactionIds: string[];
  returnTo: string;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  return (
    <SelectionContext value={{ transactionIds, selected, setSelected }}>
      <div className="mb-2 flex min-h-9 items-center justify-end">
        <form
          id={FORM_ID}
          action={deleteTransactionsAction}
          onSubmit={(event) => {
            if (selected.size === 0 || !window.confirm(`선택한 ${selected.size}건을 삭제할까요? 삭제한 거래는 되돌릴 수 없습니다.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            disabled={selected.size === 0}
            className="rounded-r2 px-3 py-1.5 text-[12px] font-semibold text-fg-critical hover:bg-bg-critical-weak disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-critical"
          >
            선택 삭제 ({selected.size})
          </button>
        </form>
      </div>
      {children}
    </SelectionContext>
  );
}

export function SelectAllTransactions() {
  const { transactionIds, selected, setSelected } = useSelection();
  const allSelected = transactionIds.length > 0 && selected.size === transactionIds.length;

  return (
    <input
      type="checkbox"
      aria-label="현재 목록 전체 선택"
      checked={allSelected}
      disabled={transactionIds.length === 0}
      onChange={() => setSelected(allSelected ? new Set() : new Set(transactionIds))}
      className="size-4 accent-fg-brand"
    />
  );
}

export function TransactionCheckbox({ transactionId }: { transactionId: string }) {
  const { selected, setSelected } = useSelection();

  return (
    <input
      form={FORM_ID}
      type="checkbox"
      name="txnId"
      value={transactionId}
      aria-label="거래 선택"
      checked={selected.has(transactionId)}
      onChange={(event) => {
        const next = new Set(selected);
        if (event.target.checked) next.add(transactionId);
        else next.delete(transactionId);
        setSelected(next);
      }}
      className="size-4 accent-fg-brand"
    />
  );
}
