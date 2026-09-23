import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import UploadPage from "./page";

vi.mock("@/lib/require-finance-user", () => ({
  requireFinanceUser: vi.fn().mockResolvedValue({ email: "test@example.com" }),
}));

describe("UploadPage", () => {
  test("shows the official BankSalad spreadsheet download steps below the upload form", async () => {
    render(await UploadPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", {
        name: "뱅크샐러드 엑셀 파일 다운받는 방법",
      }),
    ).toBeDefined();
    expect(screen.getByText("가계부")).toBeDefined();
    expect(screen.getByText("상단 톱니바퀴")).toBeDefined();
    expect(screen.getByText("파일로 받기")).toBeDefined();
    expect(screen.getByText(/한 번에 최대 1년/)).toBeDefined();

    const officialGuide = screen.getByRole("link", {
      name: "뱅크샐러드 공식 안내 보기",
    });
    expect(officialGuide.getAttribute("href")).toBe(
      "https://help.banksalad.com/207",
    );
  });
});
