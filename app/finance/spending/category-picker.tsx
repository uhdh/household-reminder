"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CategoryIcon } from "./category-icon";
import { buildFlatOptionOrder, displayCategoryLabel } from "./category-suggest";

export type CategoryOption = { name: string; kind: string };

const EXCLUDE_VALUE = "자산수정";

function groupByKind(options: CategoryOption[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const o of options) {
    (groups[o.kind] ??= []).push(o.name);
  }
  return groups;
}

// 칩 클릭 시 데스크톱은 앵커 팝오버, 모바일(sm 미만)은 바텀시트로 여는 카테고리 선택기.
// 검색 → 추천 → 자주 쓰는 → kind별 아이콘 그리드 → 집계 제외 버튼 순으로 보여준다.
export function CategoryPicker({
  value,
  options,
  recommendations = [],
  frequentCategories = [],
  onSelect,
  ariaLabel,
  triggerLabel,
  triggerClassName = "",
  autoOpen = false,
  disabled = false,
  allowUnclassified = true,
  clearLabel = "미분류로 되돌리기",
  showExclude = true,
  className = "relative inline-block",
}: {
  value: string | null;
  options: CategoryOption[];
  recommendations?: string[];
  frequentCategories?: string[];
  onSelect: (name: string | null) => void;
  ariaLabel: string;
  triggerLabel?: ReactNode;
  triggerClassName?: string;
  autoOpen?: boolean;
  disabled?: boolean;
  allowUnclassified?: boolean;
  clearLabel?: string;
  showExclude?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  // 분류 모드에서 행을 저장→redirect하면 목록이 바뀌면서 "다음 미분류" 행이 이전과 같은 key(txnId)를
  // 가진 컴포넌트로 재사용될 수 있다(React가 리마운트하지 않음) — 이 경우 useState 초기값만으로는
  // 다시 안 열린다. 렌더 중 이전 autoOpen과 비교해 바뀌었을 때만 반영하는 React 공식 패턴을 써서
  // 이펙트 안에서 setState하지 않고(react-hooks/set-state-in-effect 위반 방지) 처리한다.
  const [prevAutoOpen, setPrevAutoOpen] = useState(autoOpen);
  if (autoOpen !== prevAutoOpen) {
    setPrevAutoOpen(autoOpen);
    if (autoOpen) setOpen(true);
  }
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const gridOptions = useMemo(() => options.filter((o) => o.name !== EXCLUDE_VALUE), [options]);
  const grouped = useMemo(() => groupByKind(gridOptions), [gridOptions]);
  const orderedNames = useMemo(
    () => buildFlatOptionOrder(query, gridOptions, recommendations, frequentCategories),
    [query, gridOptions, recommendations, frequentCategories]
  );

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(name: string | null) {
    onSelect(name);
    setOpen(false);
    setQuery("");
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, orderedNames.length - 1));
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const name = orderedNames[activeIndex];
      if (name) choose(name);
    }
  }

  const recVisible = query.trim()
    ? []
    : recommendations.filter((name) => gridOptions.some((o) => o.name === name)).slice(0, 3);
  const freqVisible = query.trim()
    ? []
    : frequentCategories.filter((name) => gridOptions.some((o) => o.name === name) && !recVisible.includes(name)).slice(0, 6);

  function optionButton(name: string) {
    const idx = orderedNames.indexOf(name);
    const active = idx === activeIndex;
    const selected = name === value;
    return (
      <button
        key={name}
        type="button"
        role="option"
        aria-selected={selected}
        onMouseEnter={() => setActiveIndex(idx)}
        onClick={() => choose(name)}
        className={`flex items-center gap-1 rounded-r2 border px-2 py-1 text-[12px] font-semibold ${
          selected ? "border-fg-brand bg-bg-brand-weak text-fg-brand" : "border-transparent bg-bg-neutral-weak text-ink"
        } ${active ? "outline outline-2 outline-offset-1 outline-fg-brand" : ""}`}
      >
        <CategoryIcon name={name} size={14} />
        {name}
      </button>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setActiveIndex(0);
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={triggerClassName}
      >
        {triggerLabel ?? (
          <>
            <CategoryIcon name={value} size={14} className="shrink-0" />
            {displayCategoryLabel(value)}
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col gap-3 overflow-auto rounded-t-r5 bg-bg-layer-floating p-4 text-left shadow-2xl sm:absolute sm:inset-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-96 sm:w-72 sm:rounded-r3 sm:border sm:border-hairline sm:p-3"
          >
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="카테고리 검색"
              aria-label="카테고리 검색"
              className="seed-input text-[13px]"
            />

            {allowUnclassified && value !== null && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="self-start text-[11px] font-medium text-ink-muted hover:text-ink"
              >
                {clearLabel}
              </button>
            )}

            {recVisible.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-ink-muted">추천</p>
                <div role="listbox" aria-label="추천 카테고리" className="flex flex-wrap gap-1.5">
                  {recVisible.map((name) => optionButton(name))}
                </div>
              </div>
            )}

            {freqVisible.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold text-ink-muted">자주 쓰는</p>
                <div role="listbox" aria-label="자주 쓰는 카테고리" className="flex flex-wrap gap-1.5">
                  {freqVisible.map((name) => optionButton(name))}
                </div>
              </div>
            )}

            <div role="listbox" aria-label="전체 카테고리" className="flex flex-col gap-2">
              {query.trim() ? (
                <div className="flex flex-wrap gap-1.5">
                  {orderedNames.length === 0 && <p className="text-[12px] text-ink-muted">일치하는 카테고리가 없습니다.</p>}
                  {orderedNames.map((name) => optionButton(name))}
                </div>
              ) : (
                Object.entries(grouped).map(([kind, names]) => (
                  <div key={kind}>
                    <p className="mb-1 text-[11px] font-semibold text-ink-muted">{kind}</p>
                    <div className="flex flex-wrap gap-1.5">{names.map((name) => optionButton(name))}</div>
                  </div>
                ))
              )}
            </div>

            {showExclude && <button
              type="button"
              onClick={() => choose(EXCLUDE_VALUE)}
              className="mt-1 rounded-r2 border border-dashed border-stroke-neutral-muted px-2 py-1.5 text-[12px] font-semibold text-ink-muted hover:border-fg-brand hover:text-fg-brand"
            >
              집계 제외 (내 계좌 이동·투자)
            </button>}
          </div>
        </>
      )}
    </div>
  );
}
