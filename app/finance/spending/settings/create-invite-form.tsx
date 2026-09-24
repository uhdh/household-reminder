"use client";

import { useActionState } from "react";
import { ActionButton, FeedbackMessage } from "@/components/ui";
import { createInviteAction, type CreateInviteState } from "./members-actions";
import { InviteLink } from "./invite-link";

const initialState: CreateInviteState = {};

// 초대 링크를 만드는 폼. 원문 토큰은 서버 액션의 반환값(state)으로만 받는다 - URL 쿼리에는 절대
// 싣지 않는다(브라우저 히스토리·Referer·서버 로그에 남는 것을 막기 위함).
export function CreateInviteForm() {
  const [state, formAction, isPending] = useActionState(createInviteAction, initialState);

  return (
    <div>
      {state.error && <FeedbackMessage tone="critical" className="mb-4">{state.error}</FeedbackMessage>}
      {state.token && (
        <div className="mb-4">
          <InviteLink path={`/invite/${state.token}`} />
        </div>
      )}
      <form action={formAction}>
        <ActionButton type="submit" className="min-h-11 px-4 py-2" disabled={isPending}>
          {isPending ? "만드는 중..." : "초대 링크 만들기"}
        </ActionButton>
      </form>
    </div>
  );
}
