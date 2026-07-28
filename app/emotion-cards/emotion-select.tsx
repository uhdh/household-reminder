"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMOTIONS, COLORS, type Emotion } from "@/lib/emotions";

type Props = {
  today: string;
  initialSelected: Emotion[];
  initialCustomEmotions: Emotion[];
  backHref: string;
  addCustomEmotionAction: (name: string) => Promise<{ emotion?: Emotion; error?: string }>;
  saveRecordAction: (date: string, emotions: Emotion[]) => Promise<{ error?: string }>;
};

export function EmotionSelect({
  today,
  initialSelected,
  initialCustomEmotions,
  backHref,
  addCustomEmotionAction,
  saveRecordAction,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Emotion[]>(initialSelected);
  const [customEmotions, setCustomEmotions] = useState<Emotion[]>(initialCustomEmotions);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetName, setSheetName] = useState("");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allEmotions = [...EMOTIONS, ...customEmotions];
  const canComplete = selected.length === 3;

  function toggle(emotion: Emotion) {
    setSelected((prev) => {
      const exists = prev.some((e) => e.name === emotion.name);
      if (exists) return prev.filter((e) => e.name !== emotion.name);
      if (prev.length >= 3) return prev;
      return [...prev, emotion];
    });
  }

  function closeSheet() {
    setSheetOpen(false);
    setSheetName("");
    setSheetError(null);
  }

  async function handleAddCustom() {
    const trimmed = sheetName.trim();
    if (!trimmed) return;
    try {
      const result = await addCustomEmotionAction(trimmed);
      if (result.error || !result.emotion) {
        setSheetError(result.error ?? "추가에 실패했어요.");
        return;
      }
      const emotion = result.emotion;
      if (!allEmotions.some((e) => e.name === emotion.name)) {
        setCustomEmotions((prev) => [...prev, emotion]);
      }
      closeSheet();
      toggle(emotion);
    } catch {
      setSheetError("추가에 실패했어요. 다시 시도해주세요.");
    }
  }

  async function handleComplete() {
    if (!canComplete || isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveRecordAction(today, selected);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      router.push("/emotion-cards/result");
    } catch {
      setSaveError("완료 처리에 실패했어요. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <div className="flex items-center gap-3.5 px-5 pt-4 pb-2">
        <button
          type="button"
          aria-label="뒤로가기"
          onClick={() => router.push(backHref)}
          className="text-xl leading-none text-zinc-500 dark:text-zinc-400"
        >
          ←
        </button>
        <div className="flex-1 text-base font-bold text-zinc-900 dark:text-zinc-50">감정 선택</div>
        <div className="text-sm font-semibold text-orange-600">{selected.length}/3</div>
      </div>

      <div className="px-5 pb-3 text-sm text-zinc-500 dark:text-zinc-400">
        지금 마음에 가장 가까운 카드 3장을 골라주세요
      </div>

      {saveError && <p className="px-5 pb-2 text-sm text-red-600">{saveError}</p>}

      <div className="grid flex-1 grid-cols-3 gap-2.5 overflow-auto px-4 pb-6">
        {allEmotions.map((emotion) => {
          const isSelected = selected.some((e) => e.name === emotion.name);
          const col = COLORS[emotion.color];
          return (
            <button
              key={emotion.name}
              type="button"
              aria-label={`${emotion.name} 선택`}
              aria-pressed={isSelected}
              onClick={() => toggle(emotion)}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl px-1.5 pt-3.5 pb-2.5 transition-transform duration-150"
              style={{
                background: col.bg,
                border: `2px solid ${isSelected ? col.border : "transparent"}`,
                transform: isSelected ? "scale(1.05)" : "scale(1)",
              }}
            >
              {isSelected && (
                <span
                  className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: col.border }}
                >
                  ✓
                </span>
              )}
              <div className="text-2xl leading-none">{emotion.emoji}</div>
              <div className="text-xs font-semibold" style={{ color: col.text }}>
                {emotion.name}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          aria-label="새 감정 추가"
          onClick={() => setSheetOpen(true)}
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-300 px-1.5 pt-3.5 pb-2.5 dark:border-zinc-700"
        >
          <span className="text-2xl leading-none text-zinc-400">+</span>
          <span className="text-xs font-semibold text-zinc-400">추가하기</span>
        </button>
      </div>

      <div className="sticky bottom-0 bg-zinc-50 px-5 pt-3.5 pb-5 dark:bg-black">
        <button
          type="button"
          disabled={!canComplete || isSaving}
          onClick={handleComplete}
          className="w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          완료
        </button>
      </div>

      {sheetOpen && (
        <div
          data-testid="add-emotion-sheet-backdrop"
          onClick={closeSheet}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 transition-opacity duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-4 rounded-t-2xl bg-white px-6 pt-7 pb-8 transition-transform duration-200 dark:bg-zinc-900"
          >
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-50">나만의 감정 추가하기</div>
            {sheetError && <p className="text-sm text-red-600">{sheetError}</p>}
            <input
              autoFocus
              aria-label="감정 이름"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value.slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustom();
              }}
              placeholder="예: 허탈함, 뭉클함..."
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3.5 text-zinc-900 outline-none focus:border-orange-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={closeSheet}
                className="flex-1 rounded-2xl bg-zinc-200 py-3.5 font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                disabled={!sheetName.trim()}
                onClick={handleAddCustom}
                className="flex-1 rounded-2xl bg-orange-600 py-3.5 font-bold text-white disabled:bg-zinc-300"
              >
                추가
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
