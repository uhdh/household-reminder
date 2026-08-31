import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SpendingNav } from "./finance/spending/nav";
import { TopTabs } from "./top-tabs";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname }));

describe("finance navigation labels", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/finance/spending");
  });

  test.each([
    ["주요 메뉴", TopTabs],
    ["지출 분석 메뉴", SpendingNav],
  ])("%s에서 이해하기 쉬운 내역 이름을 사용한다", (navigationName, Navigation) => {
    render(<Navigation />);

    const navigation = screen.getByRole("navigation", { name: navigationName });
    expect(navigation.querySelector('a[href="/finance/spending"]')?.textContent).toBe("세부 내역");
    expect(navigation.querySelector('a[href="/finance/spending/yearly"]')?.textContent).toBe("연간 내역");
  });
});
