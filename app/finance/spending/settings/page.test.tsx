import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import SettingsPage from "./page";

vi.mock("@/lib/db", () => ({
  // where()는 직접 await(배열)되기도 하고, households 조회처럼 .limit(1)이 추가로 붙기도 한다.
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => Object.assign(Promise.resolve([]), { limit: () => Promise.resolve([]) }),
      }),
    }),
  }),
}));

vi.mock("@/lib/finance-db", () => ({
  budgetCategories: { householdId: "household_id" },
  categoryKeywordRules: { householdId: "household_id" },
  categoryMappings: { householdId: "household_id" },
  categoryRules: { householdId: "household_id" },
  households: { id: "id", name: "name" },
  householdMembers: { householdId: "household_id", userId: "user_id" },
  householdInvites: { householdId: "household_id" },
  users: { id: "id" },
  people: { id: "id", displayName: "display_name", householdId: "household_id" },
}));

// members-actions.ts가 signOut을 직접 import하므로, 이 페이지 테스트에서도 next-auth 실제
// 모듈이 로드되지 않도록(엣지 런타임 관련 import 에러 방지) @/auth를 목으로 대체한다.
vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

vi.mock("@/lib/spending-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/spending-queries")>()),
  getActiveTransactions: vi.fn(async () => ({ transactions: [] })),
}));

vi.mock("@/lib/require-household", () => ({
  requireHouseholdOrOnboard: vi.fn().mockResolvedValue({ userId: "test-user", householdId: "00000000-0000-4000-8000-000000000099", role: "owner", email: "test@example.com" }),
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
