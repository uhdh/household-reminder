import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AppExperience, useAppExperience } from "./app-experience";
import { HomeEntry } from "./home-entry";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

function renderEntry(signedIn = false) {
  return render(<AppExperience><HomeEntry signedIn={signedIn}><h1>웹 소개</h1></HomeEntry></AppExperience>);
}

beforeEach(() => {
  replace.mockClear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

test("일반 웹 방문자는 소개를 보고, 로그인했다면 자산관리로 간다", async () => {
  const view = renderEntry();
  expect(screen.getByRole("heading", { name: "웹 소개" })).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
  view.unmount();
  renderEntry(true);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/finance"));
});

test.each(["query", "standalone", "twa"])("%s 앱 실행은 소개 없이 로그인 후 월별 가계부로 간다", async (mode) => {
  if (mode === "query") window.history.replaceState({}, "", "/?app=1");
  if (mode === "standalone") vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  if (mode === "twa") Object.defineProperty(document, "referrer", { configurable: true, value: "android-app://app.gagyebutak.twa/" });
  const view = renderEntry();
  expect(screen.queryByRole("heading", { name: "웹 소개" })).toBeNull();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?callbackUrl=%2Ffinance%2Fspending%2Fmonthly"));
  view.unmount();
  replace.mockClear();
  renderEntry(true);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/finance/spending/monthly"));
  expect(replace).not.toHaveBeenCalledWith("/finance");
});

test("앱 모드는 로그인·새로고침을 거쳐도 같은 탭에서 유지된다", () => {
  function Mode() { return <p>{useAppExperience() ? "앱" : "웹"}</p>; }
  window.history.replaceState({}, "", "/?app=1");
  const view = render(<AppExperience><Mode /></AppExperience>);
  expect(screen.getByText("앱")).toBeTruthy();
  view.unmount();
  window.history.replaceState({}, "", "/finance/upload");
  render(<AppExperience><Mode /></AppExperience>);
  expect(screen.getByText("앱")).toBeTruthy();
});
