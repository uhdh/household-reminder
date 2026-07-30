"use client";

import { useActionState } from "react";
import { createFamilyAction, joinFamilyAction, type FamilyActionState } from "./actions";

const initialState: FamilyActionState = {};

export function FamilyForm() {
  const [joinState, joinAction, joining] = useActionState(joinFamilyAction, initialState);
  const [createState, createAction, creating] = useActionState(createFamilyAction, initialState);
  return (
    <div className="space-y-4">
      <form action={createAction} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
        <h2 className="font-bold">새 가족 공간 만들기</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">가족 중 한 명이 만들고, 나온 코드를 다른 가족에게 알려주세요.</p>
        <button disabled={creating} className="mt-4 w-full rounded-xl bg-orange-600 py-3 font-bold text-white disabled:opacity-50">{creating ? "만드는 중…" : "가족 공간 만들기"}</button>
        {createState.success && <p className="mt-3 text-sm font-semibold text-green-600">{createState.success}</p>}
        {createState.error && <p className="mt-3 text-sm text-red-600">{createState.error}</p>}
      </form>
      <form action={joinAction} className="rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
        <h2 className="font-bold">가족 초대코드 입력</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">가족에게 받은 8자리 코드를 입력하세요.</p>
        <input name="inviteCode" maxLength={8} placeholder="예: A1B2C3D4" className="mt-4 w-full rounded-xl border border-zinc-200 bg-transparent px-3 py-3 uppercase outline-none focus:border-orange-500 dark:border-zinc-700" />
        <button disabled={joining} className="mt-3 w-full rounded-xl border border-orange-600 py-3 font-bold text-orange-600 disabled:opacity-50">{joining ? "참여하는 중…" : "가족 공간 참여하기"}</button>
        {joinState.success && <p className="mt-3 text-sm font-semibold text-green-600">{joinState.success}</p>}
        {joinState.error && <p className="mt-3 text-sm text-red-600">{joinState.error}</p>}
      </form>
    </div>
  );
}
