"use client";

import { useRef, useState } from "react";
import { SelectInput } from "@/components/ui";
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
  const [editing, setEditing] = useState(false);
  const label = OPTIONS.find((o) => o.value === value)?.label ?? value;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`사용 대상 변경, 현재 ${label}`}
        className="min-h-9 rounded-r2 border-transparent px-1 py-1 text-[14px] font-medium text-ink hover:bg-bg-neutral-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-brand"
      >
        {label}
      </button>
    );
  }

  return (
    <form ref={formRef} action={updateBeneficiaryAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SelectInput
        name="beneficiary"
        defaultValue={value}
        autoFocus
        onChange={() => formRef.current?.requestSubmit()}
        onBlur={() => setEditing(false)}
        className="min-h-9 appearance-none rounded-r2 border-transparent bg-transparent [background-image:none] px-1 py-1 text-[14px] font-medium text-ink"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectInput>
    </form>
  );
}
