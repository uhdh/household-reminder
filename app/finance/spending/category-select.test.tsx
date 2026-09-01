import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategorySelect } from "./category-select";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

describe("CategorySelect", () => {
  const options = [
    { name: "식비", kind: "변동비" },
    { name: "식재료", kind: "변동비" },
    { name: "렌트카", kind: "변동비" },
  ];

  it("shows rule registration modal when user selects a new category on a transaction with description", async () => {
    const { user } = await import("@testing-library/user-event").then((m) => ({
      user: m.default.setup(),
    }));

    render(
      <CategorySelect
        txnId="tx-1"
        value="식비"
        options={options}
        returnTo="/finance/spending"
        description="(주)이니시스(빌링_일반)"
        txnType="지출"
      />
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeTruthy();

    // Change category to 렌트카
    await user.selectOptions(select, "렌트카");

    // Modal should appear
    expect(screen.getByText("카테고리 규칙으로 등록할까요?")).toBeTruthy();
    expect(screen.getByDisplayValue("이니시스(빌링_일반)")).toBeTruthy();
    expect(screen.getAllByText("렌트카").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "규칙으로 저장 & 적용" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이번 건만 변경" })).toBeTruthy();

    // Cancel modal
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByText("카테고리 규칙으로 등록할까요?")).toBeNull();
  });
});
