"use client";

import { useRef } from "react";
import { SelectInput } from "@/components/ui";
import { updateTransactionCategoryAction } from "./actions";

const UNMAPPED_VALUE = "__미분류__";

export function CategorySelect({
  txnId,
  value,
  options,
  returnTo,
}: {
  txnId: string;
  value: string | null;
  options: { name: string; kind: string }[];
  returnTo: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const grouped = groupByKind(options);

  return (
    <form ref={formRef} action={updateTransactionCategoryAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SelectInput
        name="stdCategory"
        defaultValue={value ?? UNMAPPED_VALUE}
        onChange={() => formRef.current?.requestSubmit()}
        className={`min-h-8 rounded-r2 px-1.5 py-0.5 text-[12px] ${
          value ? "text-ink" : "text-gain"
        }`}
      >
        <option value={UNMAPPED_VALUE}>미분류</option>
        {Object.entries(grouped).map(([kind, names]) => (
          <optgroup key={kind} label={kind}>
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectInput>
    </form>
  );
}

function groupByKind(options: { name: string; kind: string }[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const o of options) {
    if (!groups[o.kind]) groups[o.kind] = [];
    groups[o.kind].push(o.name);
  }
  return groups;
}
