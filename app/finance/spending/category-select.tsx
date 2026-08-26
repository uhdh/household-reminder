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
  // 삭제된 카테고리로 지정된 채 남아있는 거래는 옵션 목록에 없어도 실제 값 그대로 보여준다.
  // (없애면 select가 첫 옵션인 "미분류"로 조용히 바뀌어 보여서, 실제로는 매핑돼 있는데 미분류처럼 보임)
  const isOrphaned = !!value && value !== "미분류" && !options.some((o) => o.name === value);

  return (
    <form ref={formRef} action={updateTransactionCategoryAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SelectInput
        name="stdCategory"
        defaultValue={value ?? UNMAPPED_VALUE}
        onChange={() => formRef.current?.requestSubmit()}
        className={`min-h-8 rounded-r2 px-1.5 py-0.5 text-[12px] ${
          value === "자산수정" ? "font-semibold text-fg-brand" : value ? "text-ink" : "text-gain"
        }`}
      >
        <option value={UNMAPPED_VALUE}>미분류</option>
        {isOrphaned && <option value={value!}>{value} (삭제된 카테고리)</option>}
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
