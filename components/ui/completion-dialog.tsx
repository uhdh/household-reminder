"use client";

import { useId } from "react";
import { useDialogAccessibility } from "./use-dialog-accessibility";

type CompletionDialogProps = {
  title: string;
  date: string;
  error?: string | null;
  isSubmitting?: boolean;
  confirmDisabled?: boolean;
  onDateChange: (date: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CompletionDialog({ title, date, error, isSubmitting = false, confirmDisabled = false, onDateChange, onCancel, onConfirm }: CompletionDialogProps) {
  const titleId = useId();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onCancel);
  return (
    <div className="seed-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="seed-dialog-surface w-full max-w-sm rounded-r5 bg-bg-layer-floating p-5 text-fg-neutral shadow-2xl">
        <h2 id={titleId} className="text-base font-bold">{title}</h2>
        {error && <p role="alert" className="mt-2 text-sm text-fg-critical">{error}</p>}
        <label className="mt-4 block text-sm font-medium">
          완료한 날짜
          <input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="mt-2 w-full rounded-r3 border border-stroke-neutral-subtle bg-bg-layer-default px-3 py-2.5 text-fg-neutral outline-none focus:border-stroke-brand-solid" />
        </label>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="rounded-r3 border border-stroke-neutral-subtle px-3 py-2.5 text-sm font-semibold text-fg-neutral-muted transition hover:bg-bg-neutral-weak disabled:opacity-50">취소</button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting || confirmDisabled} className="rounded-r3 bg-bg-brand-solid px-3 py-2.5 text-sm font-semibold text-fg-neutral-inverted transition hover:bg-bg-brand-solid-pressed disabled:opacity-50">완료로 표시</button>
        </div>
      </div>
    </div>
  );
}
