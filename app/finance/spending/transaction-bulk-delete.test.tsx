import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { SelectAllTransactions, TransactionBulkDeleteForm, TransactionCheckbox } from "./transaction-bulk-delete";

vi.mock("./actions", () => ({ deleteTransactionsAction: vi.fn() }));

test("selects all visible transactions and shows the selected count", async () => {
  const user = userEvent.setup();
  render(
    <TransactionBulkDeleteForm transactionIds={["one", "two"]} returnTo="/finance/spending">
      <SelectAllTransactions />
      <TransactionCheckbox transactionId="one" />
      <TransactionCheckbox transactionId="two" />
    </TransactionBulkDeleteForm>
  );

  await user.click(screen.getByRole("checkbox", { name: "현재 목록 전체 선택" }));

  expect((screen.getByRole("button", { name: "선택 삭제 (2)" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
});
