import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MonthlyNavigator } from "./monthly-navigator";

const { push, useRouter } = vi.hoisted(() => ({
  push: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter }));

describe("MonthlyNavigator", () => {
  beforeEach(() => {
    push.mockReset();
    useRouter.mockReturnValue({ push });
  });

  test("달력에서 고른 월로 이동하면서 사람 필터를 유지한다", () => {
    render(<MonthlyNavigator month="2026-08" personFilter="wife" />);

    fireEvent.click(screen.getByRole("button", { name: "조회 월 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "7월" }));

    expect(push).toHaveBeenCalledWith("/finance/spending/monthly?month=2026-07&person=wife");
  });

  test("다른 해의 월도 고를 수 있고 기준 경로를 바꿀 수 있다", () => {
    render(<MonthlyNavigator month="2026-08" personFilter="all" basePath="/finance/spending" />);

    fireEvent.click(screen.getByRole("button", { name: "조회 월 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "이전 해" }));
    fireEvent.click(screen.getByRole("button", { name: "12월" }));

    expect(push).toHaveBeenCalledWith("/finance/spending?month=2025-12");
  });
});
