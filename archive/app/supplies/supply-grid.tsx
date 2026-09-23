"use client";

import { useState } from "react";
import { ActionButton, CompletionDialog, ItemGrid, ItemTile, TextInput } from "@/components/ui";
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
          className="seed-pill"
        >
          일괄 날짜 입력
        </button>
      </div>
      <ItemGrid>
          {supplies.map((supply) => (
                  <li key={supply.id}>
                    <ItemTile
                      aria-label={`${supply.name} 완료 처리`}
                      onClick={() => (bulkOpen ? toggleSelected(supply.id) : openCompleteToast(supply))}
                      aria-pressed={bulkOpen ? selectedIds.includes(supply.id) : undefined}
                      icon={supply.icon}
                      name={supply.name}
                      daysRemaining={supply.status.daysRemaining}
                      percent={supply.status.percent}
                      overdue={supply.status.overdue}
                      selectionMode={bulkOpen}
                      selected={selectedIds.includes(supply.id)}
                    />
                  </li>
          ))}
      </ItemGrid>

      {bulkOpen && (
        <div className="seed-card mt-3 bg-bg-brand-weak p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-fg-brand">{selectedIds.length}개 선택됨</p>
            <ActionButton type="button" variant="ghost" onClick={closeBulk} className="min-h-8 px-2 py-1 text-xs">취소</ActionButton>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TextInput
              aria-label="일괄 완료 날짜"
              type="date"
              value={bulkDate}
              onChange={(event) => setBulkDate(event.target.value)}
              className="min-w-0 flex-1"
            />
            <ActionButton
              type="button"
              onClick={confirmBulkComplete}
              disabled={selectedIds.length === 0 || !bulkDate || isCompleting || !bulkCompleteAction}
            >
              날짜 적용
            </ActionButton>
          </div>
        </div>
      )}

      {completingSupply && (
        <CompletionDialog title={`${completingSupply.name} 교체(관리) 완료로 표시할까요?`} date={doneDate} error={completeError} isSubmitting={isCompleting} confirmDisabled={!doneDate} onDateChange={setDoneDate} onCancel={closeToast} onConfirm={confirmComplete} />
      )}
    </div>
  );
}
