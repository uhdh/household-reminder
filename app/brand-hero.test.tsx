import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { BrandHero } from "./brand-hero";

describe("BrandHero", () => {
  test("explains that separate household data is automatically combined", () => {
    render(<BrandHero />);

    expect(screen.getByRole("heading", { name: "가계부는 부탁만 하세요." })).toBeDefined();
    expect(screen.getByText("각자 올리면, 알아서 합쳐져요.")).toBeDefined();
    expect(screen.getByText("남편 데이터")).toBeDefined();
    expect(screen.getByText("아내 데이터")).toBeDefined();
    expect(screen.getByText("우리 가계 · 자산 · 투자")).toBeDefined();
    expect(screen.getByRole("link", { name: "파일 올리고 시작하기" }).getAttribute("href")).toBe("/finance/upload");
  });

  test("presents the combined result as an accessible three-part summary", () => {
    render(<BrandHero />);

    const flow = screen.getByRole("group", { name: "남편과 아내 데이터 통합 과정" });
    expect(flow).toBeDefined();
    expect(screen.getByText("소비 내역")).toBeDefined();
    expect(screen.getByText("자산 현황")).toBeDefined();
    expect(screen.getByText("투자 내역")).toBeDefined();
  });
});
