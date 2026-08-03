"use client";

import { useRef } from "react";
import { updateBeneficiaryAction } from "./actions";

const OPTIONS: { value: string; label: string }[] = [
  { value: "husband", label: "남편" },
  { value: "wife", label: "아내" },
  { value: "joint", label: "우리" },
];

export function BeneficiarySelect({
  txnId,
  value,
  returnTo,
}: {
  txnId: string;
  value: string;
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateBeneficiaryAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <select
        name="beneficiary"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="border-[0.8px] border-hairline2 bg-card px-1.5 py-0.5 text-[12px] text-ink outline-none"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}
