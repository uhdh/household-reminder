"use client";

import { useId, useState } from "react";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";
import { suggestKeywordFromDescription } from "@/lib/spending-derive";
import { createKeywordRuleAndApplyAction, updateTransactionCategoryAction } from "./actions";

const UNMAPPED_VALUE = "__미분류__";

export function CategorySelect({
  txnId,
  value,
  options,
  returnTo,
  description,
  txnType = "지출",
}: {
  txnId: string;
  value: string | null;
  options: { name: string; kind: string }[];
  returnTo: string;
  description?: string | null;
  txnType?: string;
}) {
  const [selectedVal, setSelectedVal] = useState(value ?? UNMAPPED_VALUE);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    targetCategory: string;
    keyword: string;
    applyToExisting: boolean;
  }>({
    isOpen: false,
    targetCategory: "",
    keyword: "",
    applyToExisting: true,
  });

  const dialogTitleId = useId();
  const grouped = groupByKind(options);
  const isOrphaned = !!value && value !== "미분류" && !options.some((o) => o.name === value);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newVal = e.target.value;
    if (newVal === (value ?? UNMAPPED_VALUE)) return;

    // 미분류로 변경하거나 설명이 없으면 다이얼로그 없이 즉시 단일 변경
    if (newVal === UNMAPPED_VALUE || !description?.trim()) {
      setSelectedVal(newVal);
      const form = e.target.form;
      if (form) form.requestSubmit();
      return;
    }

    // 규칙 제안 모달 띄우기
    const suggested = suggestKeywordFromDescription(description);
    setModalState({
      isOpen: true,
      targetCategory: newVal,
      keyword: suggested,
      applyToExisting: true,
    });
  }

  function handleCancelModal() {
    setModalState((prev) => ({ ...prev, isOpen: false }));
    setSelectedVal(value ?? UNMAPPED_VALUE);
  }

  return (
    <>
      <form action={updateTransactionCategoryAction} className="inline-block">
        <input type="hidden" name="txnId" value={txnId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <SelectInput
          name="stdCategory"
          value={selectedVal}
          onChange={handleSelectChange}
          className={`min-h-9 appearance-none rounded-r2 border-transparent bg-bg-neutral-weak [background-image:none] px-3 py-1 text-[13px] font-bold ${
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

      {modalState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="w-full max-w-sm rounded-2xl border border-hairline bg-card p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between pb-2">
              <h3 id={dialogTitleId} className="text-[14px] font-bold text-ink">
                카테고리 규칙으로 등록할까요?
              </h3>
              <button
                type="button"
                onClick={handleCancelModal}
                className="text-ink-muted hover:text-ink text-sm p-1"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            <p className="text-[12px] text-ink-muted mb-3 leading-relaxed">
              앞으로 이 키워드가 포함된 내역도 자동으로 설정한 카테고리로 자동 분류합니다.
            </p>

            <form action={createKeywordRuleAndApplyAction} className="space-y-3">
              <input type="hidden" name="txnId" value={txnId} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="txnType" value={txnType} />
              <input type="hidden" name="stdCategory" value={modalState.targetCategory} />

              <div>
                <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                  가맹점 / 적요 키워드
                </label>
                <TextInput
                  name="keyword"
                  value={modalState.keyword}
                  onChange={(e) =>
                    setModalState((prev) => ({ ...prev, keyword: e.target.value }))
                  }
                  required
                  placeholder="예: 코스트코, 이니시스"
                  className="w-full text-[13px] font-medium"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-bg-neutral-weak px-3 py-2 text-[12px]">
                <span className="text-ink-muted">적용할 카테고리</span>
                <span className="font-bold text-fg-brand bg-bg-brand-weak px-2.5 py-0.5 rounded-full">
                  {modalState.targetCategory}
                </span>
              </div>

              <label className="flex items-center gap-2 text-[12px] text-ink cursor-pointer pt-1">
                <input
                  type="checkbox"
                  name="applyToExisting"
                  value="true"
                  checked={modalState.applyToExisting}
                  onChange={(e) =>
                    setModalState((prev) => ({
                      ...prev,
                      applyToExisting: e.target.checked,
                    }))
                  }
                  className="size-4 rounded border-hairline text-fg-brand focus:ring-fg-brand"
                />
                <span>기존 거래 내역에도 일괄 적용</span>
              </label>

              <div className="mt-4 flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:gap-2">
                <ActionButton
                  type="submit"
                  className="w-full sm:flex-1 text-[12px] py-2"
                >
                  규칙으로 저장 & 적용
                </ActionButton>
                <button
                  type="button"
                  onClick={() => {
                    setModalState((prev) => ({ ...prev, isOpen: false }));
                    // 이번 건만 변경 실행
                    const form = document.createElement("form");
                    form.action = "";
                    form.method = "POST";
                    const data = new FormData();
                    data.set("txnId", txnId);
                    data.set("stdCategory", modalState.targetCategory);
                    data.set("returnTo", returnTo);
                    updateTransactionCategoryAction(data);
                  }}
                  className="seed-button seed-button-secondary w-full sm:flex-1 text-[12px] py-2"
                >
                  이번 건만 변경
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
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
