"use client";

import { useState } from "react";
import type { IntervalUnit, ChoreStatus } from "@/lib/chores";
import { todayISO } from "@/lib/chores";

export type ChoreViewModel = {
  id: number;
  name: string;
  icon: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  status: ChoreStatus;
};

type Props = {
  chores: ChoreViewModel[];
  completeAction: (id: number, doneDateISO: string) => Promise<void>;
  createAction: (formData: FormData) => Promise<{ error?: string }>;
  updateAction: (id: number, formData: FormData) => Promise<{ error?: string }>;
  deleteAction: (id: number) => Promise<void>;
};

function progressColor(percent: number, overdue: boolean): string {
  if (overdue || percent >= 100) return "#e03131";
  if (percent >= 70) return "#e8a33d";
  return "#2bb3a3";
}

function dayLabel(daysRemaining: number): string {
  return daysRemaining >= 0 ? `D-${daysRemaining}` : `D+${-daysRemaining}`;
}

export function ChoreGrid({ chores, completeAction, createAction, updateAction, deleteAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");

  const completingChore = chores.find((c) => c.id === completingId) ?? null;

  function openCompleteToast(chore: ChoreViewModel) {
    setCompletingId(chore.id);
    setDoneDate(todayISO());
  }

  function closeToast() {
    setCompletingId(null);
  }

  async function confirmComplete() {
    if (completingId === null) return;
    await completeAction(completingId, doneDate);
    setCompletingId(null);
  }

  return (
    <div>
      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {chores.map((chore) => (
          <li key={chore.id}>
            <button
              type="button"
              aria-label={`${chore.name} 완료 처리`}
              onClick={() => openCompleteToast(chore)}
              className="relative flex w-full flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {chore.status.overdue && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                  !
                </span>
              )}
              <span className="text-3xl">{chore.icon}</span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{chore.name}</span>
              <span className="flex w-full items-center gap-1">
                <span className="text-[10px] text-zinc-500">{dayLabel(chore.status.daysRemaining)}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${chore.status.percent}%`,
                      background: progressColor(chore.status.percent, chore.status.overdue),
                    }}
                  />
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {completingChore && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingChore.name} 완료로 표시할까요?</p>
          <label>
            완료한 날짜
            <input
              type="date"
              value={doneDate}
              onChange={(e) => setDoneDate(e.target.value)}
              className="ml-2 rounded bg-zinc-800 px-1 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeToast}>
              취소
            </button>
            <button type="button" onClick={confirmComplete} className="font-semibold text-blue-400">
              완료로 표시
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
