import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { CategoryRow } from "./category-row";

describe("CategoryRow", () => {
  test("카테고리를 펼치면 결제자 요약 대신 거래 메모와 금액을 보여준다", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({ user: module.default.setup() }));

    render(
      <ul>
        <CategoryRow
          name="생필품"
          budget={100_000}
          actual={102_220}
          scaleMax={200}
          transactions={[
            { id: "tx-1", description: "세탁세제", amount: 52_900 },
            { id: "tx-2", description: null, amount: 49_320 },
          ]}
        />
      </ul>,
    );

    await user.click(screen.getByRole("button", { name: /생필품/ }));

    expect(screen.getByText("세탁세제")).toBeTruthy();
    expect(screen.getByText("52,900원")).toBeTruthy();
    expect(screen.getByText("메모 없음")).toBeTruthy();
    expect(screen.queryByText("결제한 사람")).toBeNull();
    expect(screen.queryByText("사용 대상")).toBeNull();
  });
});
