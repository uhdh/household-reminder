import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { UploadForm } from "./upload-form";
import { FinanceEmptyState } from "../_components/empty-state";

const { appMode, upload } = vi.hoisted(() => ({ appMode: vi.fn(), upload: vi.fn() }));
vi.mock("@/app/app-experience", () => ({ useAppExperience: appMode }));
vi.mock("./actions", () => ({ uploadAction: upload }));
const people = [{ id: "me", displayName: "나" }, { id: "partner", displayName: "가족" }];

beforeEach(() => { appMode.mockReturnValue(true); upload.mockClear(); });

test("앱에서는 첫 기록과 파일 가져오기를 선택하고, 웹에서는 업로드를 우선한다", () => {
  const view = render(<FinanceEmptyState secondaryHref="/manual" secondaryLabel="직접 입력하기" />);
  expect(screen.getByRole("link", { name: "첫 내역 입력하기" }).getAttribute("href")).toBe("/finance/spending?manual=1#manual-entry");
  expect(screen.getByRole("link", { name: "자료 가져오기" }).getAttribute("href")).toBe("/finance/upload");
  view.unmount();
  appMode.mockReturnValue(false);
  render(<FinanceEmptyState secondaryHref="/manual" secondaryLabel="직접 입력하기" />);
  expect(screen.getByRole("link", { name: "엑셀 업로드하러 가기" })).toBeTruthy();
});

test("파일 선택 후 보유자를 바꿔도 파일을 유지하고 자동 반영하지 않는다", async () => {
  const user = userEvent.setup();
  render(<UploadForm people={people} />);
  const file = new File(["test workbook"], "가계부.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await user.upload(screen.getByLabelText("엑셀 또는 ZIP 파일"), file);
  expect(screen.getByText("선택한 파일: 가계부.xlsx")).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
  await user.click(screen.getByRole("radio", { name: "가족" }));
  expect((screen.getByLabelText("엑셀 또는 ZIP 파일") as HTMLInputElement).files?.[0]).toBe(file);
  expect((screen.getByRole("radio", { name: "가족" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "가계부에 반영하기" })).toBeTruthy();
  expect(upload).not.toHaveBeenCalled();
});

test("PC 링크는 앱 진입 표시 없이 복사하고, 복사 실패 시 직접 선택할 수 있다", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
  render(<UploadForm people={people} />);
  await user.click(screen.getByText("PC에서 올릴래요"));
  await user.click(screen.getByRole("button", { name: "PC 업로드 주소 복사" }));
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/finance/upload`);
  expect((screen.getByLabelText("PC 업로드 주소") as HTMLInputElement).value).not.toContain("app=1");
  expect(screen.getByText(/아래 주소를 길게 눌러/)).toBeTruthy();
});

test("데모용 빈 화면은 앱에서도 로그인 안내를 유지한다", () => {
  render(<FinanceEmptyState title="샘플 준비 중" primaryHref="/login" primaryLabel="로그인하러 가기" />);
  expect(screen.getByRole("link", { name: "로그인하러 가기" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "첫 내역 입력하기" })).toBeNull();
});
