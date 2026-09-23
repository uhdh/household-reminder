import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategoryPicker } from "./category-picker";

describe("CategoryPicker", () => {
  const options = [
    { name: "식비", kind: "변동비" },
    { name: "식재료", kind: "변동비" },
    { name: "카페", kind: "변동비" },
  ];

  it("calls onSelect when a grid option is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryPicker value={null} options={options} onSelect={onSelect} ariaLabel="카테고리 선택" />);

    await user.click(screen.getByRole("button", { name: "카테고리 선택" }));
    await user.click(screen.getByRole("option", { name: /식비/ }));

    expect(onSelect).toHaveBeenCalledWith("식비");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows recommended and frequent sections, and picks the active option on Enter", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <CategoryPicker
        value={null}
        options={options}
        recommendations={["카페"]}
        frequentCategories={["식재료"]}
        onSelect={onSelect}
        ariaLabel="카테고리 선택"
      />
    );

    await user.click(screen.getByRole("button", { name: "카테고리 선택" }));
    expect(screen.getByText("추천")).toBeTruthy();
    expect(screen.getByText("자주 쓰는")).toBeTruthy();

    // 검색창에 포커스된 상태에서 Enter → 첫 순서(추천 1순위)가 선택된다.
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("카페");
  });

  it("lets the user exclude the transaction from totals", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryPicker value="식비" options={options} onSelect={onSelect} ariaLabel="카테고리 선택" />);

    await user.click(screen.getByRole("button", { name: "카테고리 선택" }));
    await user.click(screen.getByRole("button", { name: /집계 제외/ }));

    expect(onSelect).toHaveBeenCalledWith("자산수정");
  });

  it("reopens when autoOpen flips from false to true on an already-mounted instance", () => {
    // 분류 모드에서 같은 key(txnId)를 가진 컴포넌트가 재사용될 때(리마운트 없이) autoOpen이
    // false→true로 바뀌어도 다시 열려야 한다(useState 초기값만으로는 반영되지 않는 버그 회귀 테스트).
    const onSelect = vi.fn();
    const { rerender } = render(
      <CategoryPicker value={null} options={options} onSelect={onSelect} ariaLabel="카테고리 선택" autoOpen={false} />
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(<CategoryPicker value={null} options={options} onSelect={onSelect} ariaLabel="카테고리 선택" autoOpen={true} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
