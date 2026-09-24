"use client";

import { useActionState } from "react";
import { ActionButton, FeedbackMessage } from "@/components/ui";
import { rederiveAllAction, type RederiveState } from "./actions";

const initialState: RederiveState = {};

// 매핑·규칙을 거래 업로드 "이후"에 추가한 경우, 이미 규칙이 생긴 조합의 과거 거래가 계속
// 미분류로 남는다. 가구 전체를 candidateFilter 없이 다시 계산해 한 번에 바로잡는 카드.
export function RederiveCard() {
  const [state, formAction, isPending] = useActionState(rederiveAllAction, initialState);

  return (
    <div className="seed-card p-5 shadow-none sm:p-7">
      <h2 className="mb-1 text-[18px] font-extrabold text-ink">현재 규칙으로 다시 분류</h2>
      <p className="mb-4 text-[14px] text-ink-muted">
        매핑·규칙을 나중에 추가해 예전 거래에 적용되지 않은 경우 한 번에 다시 분류해요. 직접 고친 분류는 그대로 둬요.
      </p>
      {state.error && <FeedbackMessage tone="critical" className="mb-4">{state.error}</FeedbackMessage>}
      {state.changed !== undefined && (
        <FeedbackMessage tone="positive" className="mb-4">
          {state.changed === 0
            ? "바뀐 거래가 없습니다."
            : `${state.changed}건의 분류가 바뀌었습니다 (미분류 → 분류 ${state.reclassified}건, 집계 포함 여부 변경 ${state.includedChanged}건).`}
        </FeedbackMessage>
      )}
      <form action={formAction}>
        <ActionButton type="submit" className="min-h-11 px-4 py-2" disabled={isPending}>
          {isPending ? "다시 분류하는 중..." : "다시 분류하기"}
        </ActionButton>
      </form>
    </div>
  );
}
