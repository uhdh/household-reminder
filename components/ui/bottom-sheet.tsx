"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { useDialogAccessibility } from "./use-dialog-accessibility";

export function BottomSheet({ title, children, footer, onBackdropClick, testId }: { title: string; children: ReactNode; footer?: ReactNode; onBackdropClick: () => void; testId?: string }) {
  const titleId = useId();
  const dialogRef = useDialogAccessibility<HTMLElement>(onBackdropClick);
  return <div data-testid={testId} onMouseDown={(event) => event.target === event.currentTarget && onBackdropClick?.()} className="seed-dialog-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="seed-dialog-surface flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-auto rounded-t-r5 bg-bg-layer-floating px-5 pb-6 pt-6 text-fg-neutral shadow-2xl sm:rounded-r5"><h2 id={titleId} className="text-base font-bold">{title}</h2>{children}{footer && <div className="flex gap-2.5">{footer}</div>}</section></div>;
}
