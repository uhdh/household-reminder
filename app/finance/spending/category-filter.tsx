"use client";

import { useState } from "react";
import { CategoryIcon } from "./category-icon";
import { CategoryPicker, type CategoryOption } from "./category-picker";

const UNCLASSIFIED = "미분류";

// 세부 내역 필터의 카테고리 선택. 거래 분류와 같은 CategoryPicker를 쓰고, 선택값은 GET 폼의
// hidden input(name="category")으로 넘긴다. "all" = 전체.
export function CategoryFilter({
  defaultValue,
  options,
  frequentCategories,
}: {
  defaultValue: string;
  options: CategoryOption[];
  frequentCategories: string[];
}) {
  const [value, setValue] = useState(defaultValue);
  const selected = value === "all" ? null : value;

  return (
    <>
      <input type="hidden" name="category" value={value} />
      <CategoryPicker
        value={selected}
        options={[{ name: UNCLASSIFIED, kind: "분류 안 됨" }, ...options]}
        frequentCategories={frequentCategories}
        onSelect={(name) => setValue(name ?? "all")}
        ariaLabel="카테고리 필터"
        clearLabel="전체 카테고리 보기"
        showExclude={false}
        className="mt-1.5 block w-full"
        triggerClassName="seed-input flex min-h-11 w-full items-center gap-1.5 px-3 py-2 text-left text-[14px] text-ink"
        triggerLabel={
          selected ? (
            <>
              <CategoryIcon name={selected} size={16} className="shrink-0" />
              <span className="truncate">{selected}</span>
            </>
          ) : (
            <span>전체</span>
          )
        }
      />
    </>
  );
}
