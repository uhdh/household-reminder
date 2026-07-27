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

type FormState = { mode: "create" } | { mode: "edit"; chore: ChoreViewModel };

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
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const completingChore = chores.find((c) => c.id === completingId) ?? null;

  function openCompleteToast(chore: ChoreViewModel) {
    setCompletingId(chore.id);
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

  function openCreateForm() {
    setFormError(null);
    setFormState({ mode: "create" });
  }

  function openEditForm(chore: ChoreViewModel) {
    setFormError(null);
    setFormState({ mode: "edit", chore });
  }

  function closeForm() {
    setFormState(null);
    setFormError(null);
  }

  async function submitForm(formData: FormData) {
    if (!formState || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result =
        formState.mode === "create" ? await createAction(formData) : await updateAction(formState.chore.id, formData);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setFormState(null);
      setFormError(null);
    } catch {
      setFormError("저장에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!formState || formState.mode !== "edit" || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteAction(formState.chore.id);
      setFormState(null);
      setFormError(null);
    } catch {
      setFormError("삭제에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      {chores.length === 0 && <p>아직 등록된 집안일이 없어요 — + 버튼으로 추가해보세요</p>}

      <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4">
        {chores.map((chore) => (
          <li key={chore.id} className="relative">
            <button
              type="button"
              aria-label={`${chore.name} 수정`}
              onClick={() => openEditForm(chore)}
              className="absolute -left-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-500 text-xs text-white"
            >
              ✎
            </button>
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
        <li>
          <button
            type="button"
            aria-label="새로운 집안일 추가"
            onClick={openCreateForm}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-zinc-300 p-3 text-zinc-400 dark:border-zinc-700"
          >
            <span className="text-3xl">+</span>
            <span className="text-sm">추가</span>
          </button>
        </li>
      </ul>

      {completingChore && (
        <div className="fixed inset-x-0 bottom-6 mx-auto flex w-full max-w-xs flex-col gap-2 rounded-xl bg-zinc-900 p-4 text-white shadow-lg">
          <p>{completingChore.name} 완료로 표시할까요?</p>
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
              disabled={isCompleting}
              className="font-semibold text-blue-400 disabled:opacity-50"
            >
              완료로 표시
            </button>
          </div>
        </div>
      )}

      {formState && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/35">
          <form
            action={submitForm}
            className="w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-zinc-900"
          >
            <h2 className="mb-2 text-base font-bold">{formState.mode === "create" ? "새로운 집안일" : "항목 수정"}</h2>

            {formError && <p className="mb-2 text-sm text-red-600">{formError}</p>}

            <label className="mb-2 flex items-center justify-between gap-2">
              이름
              <input
                name="name"
                type="text"
                required
                defaultValue={formState.mode === "edit" ? formState.chore.name : ""}
                className="flex-1 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-2 flex items-center justify-between gap-2">
              이모지
              <input
                name="icon"
                type="text"
                required
                defaultValue={formState.mode === "edit" ? formState.chore.icon : ""}
                className="w-16 rounded border border-zinc-300 px-2 py-1 text-center dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-2 flex items-center justify-between gap-2">
              주기 값
              <input
                name="intervalValue"
                type="number"
                min={1}
                defaultValue={formState.mode === "edit" ? formState.chore.intervalValue : 1}
                className="w-16 rounded border border-zinc-300 px-2 py-1 text-center dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
            <label className="mb-3 flex items-center justify-between gap-2">
              주기 단위
              <select
                name="intervalUnit"
                defaultValue={formState.mode === "edit" ? formState.chore.intervalUnit : "week"}
                className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="day">일</option>
                <option value="week">주</option>
                <option value="month">개월</option>
              </select>
            </label>

            <div className="flex justify-between">
              <div>
                {formState.mode === "edit" && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting || isDeleting}
                    className="text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeForm} disabled={isSubmitting || isDeleting}>
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isDeleting}
                  className="font-semibold text-blue-600 disabled:opacity-50"
                >
                  저장
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
