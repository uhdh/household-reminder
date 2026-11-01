import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { EmailInbox } from "./email-inbox";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({ uploadAction: vi.fn() }));
const { preview } = vi.hoisted(() => ({ preview: vi.fn().mockResolvedValue({ summary: "거래 2건 · 자산 1건", error: "" }) }));
vi.mock("./email-actions", () => ({ createAddressAction: vi.fn(), previewEmailAction: preview }));

test("비밀번호로 자료 확인 후에만 반영 버튼을 표시하고 비밀번호를 바꾸면 다시 확인한다", async () => {
  const user = userEvent.setup();
  render(<EmailInbox address="u_test@test.resend.app" emails={[{ id: "mail", receivedAt: "2026-10-27T00:00:00Z", status: "pending" }]} />);
  expect(screen.queryByRole("button", { name: "가계부에 반영하기" })).toBeNull();
  await user.type(screen.getByLabelText("압축 비밀번호"), " example ");
  await user.click(screen.getByRole("button", { name: "자료 확인하기" }));
  expect(preview).toHaveBeenCalledWith("mail", " example ");
  expect(await screen.findByRole("button", { name: "가계부에 반영하기" })).toBeTruthy();
  expect(screen.getByLabelText("내역의 보유자")).toHaveProperty("required", true);
  await user.type(screen.getByLabelText("압축 비밀번호"), "changed");
  expect(screen.queryByRole("button", { name: "가계부에 반영하기" })).toBeNull();
});
