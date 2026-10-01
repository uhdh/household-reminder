"use client";

import Form from "next/form";
import type { ReactNode } from "react";

// 세부 내역 필터: 드롭다운을 바꾸면 바로 적용한다(검색어는 Enter). next/form이라 전체 새로고침 없이
// 같은 경로의 검색 파라미터만 바꿔 이동하고, 필터를 바꿀 때마다 기록이 쌓이지 않게 replace한다.
export function FilterForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Form
      action="/finance/spending"
      replace
      scroll={false}
      className={className}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </Form>
  );
}
