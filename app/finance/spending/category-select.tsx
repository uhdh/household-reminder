"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui";
import { suggestKeywordFromDescription } from "@/lib/spending-derive";
import { createKeywordRuleAndApplyAction, updateTransactionCategoryAction, updateTransactionsCategoryAction } from "./actions";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { displayCategoryLabel } from "./category-suggest";

export const UNMAPPED_VALUE = "__미분류__";

// 세부 내역 목록처럼 같은 가구 공통 데이터(카테고리 목록·자주 쓰는 카테고리)를 행마다 반복해서
// prop으로 내려보내지 않도록 Provider로 한 번만 전달한다. options/frequentCategories를 직접
// 넘기면(테스트 등) 그 값을 우선하고, 없으면 이 컨텍스트 값을 쓴다.
type CategoryOptionsValue = { options: CategoryOption[]; frequentCategories: string[] };
const CategoryOptionsContext = createContext<CategoryOptionsValue | null>(null);

export function CategoryOptionsProvider({
  options,
  frequentCategories = [],
  children,
}: {
  options: CategoryOption[];
  frequentCategories?: string[];
  children: ReactNode;
}) {
  return <CategoryOptionsContext value={{ options, frequentCategories }}>{children}</CategoryOptionsContext>;
}

export function CategorySelect({
  txnId,
  value,
  options,
  returnTo,
  description,
  txnType = "지출",
  recommendations = [],
  frequentCategories,
  sameMerchantCount = 0,
  autoOpen = false,
  readOnly = false,
}: {
  txnId: string;
  value: string | null;
  options?: CategoryOption[];
  returnTo: string;
  description?: string | null;
  txnType?: string;
  recommendations?: string[];
  frequentCategories?: string[];
  /** 같은 가맹점(설명 정규화)+같은 txnType의 다른 거래 건수(자기 자신 제외). 병합 토스트 노출 여부 판단용. */
  sameMerchantCount?: number;
  autoOpen?: boolean;
  /** true면 샘플(데모) 데이터 - 값만 보여주고 변경 UI는 렌더하지 않는다. */
  readOnly?: boolean;
}) {
  const shared = useContext(CategoryOptionsContext);
  const resolvedOptions = options ?? shared?.options ?? [];
  const resolvedFrequent = frequentCategories ?? shared?.frequentCategories ?? [];
  const formRef = useRef<HTMLFormElement>(null);
  const stdCategoryInputRef = useRef<HTMLInputElement>(null);
  const returnToInputRef = useRef<HTMLInputElement>(null);

  function handleSelect(name: string | null) {
    if (name === (value ?? null)) return; // 값이 그대로면 저장하지 않음

    // 같은 가맹점+같은 txnType의 다른 거래가 있으면, 저장 후 돌아온 화면에서 일괄 적용 토스트를
    // 띄우도록 returnTo에 쿼리를 실어 보낸다(서버 액션이 redirect()로 이동하므로 클라이언트
    // 상태로는 못 넘긴다). sameMerchantCount는 page.tsx가 findMatchingTransactionIds와 같은
    // (가맹점 키, txnType) 기준으로 미리 세어 내려준 값이라, 여기서 0건이면 실제 대상도 0건이다.
    const merchantKey = suggestKeywordFromDescription(description);
    const canSuggestMerge = name !== null && sameMerchantCount > 0;
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

  if (readOnly) {
    return <span className={`${chipClassName} cursor-default hover:bg-transparent`}>{displayCategoryLabel(value)}</span>;
  }

  return (
    <form ref={formRef} action={updateTransactionCategoryAction} className="inline-block">
      <input type="hidden" name="txnId" value={txnId} />
      <input ref={stdCategoryInputRef} type="hidden" name="stdCategory" defaultValue={value ?? UNMAPPED_VALUE} />
      <input ref={returnToInputRef} type="hidden" name="returnTo" defaultValue={returnTo} />
      <CategoryPicker
        value={value}
        options={resolvedOptions}
        recommendations={recommendations}
        frequentCategories={resolvedFrequent}
        onSelect={handleSelect}
        ariaLabel={`카테고리 변경, 현재 ${displayCategoryLabel(value)}`}
        triggerClassName={chipClassName}
        autoOpen={autoOpen}
      />
    </form>
  );
}

const TOAST_AUTO_DISMISS_MS = 6000;

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
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  // 토스트 쿼리(toastMerchant 등)가 빠진 원래 returnTo로 돌아간다. 과거에는 raw
  // window.history.replaceState를 직접 호출했는데, Next의 App Router가 history.replaceState를
  // 가로채 ACTION_RESTORE를 디스패치하는 방식이라(app-router.js) 라우터 내부 트리 상태와
  // 어긋나면서 이후 <Link> 클릭이 먹통이 되는 문제가 있었다. 이 코드베이스의 기존 패턴
  // (monthly-navigator.tsx 등)과 동일하게 router.replace를 통해 이동한다.
  const close = useCallback(() => {
    setVisible(false);
    router.replace(returnTo, { scroll: false });
  }, [router, returnTo]);

  useEffect(() => {
    const timer = setTimeout(close, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [close]);

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
