"use client";

import { useState } from "react";
import { ActionButton, FeedbackMessage, TextInput } from "@/components/ui";
import { deleteHouseholdAction, leaveHouseholdAction } from "./members-actions";

// 가구 나가기: 모든 구성원이 쓸 수 있다. 유일한 구성원인지에 따라 안내 문구만 달라지고,
// 실제 삭제 범위 판단은 서버 액션에서 다시 한다(폼 입력을 신뢰하지 않는다).
export function LeaveHouseholdForm({ isOnlyMember, error }: { isOnlyMember: boolean; error?: string }) {
  const [checked, setChecked] = useState(false);

  return (
    <form action={leaveHouseholdAction} className="space-y-3">
      {error && <FeedbackMessage tone="critical">{error}</FeedbackMessage>}
      <p className="text-[13px] text-ink-muted">
        {isOnlyMember
          ? "가구의 유일한 구성원입니다. 나가면 이 가구의 가계부·자산 데이터가 전부 함께 삭제되고, 되돌릴 수 없습니다."
          : "가구의 가계부·자산 데이터는 그대로 유지되고, 본인 계정과 구성원 자격만 삭제됩니다."}
      </p>
      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          name="confirm"
          value="탈퇴"
          required
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="size-4 rounded border-hairline"
        />
        위 내용을 확인했으며 가구에서 나가겠습니다.
      </label>
      <ActionButton type="submit" variant="danger" disabled={!checked} className="min-h-11 px-4 py-2">
        가구 나가기
      </ActionButton>
    </form>
  );
}

// 가구 삭제: owner만 접근 가능(page.tsx에서 role === "owner"일 때만 렌더링). 가구 이름을
// 정확히 입력해야 버튼이 활성화되고, 서버에서도 이름 일치를 다시 검증한다.
export function DeleteHouseholdForm({ householdName, error }: { householdName: string; error?: string }) {
  const [input, setInput] = useState("");

  return (
    <form action={deleteHouseholdAction} className="space-y-3">
      {error && <FeedbackMessage tone="critical">{error}</FeedbackMessage>}
      <p className="text-[13px] text-ink-muted">
        가구의 가계부·자산 데이터 전체와 모든 구성원 자격이 삭제되고, 되돌릴 수 없습니다. 계속하려면
        가구 이름(<span className="font-semibold text-ink">{householdName}</span>)을 정확히 입력하세요.
      </p>
      <TextInput
        name="householdName"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={householdName}
        className="min-h-11 px-3 py-2"
      />
      <ActionButton type="submit" variant="danger" disabled={input !== householdName} className="min-h-11 px-4 py-2">
        가구 삭제
      </ActionButton>
    </form>
  );
}
