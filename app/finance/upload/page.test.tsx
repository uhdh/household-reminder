import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import UploadPage from "./page";

vi.mock("@/lib/require-household", () => ({
  requireHouseholdOrOnboard: vi.fn().mockResolvedValue({ userId: "test-user", householdId: "00000000-0000-4000-8000-000000000099", role: "owner", email: "test@example.com" }),
}));

vi.mock("@/lib/spending-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spending-queries")>()),
  getHouseholdPeople: vi.fn().mockResolvedValue([
    { id: "husband", displayName: "남편" },
    { id: "wife", displayName: "아내" },
  ]),
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
