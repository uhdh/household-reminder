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

  test("비공개 거래는 '비공개 거래'로만 보이고 금액은 렌더링되지 않는다", async () => {
    const { user } = await import("@testing-library/user-event").then((module) => ({ user: module.default.setup() }));

    render(
      <ul>
        <CategoryRow
          name="선물"
          budget={null}
          actual={50_000}
          transactions={[{ id: "tx-secret", description: null, amount: null, masked: true }]}
        />
      </ul>,
    );

    await user.click(screen.getByRole("button", { name: /선물/ }));

    expect(screen.getByText("비공개 거래")).toBeTruthy();
    expect(screen.queryByText("메모 없음")).toBeNull();
    // 카테고리 합계(헤더)의 50,000원은 1곳에만 보이고, 개별 행에는 금액이 없다.
    expect(screen.getAllByText("50,000원")).toHaveLength(1);
  });
});
