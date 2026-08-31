import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { useRouter } = vi.hoisted(() => ({ useRouter: vi.fn(() => ({ push: vi.fn() })) }));

vi.mock("next/navigation", () => ({ useRouter }));
import {
  DemoFinanceDashboard,
  DemoMonthlySpending,
  DemoTransactionList,
  DemoYearlySpending,
} from "./demo-pages";

describe("signed-out finance samples", () => {
  it("shows a sample asset dashboard", () => {
    render(<DemoFinanceDashboard personFilter="all" />);
    expect(screen.getByText("자산관리 샘플")).toBeTruthy();
    expect(screen.getByText("34,057만원")).toBeTruthy();
  });

  it("shows sample monthly spending", () => {
    render(<DemoMonthlySpending personFilter="all" month="2026-07" />);
    expect(screen.getByText("월별지출 샘플")).toBeTruthy();
    expect(screen.getByText("당월 저축")).toBeTruthy();
  });

  it("shows read-only sample transactions", () => {
    render(<DemoTransactionList personFilter="all" />);
    expect(screen.getByText("세부 내역 샘플")).toBeTruthy();
    expect(screen.getByText("샘플 내역은 수정되지 않아요")).toBeTruthy();
  });

  it("shows a sample yearly chart", () => {
    render(<DemoYearlySpending personFilter="all" />);
    expect(screen.getByText("연간 내역 샘플")).toBeTruthy();
    expect(screen.getByText("월별 수입 · 지출")).toBeTruthy();
  });
});
