import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => ({ from: () => Promise.resolve([]) }) }),
}));

vi.mock("@/lib/finance-db", () => ({
  budgetCategories: {},
  categoryMappings: {},
  categoryRules: {},
}));

vi.mock("@/lib/spending-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spending-queries")>()),
  getActiveTransactions: vi.fn(async () => ({ transactions: [] })),
}));

describe("SettingsPage", () => {
  test("파일 업로드 탭에서 바로 업로드할 수 있다", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "upload" }) }));

    expect(screen.getByLabelText("엑셀 파일")).toBeTruthy();
    expect(screen.getByRole("button", { name: "업로드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "뱅크샐러드 엑셀 파일 다운받는 방법" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "업로드 화면 열기" })).toBeNull();
  });
});
