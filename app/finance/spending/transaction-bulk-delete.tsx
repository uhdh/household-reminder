"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { UNMAPPED_VALUE } from "./category-select";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { deleteTransactionsAction, updateTransactionsCategoryAction } from "./actions";

const FORM_ID = "transaction-bulk-delete";
const SelectionContext = createContext<{
  transactionIds: string[];
  selected: Set<string>;
  setSelected: (selected: Set<string>) => void;
  returnTo: string;
} | null>(null);

function useSelection() {
  const value = useContext(SelectionContext);
  if (!value) throw new Error("Transaction selection must be inside TransactionBulkDeleteForm");
  return value;
}

export function TransactionBulkDeleteForm({
  transactionIds,
  returnTo,
  categoryOptions,
  frequentCategories,
  children,
}: {
  transactionIds: string[];
  returnTo: string;
  categoryOptions?: CategoryOption[];
  frequentCategories?: string[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  return (
    <SelectionContext value={{ transactionIds, selected, setSelected, returnTo }}>
      <div className="mb-2 flex min-h-9 flex-wrap items-center justify-end gap-2">
        {categoryOptions && <TransactionBulkCategoryForm categoryOptions={categoryOptions} frequentCategories={frequentCategories} />}
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

// [벤치마킹: Lunch Money 대량 편집] 선택한 거래를 한 번에 다른 카테고리로 옮긴다. 1)의 카테고리 피커를 그대로 재사용한다.
export function TransactionBulkCategoryForm({
  categoryOptions,
  frequentCategories = [],
}: {
  categoryOptions: CategoryOption[];
  frequentCategories?: string[];
}) {
  const { selected, returnTo } = useSelection();
  const formRef = useRef<HTMLFormElement>(null);
  const stdCategoryInputRef = useRef<HTMLInputElement>(null);
  const label = `카테고리 변경 (${selected.size})`;

  function handleSelect(name: string | null) {
    if (selected.size === 0) return;
    if (stdCategoryInputRef.current) stdCategoryInputRef.current.value = name ?? UNMAPPED_VALUE;
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={updateTransactionsCategoryAction}
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        if (selected.size === 0) event.preventDefault();
      }}
    >
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="txnId" value={id} />
      ))}
      <input type="hidden" name="returnTo" value={returnTo} />
      <input ref={stdCategoryInputRef} type="hidden" name="stdCategory" defaultValue={UNMAPPED_VALUE} />
      <CategoryPicker
        value={null}
        options={categoryOptions}
        frequentCategories={frequentCategories}
        onSelect={handleSelect}
        ariaLabel={label}
        triggerLabel={label}
        disabled={selected.size === 0}
        triggerClassName="rounded-r2 px-3 py-1.5 text-[12px] font-semibold text-fg-brand hover:bg-bg-brand-weak disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-brand"
      />
    </form>
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
