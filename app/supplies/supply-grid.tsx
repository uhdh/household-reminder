"use client";

import { useState } from "react";
import { SUPPLY_CATEGORIES, type SupplyCategory, type SupplyStatus } from "@/lib/supplies";
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {SUPPLY_CATEGORIES.map((category) => (
          <section
            key={category.id}
            className="flex-1 overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-zinc-900"
          >
            <h2
              className="p-2 text-center text-sm font-bold text-white"
              style={{ background: category.color }}
            >
              {category.label}
            </h2>
            <ul className="grid grid-cols-2 gap-2 p-2">
              {supplies
                .filter((s) => s.category === category.id)
                .map((supply) => (
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
        ))}
      </div>

      {completingSupply && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingSupply.name} 교체(관리) 완료로 표시할까요?</p>
          {completeError && <p className="text-sm text-red-400">{completeError}</p>}
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
            <button type="button" onClick={closeToast} disabled={isCompleting}>
              취소
            </button>
            <button
              type="button"
              onClick={confirmComplete}
              disabled={isCompleting || !doneDate}
              className="font-semibold text-blue-400 disabled:opacity-50"
            >
              완료로 표시
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
