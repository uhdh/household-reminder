"use client";

import { useRef, useState } from "react";
import { SelectInput } from "@/components/ui";
import { updateBeneficiaryAction } from "./actions";

export function BeneficiarySelect({
  txnId,
  value,
  returnTo,
  people,
  readOnly = false,
}: {
  txnId: string;
  value: string;
  returnTo: string;
  people: { id: string; displayName: string }[];
  /** true면 샘플(데모) 데이터 - 값만 보여주고 변경 UI는 렌더하지 않는다. */
  readOnly?: boolean;
}) {
  const options = [...people.map((p) => ({ value: p.id, label: p.displayName })), { value: "joint", label: "우리" }];
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState(false);
  const label = options.find((o) => o.value === value)?.label ?? value;

  if (readOnly) {
    return <span className="min-h-9 px-1 py-1 text-[14px] font-medium text-ink">{label}</span>;
  }

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
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectInput>
    </form>
  );
}
