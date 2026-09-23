import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/lib/db", () => ({
  getDb: () => ({ select: () => ({ from: () => Promise.resolve([]) }) }),
}));

vi.mock("@/lib/finance-db", () => ({
  budgetCategories: {},
  categoryKeywordRules: {},
  categoryMappings: {},
  categoryRules: {},
}));

vi.mock("@/lib/spending-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spending-queries")>()),
  getActiveTransactions: vi.fn(async () => ({ transactions: [] })),
}));

vi.mock("@/lib/require-finance-user", () => ({
  requireFinanceUser: vi.fn().mockResolvedValue({ email: "test@example.com" }),
}));

describe("SettingsPage", () => {
  test("파일 업로드 탭에서 바로 업로드할 수 있다", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "upload" }) }));

    expect(screen.getByLabelText("엑셀 파일")).toBeTruthy();
    expect(screen.getByRole("button", { name: "업로드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "뱅크샐러드 엑셀 파일 다운받는 방법" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "업로드 화면 열기" })).toBeNull();
  });

  test("사용자 규칙 탭에서 키워드 규칙과 결제수단 규칙 섹션을 렌더링한다", async () => {
    render(await SettingsPage({ searchParams: Promise.resolve({ tab: "rules" }) }));

    expect(screen.getByRole("heading", { name: "가맹점 · 적요 키워드 규칙" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "결제수단 규칙" })).toBeTruthy();
    expect(screen.getByPlaceholderText("키워드 (예: 코스트코, 이니시스)")).toBeTruthy();
  });
});
