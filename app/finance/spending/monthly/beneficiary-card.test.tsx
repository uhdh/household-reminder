import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { BeneficiaryCard } from "./beneficiary-card";

describe("BeneficiaryCard", () => {
  test("사람별 개인 지출·한도·초과 금액과 공동 지출을 보여주고, 사람을 누르면 세부 내역 필터로 이동한다", () => {
    render(
      <BeneficiaryCard
        month="2026-08"
        summary={{
          rows: [
            { id: "husband", label: "남편", spent: 60000, allowance: 50000, over: 10000 },
            { id: "wife", label: "아내", spent: 30000, allowance: null, over: 0 },
          ],
          joint: 70000,
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "개인 지출 현황" })).toBeTruthy();
    expect(screen.getByText("초과 10,000원")).toBeTruthy();
    expect(screen.getByText(/한도 50,000원/)).toBeTruthy();
    expect(screen.getByText("공동")).toBeTruthy();
    expect(screen.getByText("70,000원")).toBeTruthy();
    const link = screen.getByRole("link", { name: /남편/ });
    expect(link.getAttribute("href")).toBe("/finance/spending?month=2026-08&flow=expense&beneficiary=husband");
    expect(screen.queryByText(/초과 0원/)).toBeNull();
  });
});
