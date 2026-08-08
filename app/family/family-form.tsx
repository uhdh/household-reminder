"use client";

import { useActionState } from "react";
import { ActionButton, FeedbackMessage, FormField, TextInput } from "@/components/ui";
import { createFamilyAction, joinFamilyAction, type FamilyActionState } from "./actions";

const initialState: FamilyActionState = {};

export function FamilyForm() {
  const [joinState, joinAction, joining] = useActionState(joinFamilyAction, initialState);
  const [createState, createAction, creating] = useActionState(createFamilyAction, initialState);
  return (
    <div className="space-y-4">
      <form action={createAction} className="seed-card p-5">
        <h2 className="font-bold">새 가족 공간 만들기</h2>
        <p className="seed-subtitle mt-1">가족 중 한 명이 만들고, 나온 코드를 다른 가족에게 알려주세요.</p>
        <ActionButton type="submit" disabled={creating} className="mt-4 w-full">{creating ? "만드는 중…" : "가족 공간 만들기"}</ActionButton>
        {createState.success && <FeedbackMessage tone="positive" className="mt-3">{createState.success}</FeedbackMessage>}
        {createState.error && <FeedbackMessage tone="critical" className="mt-3">{createState.error}</FeedbackMessage>}
      </form>
      <form action={joinAction} className="seed-card p-5">
        <h2 className="font-bold">가족 초대코드 입력</h2>
        <p className="seed-subtitle mt-1">가족에게 받은 8자리 코드를 입력하세요.</p>
        <FormField label="초대 코드" className="mt-4"><TextInput name="inviteCode" maxLength={8} placeholder="예: A1B2C3D4" className="uppercase" /></FormField>
        <ActionButton type="submit" variant="secondary" disabled={joining} className="mt-3 w-full">{joining ? "참여하는 중…" : "가족 공간 참여하기"}</ActionButton>
        {joinState.success && <FeedbackMessage tone="positive" className="mt-3">{joinState.success}</FeedbackMessage>}
        {joinState.error && <FeedbackMessage tone="critical" className="mt-3">{joinState.error}</FeedbackMessage>}
      </form>
    </div>
  );
}
