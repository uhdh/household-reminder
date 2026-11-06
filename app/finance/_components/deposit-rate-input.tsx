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
    <form ref={formRef} action={saveDepositRateAction} className="inline-flex items-center gap-1">
      <span>연</span>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="productName" value={productName} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        name="ratePct"
        inputMode="decimal"
        defaultValue={initial}
        placeholder="금리"
        aria-label={`${productName} 연 금리(%)`}
        onBlur={(event) => {
          if (event.currentTarget.value.trim() !== initial) formRef.current?.requestSubmit();
        }}
        className="h-7 w-14 rounded-r2 border border-stroke-neutral-subtle bg-bg-layer-default px-2 text-right text-[12px] tabular-nums text-ink placeholder:text-ink-muted focus:border-stroke-brand-solid focus:outline-none"
      />
      <span className="text-[12px] text-ink-muted">%</span>
    </form>
  );
}
