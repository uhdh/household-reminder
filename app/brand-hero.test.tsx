import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { BrandHero } from "./brand-hero";

describe("BrandHero", () => {
  test("explains that separate household data is automatically combined", () => {
    render(<BrandHero />);

    expect(screen.getByRole("heading", { name: "가계부는 부탁만 하세요." })).toBeDefined();
    expect(screen.getByText("각자 올리면, 알아서 합쳐져요.")).toBeDefined();
    expect(screen.getByText("내 파일")).toBeDefined();
    expect(screen.getByText("가족 파일")).toBeDefined();
    expect(screen.getByText("우리 가계 · 자산 · 투자")).toBeDefined();
    expect(screen.getByRole("link", { name: "Google로 무료 시작하기" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: "로그인 없이 둘러보기" }).getAttribute("href")).toBe("/finance");
  });

  test("presents the combined result as an accessible three-part summary", () => {
    render(<BrandHero />);

    const flow = screen.getByRole("group", { name: "가족 데이터 통합 과정" });
    expect(flow).toBeDefined();
    expect(screen.getByText("소비 내역")).toBeDefined();
    expect(screen.getByText("자산 현황")).toBeDefined();
    expect(screen.getByText("투자 내역")).toBeDefined();
  });
});
