"use client";

import { useState } from "react";
import type { SupplyCategory, SupplyStatus } from "@/lib/supplies";
import { todayISO } from "@/lib/chores";

export type SupplyViewModel = {
  id: number;
  category: SupplyCategory;
  name: string;
  icon: string;
  status: SupplyStatus;
};

type Props = {
  supplies: SupplyViewModel[];
  completeAction: (id: number, doneDateISO: string) => Promise<void>;
  bulkCompleteAction?: (ids: number[], doneDateISO: string) => Promise<void>;
};

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function SupplyGrid({ supplies, completeAction, bulkCompleteAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDate, setBulkDate] = useState(todayISO());

  const completingSupply = supplies.find((s) => s.id === completingId) ?? null;

  function openCompleteToast(supply: SupplyViewModel) {
    setCompletingId(supply.id);
    setDoneDate(todayISO());
    setCompleteError(null);
  }

  function closeToast() {
    setCompletingId(null);
    setCompleteError(null);
  }

  async function confirmComplete() {
    if (completingId === null || isCompleting) return;
    setIsCompleting(true);
    try {
      await completeAction(completingId, doneDate);
      setCompletingId(null);
      setCompleteError(null);
    } catch {
      setCompleteError("완료 처리에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsCompleting(false);
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  function closeBulk() {
    setBulkOpen(false);
    setSelectedIds([]);
  }

  async function confirmBulkComplete() {
    if (!bulkCompleteAction || selectedIds.length === 0 || !bulkDate || isCompleting) return;
    setIsCompleting(true);
    try {
      await bulkCompleteAction(selectedIds, bulkDate);
      closeBulk();
    } finally {
      setIsCompleting(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => { setBulkOpen(true); setBulkDate(todayISO()); }}
          className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          일괄 날짜 입력
        </button>
      </div>
      <section className="rounded-2xl bg-white p-2 shadow-sm dark:bg-zinc-900">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {supplies.map((supply) => (
                  <li key={supply.id}>
                    <button
                      type="button"
                      aria-label={`${supply.name} 완료 처리`}
                      onClick={() => (bulkOpen ? toggleSelected(supply.id) : openCompleteToast(supply))}
                      aria-pressed={bulkOpen ? selectedIds.includes(supply.id) : undefined}
                      className="relative flex w-full flex-col items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800"
                    >
                      {bulkOpen && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                            selectedIds.includes(supply.id)
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-zinc-400 bg-white/80 dark:border-zinc-500 dark:bg-zinc-700"
                          }`}
                        >
                          {selectedIds.includes(supply.id) ? "✓" : ""}
                        </span>
                      )}
                      {supply.status.overdue && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                          !
                        </span>
                      )}
                      <span className="text-2xl">{supply.icon}</span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                        {supply.name}
                      </span>
                      <span className="flex w-full items-center gap-1">
                        <span className="text-[9px] text-zinc-500">
                          {dayLabel(supply.status.daysRemaining)}
                        </span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${supply.status.percent}%`,
                              background: progressColor(supply.status.percent, supply.status.overdue),
                            }}
                          />
                        </span>
                      </span>
                    </button>
                  </li>
          ))}
        </ul>
      </section>

      {bulkOpen && (
        <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{selectedIds.length}개 선택됨</p>
            <button type="button" onClick={closeBulk} className="text-xs text-blue-700 dark:text-blue-300">취소</button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              aria-label="일괄 완료 날짜"
              type="date"
              value={bulkDate}
              onChange={(event) => setBulkDate(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-blue-800 dark:bg-zinc-900 dark:text-white"
            />
            <button
              type="button"
              onClick={confirmBulkComplete}
              disabled={selectedIds.length === 0 || !bulkDate || isCompleting || !bulkCompleteAction}
              className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              날짜 적용
            </button>
          </div>
        </div>
      )}

      {completingSupply && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-3xl bg-white p-5 text-zinc-900 shadow-2xl dark:bg-zinc-900 dark:text-white">
          <p>{completingSupply.name} 교체(관리) 완료로 표시할까요?</p>
          {completeError && <p className="text-sm text-red-400">{completeError}</p>}
          <label>
            완료한 날짜
            <input
              type="date"
              value={doneDate}
              onChange={(e) => setDoneDate(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
            />
          </label>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={closeToast} disabled={isCompleting} className="rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              취소
            </button>
            <button
              type="button"
              onClick={confirmComplete}
              disabled={isCompleting || !doneDate}
              className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              완료로 표시
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
