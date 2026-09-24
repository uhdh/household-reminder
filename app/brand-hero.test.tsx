import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/auth", () => ({ signIn: vi.fn() }));
import { BrandHero } from "./brand-hero";

describe("BrandHero", () => {
  test("소개 문구와 시작/둘러보기 버튼, 로그인 링크를 보여준다", () => {
    render(<BrandHero />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("가계부는 부탁만 하세요.");
    expect(screen.getByRole("button", { name: "Google로 무료 시작하기" })).toBeDefined();
    expect(screen.getByRole("link", { name: "로그인 없이 둘러보기" }).getAttribute("href")).toBe("/finance");
    expect(screen.getByRole("button", { name: "로그인" })).toBeDefined();
    expect(screen.getByText("예시 화면")).toBeDefined();
  });
});
