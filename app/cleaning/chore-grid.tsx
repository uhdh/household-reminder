"use client";

import { useState } from "react";
import { ActionButton, BottomSheet, CompletionDialog, FeedbackMessage, FormField, ItemGrid, ItemTile, SelectInput, TextInput } from "@/components/ui";
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

export function ChoreGrid({ chores, completeAction, createAction, updateAction, deleteAction }: Props) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [doneDate, setDoneDate] = useState("");
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

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
    setDeleteArmed(false);
    setFormState({ mode: "create" });
  }

  function closeForm() {
    setFormState(null);
    setFormError(null);
    setDeleteArmed(false);
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
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteAction(formState.chore.id);
      setFormState(null);
      setFormError(null);
      setDeleteArmed(false);
    } catch {
      setFormError("삭제에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div>
      {chores.length === 0 && <p>아직 등록된 집안일이 없어요 — + 버튼으로 추가해보세요</p>}

      <ItemGrid>
        {chores.map((chore) => (
          <li key={chore.id}>
            <ItemTile
              aria-label={`${chore.name} 완료 처리`}
              onClick={() => openCompleteToast(chore)}
              icon={chore.icon}
              name={chore.name}
              daysRemaining={chore.status.daysRemaining}
              percent={chore.status.percent}
              overdue={chore.status.overdue}
            />
          </li>
        ))}
        <li>
          <button
            type="button"
            aria-label="새로운 집안일 추가"
            onClick={openCreateForm}
            className="flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-r3 border border-dashed border-stroke-neutral-muted p-2 text-fg-neutral-subtle transition hover:bg-bg-neutral-weak"
          >
            <span className="text-3xl">+</span>
            <span className="text-sm">추가</span>
          </button>
        </li>
      </ItemGrid>

      {completingChore && (
        <CompletionDialog title={`${completingChore.name} 완료로 표시할까요?`} date={doneDate} error={completeError} isSubmitting={isCompleting} confirmDisabled={!doneDate} onDateChange={setDoneDate} onCancel={closeToast} onConfirm={confirmComplete} />
      )}

      {formState && (
        <BottomSheet title={formState.mode === "create" ? "새로운 집안일" : "항목 수정"} onBackdropClick={closeForm} footer={<><ActionButton variant="secondary" className="flex-1" onClick={closeForm} disabled={isSubmitting || isDeleting}>취소</ActionButton><ActionButton type="submit" form="chore-form" className="flex-1" disabled={isSubmitting || isDeleting}>저장</ActionButton></>}>
          <form id="chore-form" action={submitForm} className="space-y-4">
            {formError && <FeedbackMessage tone="critical">{formError}</FeedbackMessage>}
            <FormField label="이름">
              <TextInput
                name="name"
                type="text"
                required
                defaultValue={formState.mode === "edit" ? formState.chore.name : ""}
              />
            </FormField>
            <FormField label="이모지">
              <TextInput
                name="icon"
                type="text"
                required
                defaultValue={formState.mode === "edit" ? formState.chore.icon : ""}
                className="max-w-24 text-center"
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
            <FormField label="주기 값">
              <TextInput
                name="intervalValue"
                type="number"
                min={1}
                defaultValue={formState.mode === "edit" ? formState.chore.intervalValue : 1}
                className="text-center"
              />
            </FormField>
            <FormField label="주기 단위">
              <SelectInput
                name="intervalUnit"
                defaultValue={formState.mode === "edit" ? formState.chore.intervalUnit : "week"}
              >
                <option value="day">일</option>
                <option value="week">주</option>
                <option value="month">개월</option>
              </SelectInput>
            </FormField>
            </div>
            <div>
                {formState.mode === "edit" && (
                  <ActionButton
                    variant="danger"
                    type="button"
                    onClick={handleDelete}
                    disabled={isSubmitting || isDeleting}
                  >
                    {isDeleting ? "삭제 중…" : deleteArmed ? "정말 삭제" : "삭제"}
                  </ActionButton>
                )}
                {deleteArmed && <FeedbackMessage tone="critical" className="mt-2">삭제하면 되돌릴 수 없습니다. 한 번 더 눌러 확인해주세요.</FeedbackMessage>}
            </div>
          </form>
        </BottomSheet>
      )}
    </div>
  );
}
