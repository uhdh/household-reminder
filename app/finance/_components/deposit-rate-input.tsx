"use client";

import { useRef } from "react";
import { saveDepositRateAction } from "../deposit-rate-actions";

// 계좌별 연 금리 입력. Enter 또는 칸을 벗어날 때(값이 바뀐 경우만) 저장한다. 빈 값으로 저장하면 금리를 지운다.
export function DepositRateInput({
  personId,
  productName,
  ratePct,
  returnTo,
}: {
  personId: string;
  productName: string;
  ratePct: number | null;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const initial = ratePct === null ? "" : String(ratePct);
  return (
    <form ref={formRef} action={saveDepositRateAction} className="inline-flex items-center justify-end gap-1">
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="productName" value={productName} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        name="ratePct"
        inputMode="decimal"
        defaultValue={initial}
        placeholder="-"
        aria-label={`${productName} 연 금리(%)`}
        onBlur={(event) => {
          if (event.currentTarget.value.trim() !== initial) formRef.current?.requestSubmit();
        }}
        className="seed-input h-8 w-16 px-2 py-1 text-right text-[13px] tabular-nums"
      />
      <span className="text-[12px] text-ink-muted">%</span>
    </form>
  );
}
