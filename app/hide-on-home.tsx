"use client";

import { usePathname } from "next/navigation";

// 소개 페이지("/")는 자체 상단바를 쓰므로 앱 공통 헤더를 숨긴다.
export function HideOnHome({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? null : children;
}
