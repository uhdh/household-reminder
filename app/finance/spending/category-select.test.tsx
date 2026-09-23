import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CategorySelect } from "./category-select";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("./actions", () => ({
  updateTransactionCategoryAction: vi.fn(),
  updateTransactionsCategoryAction: vi.fn(),
  createKeywordRuleAndApplyAction: vi.fn(),
}));

describe("CategorySelect", () => {
  const options = [
    { name: "식비", kind: "변동비" },
    { name: "식재료", kind: "변동비" },
    { name: "렌트카", kind: "변동비" },
  ];

  it("opens the picker from the chip with the search box focused", async () => {
    const user = userEvent.setup();
    render(<CategorySelect txnId="tx-1" value="식비" options={options} returnTo="/finance/spending" description="스타벅스" />);

    await user.click(screen.getByRole("button", { name: /카테고리 변경/ }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    const search = screen.getByRole("textbox", { name: "카테고리 검색" });
    expect(document.activeElement).toBe(search);
  });

  it("filters options by search query", async () => {
    const user = userEvent.setup();
    render(<CategorySelect txnId="tx-1" value="식비" options={options} returnTo="/finance/spending" description="스타벅스" />);

    await user.click(screen.getByRole("button", { name: /카테고리 변경/ }));
    await user.type(screen.getByRole("textbox", { name: "카테고리 검색" }), "식");

    expect(screen.getByRole("option", { name: /식비/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /식재료/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /렌트카/ })).toBeNull();
  });

  it("closes the picker on Escape without saving", async () => {
    const user = userEvent.setup();
    render(<CategorySelect txnId="tx-1" value={null} options={options} returnTo="/finance/spending" description={null} />);

    await user.click(screen.getByRole("button", { name: /카테고리 변경/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the 집계 제외 button for excluding from totals", async () => {
    const user = userEvent.setup();
    render(<CategorySelect txnId="tx-1" value="식비" options={options} returnTo="/finance/spending" description={null} />);

    await user.click(screen.getByRole("button", { name: /카테고리 변경/ }));
    expect(screen.getByRole("button", { name: /집계 제외/ })).toBeTruthy();
  });
});
