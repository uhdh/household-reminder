"use client";

import { useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/ui";
import { suggestKeywordFromDescription } from "@/lib/spending-derive";
import { createKeywordRuleAndApplyAction, updateTransactionCategoryAction, updateTransactionsCategoryAction } from "./actions";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { displayCategoryLabel } from "./category-suggest";

export const UNMAPPED_VALUE = "__미분류__";

export function CategorySelect({
  txnId,
  value,
  options,
  returnTo,
  description,
  txnType = "지출",
  recommendations = [],
  frequentCategories = [],
  merchantCounts = {},
  autoOpen = false,
}: {
  txnId: string;
  value: string | null;
  options: CategoryOption[];
  returnTo: string;
  description?: string | null;
  txnType?: string;
  recommendations?: string[];
  frequentCategories?: string[];
  merchantCounts?: Record<string, number>;
  autoOpen?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const stdCategoryInputRef = useRef<HTMLInputElement>(null);
  const returnToInputRef = useRef<HTMLInputElement>(null);

  function handleSelect(name: string | null) {
    if (name === (value ?? null)) return; // 값이 그대로면 저장하지 않음

    // 같은 가맹점의 다른 거래가 있으면, 저장 후 돌아온 화면에서 일괄 적용 토스트를 띄우도록
    // returnTo에 쿼리를 실어 보낸다(서버 액션이 redirect()로 이동하므로 클라이언트 상태로는 못 넘긴다).
    // 실제로 몇 건이 바뀔지는 page.tsx가 정확 일치로 다시 계산하므로, 여기서는 후보가 있는지만
    // merchantCounts로 가볍게 판단한다(부정확해도 토스트 노출 여부에만 영향).
    const merchantKey = suggestKeywordFromDescription(description);
    const otherCount = merchantKey ? (merchantCounts[merchantKey] ?? 0) - 1 : 0;
    const canSuggestMerge = name !== null && otherCount > 0;
    const toastQuery = canSuggestMerge
      ? `${returnTo.includes("?") ? "&" : "?"}toastMerchant=${encodeURIComponent(merchantKey)}&toastCategory=${encodeURIComponent(name)}&toastTxnType=${encodeURIComponent(txnType)}&toastTxnId=${encodeURIComponent(txnId)}`
      : "";

    if (stdCategoryInputRef.current) stdCategoryInputRef.current.value = name ?? UNMAPPED_VALUE;
    if (returnToInputRef.current) returnToInputRef.current.value = `${returnTo}${toastQuery}`;
    formRef.current?.requestSubmit();
  }

  const chipClassName = `min-h-9 inline-flex items-center gap-1 rounded-r2 border px-3 py-1 text-[13px] font-bold hover:bg-bg-neutral-weak/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-brand ${
    value === "자산수정"
      ? "border-transparent bg-bg-neutral-weak font-semibold text-fg-brand"
      : value
        ? "border-transparent bg-bg-neutral-weak text-ink"
        : "border-dashed border-stroke-brand-weak bg-bg-brand-weak/40 text-fg-brand"
  }`;

  return (
    <form ref={formRef} action={updateTransactionCategoryAction} className="inline-block">
      <input type="hidden" name="txnId" value={txnId} />
      <input ref={stdCategoryInputRef} type="hidden" name="stdCategory" defaultValue={value ?? UNMAPPED_VALUE} />
      <input ref={returnToInputRef} type="hidden" name="returnTo" defaultValue={returnTo} />
      <CategoryPicker
        value={value}
        options={options}
        recommendations={recommendations}
        frequentCategories={frequentCategories}
        onSelect={handleSelect}
        ariaLabel={`카테고리 변경, 현재 ${displayCategoryLabel(value)}`}
        triggerClassName={chipClassName}
        autoOpen={autoOpen}
      />
    </form>
  );
}

const TOAST_AUTO_DISMISS_MS = 6000;
const TOAST_PARAM_KEYS = ["toastMerchant", "toastCategory", "toastTxnType", "toastTxnId"];

// [벤치마킹: Lunch Money] 카테고리 지정은 즉시 저장하고, 같은 가맹점의 다른 거래가 있을 때만
// "모두 적용 / 앞으로도 자동" 토스트로 가볍게 제안한다(기존 모달 흐름 대체).
// txnIds는 page.tsx가 정규화 가맹점 키+txnType 정확 일치로 미리 계산해 넘긴 대상이라,
// 표시 건수와 실제로 바뀔 건수가 항상 같다.
export function CategoryMergeToast({
  merchantKey,
  category,
  txnType,
  txnIds,
  returnTo,
}: {
  merchantKey: string;
  category: string;
  txnType: string;
  txnIds: string[];
  returnTo: string;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(close, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  function close() {
    setVisible(false);
    const url = new URL(window.location.href);
    for (const key of TOAST_PARAM_KEYS) url.searchParams.delete(key);
    window.history.replaceState(null, "", url.toString());
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-2 rounded-r3 border border-hairline bg-bg-layer-floating p-3 shadow-2xl sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-ink">
          &apos;{merchantKey}&apos; 거래 {txnIds.length}건도 {displayCategoryLabel(category)}로 바꿀까요?
        </p>
        <button type="button" onClick={close} aria-label="닫기" className="shrink-0 p-1 text-sm text-ink-muted hover:text-ink">
          ✕
        </button>
      </div>
      <div className="flex gap-2">
        <form action={updateTransactionsCategoryAction} className="flex-1">
          {txnIds.map((id) => (
            <input key={id} type="hidden" name="txnId" value={id} />
          ))}
          <input type="hidden" name="stdCategory" value={category} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <ActionButton type="submit" variant="secondary" className="w-full text-[12px] py-1.5">
            모두 적용
          </ActionButton>
        </form>
        <form action={createKeywordRuleAndApplyAction} className="flex-1">
          <input type="hidden" name="keyword" value={merchantKey} />
          <input type="hidden" name="stdCategory" value={category} />
          <input type="hidden" name="txnType" value={txnType} />
          <input type="hidden" name="applyToExisting" value="true" />
          {txnIds.map((id) => (
            <input key={id} type="hidden" name="applyTxnId" value={id} />
          ))}
          <input type="hidden" name="returnTo" value={returnTo} />
          <ActionButton type="submit" className="w-full text-[12px] py-1.5">
            앞으로도 자동
          </ActionButton>
        </form>
      </div>
    </div>
  );
}
