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

  test("선택한 월로 이동하면서 사람 필터를 유지한다", () => {
    render(<MonthlyNavigator month="2026-08" personFilter="wife" />);

    fireEvent.change(screen.getByLabelText("조회 월 선택"), { target: { value: "2026-07" } });

    expect(push).toHaveBeenCalledWith("/finance/spending/monthly?month=2026-07&person=wife");
  });
});
