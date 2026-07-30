import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChoreGrid, type ChoreViewModel } from "./chore-grid";

const baseChores: ChoreViewModel[] = [
  {
    id: 1,
    name: "빨래",
    icon: "🧺",
    intervalValue: 1,
    intervalUnit: "week",
    status: { dueDate: "2026-07-30", daysRemaining: 3, overdue: false, percent: 57 },
  },
  {
    id: 2,
    name: "화장실 청소",
    icon: "🚽",
    intervalValue: 2,
    intervalUnit: "week",
    status: { dueDate: "2026-07-20", daysRemaining: -7, overdue: true, percent: 100 },
  },
];

function noop() {
  return Promise.resolve({});
}

describe("ChoreGrid rendering", () => {
  test("renders every chore's name, icon, and D-day label", () => {
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />
    );
    expect(screen.getByText("빨래")).toBeDefined();
    expect(screen.getByText("🧺")).toBeDefined();
    expect(screen.getByText("D-3")).toBeDefined();
    expect(screen.getByText("화장실 청소")).toBeDefined();
    expect(screen.getByText("D+7")).toBeDefined();
    expect(screen.queryByRole("button", { name: "빨래 수정" })).toBeNull();
  });

  test("shows an overdue badge only for overdue chores", () => {
    render(
      <ChoreGrid chores={baseChores} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />
    );
    const cards = screen.getAllByRole("button", { name: /완료 처리/ });
    expect(cards[0].textContent).not.toContain("!");
    expect(cards[1].textContent).toContain("!");
  });
});

describe("ChoreGrid complete flow", () => {
  test("clicking a card opens a confirm toast, and confirming calls completeAction with the card's id", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn().mockResolvedValue(undefined);
    render(
      <ChoreGrid
        chores={baseChores}
        completeAction={completeAction}
        createAction={noop}
        updateAction={noop}
        deleteAction={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "빨래 완료 처리" }));
    expect(screen.getByText("빨래 완료로 표시할까요?")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "완료로 표시" }));
    expect(completeAction).toHaveBeenCalledTimes(1);
    expect(completeAction.mock.calls[0][0]).toBe(1);
    expect(typeof completeAction.mock.calls[0][1]).toBe("string");
  });

  test("clicking cancel in the toast calls nothing", async () => {
    const user = userEvent.setup();
    const completeAction = vi.fn();
    render(
      <ChoreGrid
        chores={baseChores}
        completeAction={completeAction}
        createAction={noop}
        updateAction={noop}
        deleteAction={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "빨래 완료 처리" }));
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(completeAction).not.toHaveBeenCalled();
    expect(screen.queryByText("빨래 완료로 표시할까요?")).toBeNull();
  });
});

describe("ChoreGrid add flow", () => {
  test("the + tile opens a create form; submitting valid input calls createAction", async () => {
    const user = userEvent.setup();
    const createAction = vi.fn().mockResolvedValue({});
    render(
      <ChoreGrid chores={[]} completeAction={vi.fn()} createAction={createAction} updateAction={noop} deleteAction={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "새로운 집안일 추가" }));
    await user.type(screen.getByLabelText("이름"), "빨래");
    await user.type(screen.getByLabelText("이모지"), "🧺");
    await user.clear(screen.getByLabelText("주기 값"));
    await user.type(screen.getByLabelText("주기 값"), "1");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(createAction).toHaveBeenCalledTimes(1);
    const submittedFormData = createAction.mock.calls[0][0] as FormData;
    expect(submittedFormData.get("name")).toBe("빨래");
    expect(submittedFormData.get("icon")).toBe("🧺");
    expect(submittedFormData.get("intervalValue")).toBe("1");
    expect(submittedFormData.get("intervalUnit")).toBe("week");
  });

  test("shows an empty-state message when there are no chores", () => {
    render(<ChoreGrid chores={[]} completeAction={vi.fn()} createAction={noop} updateAction={noop} deleteAction={vi.fn()} />);
    expect(screen.getByText("아직 등록된 집안일이 없어요 — + 버튼으로 추가해보세요")).toBeDefined();
  });
});
