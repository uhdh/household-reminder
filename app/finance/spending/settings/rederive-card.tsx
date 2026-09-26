"use client";

import { useActionState, useState } from "react";
import { ActionButton, FeedbackMessage } from "@/components/ui";
import { rederiveAllAction, rederivePreviewAction, type RederiveState } from "./actions";

const initialState: RederiveState = {};

function transitionLabel(from: string | null, to: string | null): string {
  return `${from ?? "미분류"} → ${to ?? "미분류"}`;
}

// 매핑·규칙을 거래 업로드 "이후"에 추가한 경우, 이미 규칙이 생긴 조합의 과거 거래가 계속
// 미분류로 남는다. 가구 전체를 candidateFilter 없이 다시 계산해 한 번에 바로잡는 카드.
// 두 단계로 나뉜다: "변경 미리보기"는 아무것도 쓰지 않고 바뀔 내용만 보여주고(dryRun),
// 확인 후 "적용"을 눌러야 실제로 DB에 반영된다.
export function RederiveCard() {
  const [previewState, previewAction, isPreviewing] = useActionState(rederivePreviewAction, initialState);
  const [applyState, applyAction, isApplying] = useActionState(rederiveAllAction, initialState);
  // useActionState 두 개(미리보기/적용)를 따로 쓰다 보니, 한 번 적용한 뒤 "다시 미리보기"를
  // 누르면 이전 적용 결과가 새 미리보기 결과를 가려버릴 수 있다 - 두 버튼 중 어느 쪽을
  // 마지막으로 눌렀는지 직접 추적해서 그 쪽 결과만 보여준다.
  const [lastAction, setLastAction] = useState<"preview" | "apply" | null>(null);
  const previewReady = previewState.changed !== undefined;
  const applyReady = applyState.changed !== undefined;
  const showApplied = lastAction === "apply" && applyReady;
  const showPreview = lastAction === "preview" && previewReady;
  // 미리보기를 한 번이라도 확인해야만(또는 지금 적용 중이라 버튼이 사라지면 안 될 때) 적용 버튼을 보여준다.
  const canApply = (lastAction === "preview" && previewReady) || isApplying;

  return (
    <div className="seed-card p-5 shadow-none sm:p-7">
      <h2 className="mb-1 text-[18px] font-extrabold text-ink">현재 규칙으로 다시 분류</h2>
      <p className="mb-4 text-[14px] text-ink-muted">
        매핑·규칙을 나중에 추가해 예전 거래에 적용되지 않은 경우 한 번에 다시 분류해요. 직접 고친 분류는 그대로 둬요.
      </p>

      {previewState.error && <FeedbackMessage tone="critical" className="mb-4">{previewState.error}</FeedbackMessage>}
      {applyState.error && <FeedbackMessage tone="critical" className="mb-4">{applyState.error}</FeedbackMessage>}

      {showApplied && (
        <FeedbackMessage tone="positive" className="mb-4">
          {applyState.changed === 0
            ? "바뀐 거래가 없습니다."
            : `${applyState.changed}건의 분류가 바뀌었습니다 (미분류 → 분류 ${applyState.reclassified}건, 집계 포함 여부 변경 ${applyState.includedChanged}건).`}
          {!!applyState.pairs && ` 내 계좌 이동 ${applyState.pairs}쌍을 새로 집계에서 제외했습니다.`}
        </FeedbackMessage>
      )}
      {showPreview && (
        <div className="mb-4 rounded-r2 border border-stroke-neutral-muted bg-bg-neutral-weak p-4 text-[13px] text-ink">
          <p className="mb-2 font-semibold">
            {previewState.changed === 0
              ? "바뀔 거래가 없습니다."
              : `${previewState.changed}건이 바뀔 예정입니다 (미분류 → 분류 ${previewState.reclassified}건, 집계 포함 여부 변경 ${previewState.includedChanged}건).`}
          </p>
          {!!previewState.pairs && (
            <p className="mb-2 text-ink-muted">내 계좌 이동으로 {previewState.pairs}쌍을 새로 집계에서 제외할 예정입니다.</p>
          )}
          {previewState.transitions && previewState.transitions.length > 0 && (
            <ul className="space-y-0.5 text-ink-muted">
              {previewState.transitions.map((t, i) => (
                <li key={i}>
                  {transitionLabel(t.from, t.to)} · {t.count}건
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={previewAction} onSubmit={() => setLastAction("preview")}>
          <ActionButton type="submit" variant={canApply ? "secondary" : "primary"} className="min-h-11 px-4 py-2" disabled={isPreviewing}>
            {isPreviewing ? "미리 보는 중..." : "변경 미리보기"}
          </ActionButton>
        </form>
        {canApply && (
          <form action={applyAction} onSubmit={() => setLastAction("apply")}>
            <ActionButton type="submit" className="min-h-11 px-4 py-2" disabled={isApplying}>
              {isApplying ? "적용하는 중..." : "적용"}
            </ActionButton>
          </form>
        )}
      </div>
    </div>
  );
}
