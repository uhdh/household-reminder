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
};

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function SupplyGrid({ supplies, completeAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

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

  return (
    <div>
      <section className="rounded-2xl bg-white p-2 shadow-sm dark:bg-zinc-900">
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {supplies.map((supply) => (
                  <li key={supply.id}>
                    <button
                      type="button"
                      aria-label={`${supply.name} 완료 처리`}
                      onClick={() => openCompleteToast(supply)}
                      className="relative flex w-full flex-col items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-800"
                    >
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
