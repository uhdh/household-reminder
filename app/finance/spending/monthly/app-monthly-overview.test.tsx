import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AppMonthlyOverview, MonthlyAnalysis } from "./app-monthly-overview";
import MonthlyPage from "./page";

const { state } = vi.hoisted(() => ({ state: { app: true, budget: "50000" as string | null } }));
vi.mock("@/app/app-experience", () => ({ useAppExperience: () => state.app }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/require-household", () => ({ resolveFinanceViewer: async () => ({ householdId: "home", personId: "me", readOnly: false }) }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ select: () => ({ from: () => ({ where: async () => [
  { name: "식비", kind: "변동비", monthlyBudget: state.budget, sortOrder: 0 },
] }) }) }) }));
vi.mock("@/lib/spending-queries", async (original) => ({
  ...await original<typeof import("@/lib/spending-queries")>(),
  hasAnyTransaction: async () => true,
  getActiveTransactionsInRange: async () => ({
    displayNameByPerson: new Map([["me", "나"], ["partner", "가족"]]),
    transactions: [
      { id: "public", txnDate: "2026-10-19", txnTime: null, personId: "me", beneficiary: "me", txnType: "지출", stdCategory: "식비", amount: "-2000", included: true, description: "점심", masked: false },
      // 합계용 금액이 남은 조회 결과라도 개별 비공개 값은 클라이언트에 전달하면 안 된다.
      { id: "private", txnDate: "2026-10-20", txnTime: null, personId: "partner", beneficiary: "partner", txnType: "지출", stdCategory: "식비", amount: "-12345", included: true, description: "비밀 메모", masked: true },
    ],
  }),
}));

function findOverview(node: ReactNode): ReactElement<React.ComponentProps<typeof AppMonthlyOverview>> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue;
    if (child.type === AppMonthlyOverview) return child as ReactElement<React.ComponentProps<typeof AppMonthlyOverview>>;
    const found = findOverview(child.props.children);
    if (found) return found;
  }
}

beforeEach(() => { state.app = true; state.budget = "50000"; });

test("앱은 상세 분석을 눌렀을 때 표시하고 웹은 바로 표시한다", async () => {
  const view = render(<MonthlyAnalysis><h2>지출 분석 차트</h2></MonthlyAnalysis>);
  expect(screen.queryByRole("heading", { name: "지출 분석 차트" })).toBeNull();
  await userEvent.click(screen.getByText("월별 상세 분석 보기"));
  expect(await screen.findByRole("heading", { name: "지출 분석 차트" })).toBeTruthy();
  view.unmount();
  state.app = false;
  render(<MonthlyAnalysis><h2>지출 분석 차트</h2></MonthlyAnalysis>);
  expect(screen.getByRole("heading", { name: "지출 분석 차트" })).toBeTruthy();
  expect(screen.queryByText("월별 상세 분석 보기")).toBeNull();
});

test("앱 최근 내역은 최신순이며 비공개 메모·개별 금액을 클라이언트 props에서도 제거한다", async () => {
  const tree = await MonthlyPage({ searchParams: Promise.resolve({ month: "2026-10" }) });
  const overview = findOverview(tree)!;
  expect(overview.props.recent).toEqual([
    { id: "private", date: "2026-10-20", description: "비공개 거래", amount: null },
    { id: "public", date: "2026-10-19", description: "점심", amount: -2000 },
  ]);
  expect(JSON.stringify(overview.props.recent)).not.toContain("12345");
  expect(overview.props.budgetRemaining).toBe(35655);
  render(overview);
  expect(screen.getByText("35,655원 남았어요")).toBeTruthy();
  expect(screen.getByRole("link", { name: "내역 입력" }).getAttribute("href")).toContain("month=2026-10&manual=1");
  expect(screen.queryByText("비밀 메모")).toBeNull();
});

test("예산이 비어 있으면 남은 금액을 단정하지 않고 설정으로 안내한다", async () => {
  state.budget = null;
  const overview = findOverview(await MonthlyPage({ searchParams: Promise.resolve({ month: "2026-10" }) }))!;
  expect(overview.props.budgetRemaining).toBeNull();
  render(overview);
  expect(screen.getByRole("link", { name: "예산 설정하기" }).getAttribute("href")).toBe("/finance/spending/settings?tab=categories");
});

test("사람 필터를 바꿔도 가구 예산은 전체 지출로 계산하고 내역 링크에는 필터를 유지한다", async () => {
  const overview = findOverview(await MonthlyPage({ searchParams: Promise.resolve({ month: "2026-10", person: "me" }) }))!;
  expect(overview.props.budgetRemaining).toBe(35655);
  expect(overview.props.recent.map((row) => row.id)).toEqual(["public"]);
  render(overview);
  expect(screen.getByRole("link", { name: "전체 보기" }).getAttribute("href")).toBe("/finance/spending?month=2026-10&person=me");
});

test("웹에서는 앱 전용 요약을 추가하지 않는다", () => {
  state.app = false;
  render(<AppMonthlyOverview month="2026-10" totalExpense={0} budgetRemaining={0} recent={[]} readOnly={false} />);
  expect(screen.queryByRole("region", { name: "가계부 빠른 확인" })).toBeNull();
});
