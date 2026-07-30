import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SupplyGrid, type SupplyViewModel } from "./supply-grid";

const baseSupplies: SupplyViewModel[] = [
  {
    id: 1,
    category: "bathroom",
    name: "칫솔",
    icon: "🪥",
    status: { dueDate: "2026-07-30", daysRemaining: 3, overdue: false, percent: 57 },
  },
  {
    id: 2,
    category: "kitchen",
    name: "고무장갑",
    icon: "🧤",
    status: { dueDate: "2026-07-20", daysRemaining: -7, overdue: true, percent: 100 },
  },
];

describe("SupplyGrid rendering", () => {
  test("renders every supply's name, icon, and D-day label in one grid", () => {
    render(<SupplyGrid supplies={baseSupplies} completeAction={vi.fn()} />);
    expect(screen.getByText("칫솔")).toBeDefined();
    expect(screen.getByText("🪥")).toBeDefined();
    expect(screen.getByText("D-3")).toBeDefined();
    expect(screen.getByText("고무장갑")).toBeDefined();
    expect(screen.getByText("D+7")).toBeDefined();
  });

  test("shows an overdue badge only for overdue supplies", () => {
    render(<SupplyGrid supplies={baseSupplies} completeAction={vi.fn()} />);
    const cards = screen.getAllByRole("button", { name: /완료 처리/ });
    expect(cards[0].textContent).not.toContain("!");
    expect(cards[1].textContent).toContain("!");
  });

  test("uses three columns on mobile", () => {
    render(<SupplyGrid supplies={baseSupplies} completeAction={vi.fn()} />);
    expect(screen.getByRole("list").className).toContain("grid-cols-3");
  });
});

describe("SupplyGrid complete flow", () => {
  test("clicking a card opens a confirm toast, and confirming calls completeAction with the card's id", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn().mockResolvedValue(undefined);
    render(<SupplyGrid supplies={baseSupplies} completeAction={completeAction} />);

    await user.click(screen.getByRole("button", { name: "칫솔 완료 처리" }));
    expect(screen.getByText("칫솔 교체(관리) 완료로 표시할까요?")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "완료로 표시" }));
    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(completeAction.mock.calls[0][0]).toBe(1);
    expect(typeof completeAction.mock.calls[0][1]).toBe("string");
  });

  test("clicking cancel in the toast calls nothing", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn();
    render(<SupplyGrid supplies={baseSupplies} completeAction={completeAction} />);

    await user.click(screen.getByRole("button", { name: "칫솔 완료 처리" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(completeAction).not.toHaveBeenCalled();
    expect(screen.queryByText("칫솔 교체(관리) 완료로 표시할까요?")).toBeNull();
  });
});
