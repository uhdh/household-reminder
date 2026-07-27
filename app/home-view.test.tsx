import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HomeView } from "./home-view";
import type { Section } from "@/lib/sections";

afterEach(cleanup);

const mockSections: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: () => ({ ready: true, label: "3" }),
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: () => ({ ready: false }),
  },
];

describe("HomeView", () => {
  test("renders every section's name and icon", () => {
    render(<HomeView sections={mockSections} />);
    expect(screen.getByText("청소 관리")).toBeDefined();
    expect(screen.getByText("🧹")).toBeDefined();
    expect(screen.getByText("감정카드")).toBeDefined();
    expect(screen.getByText("💌")).toBeDefined();
  });

  test("a ready section renders as a link to its route, showing its status label", () => {
    render(<HomeView sections={mockSections} />);
    const link = screen.getByRole("link", { name: /청소 관리/ });
    expect(link.getAttribute("href")).toBe("/cleaning");
    expect(screen.getByText("3")).toBeDefined();
  });

  test("a not-ready section shows a 준비중 badge and is not a link", () => {
    render(<HomeView sections={mockSections} />);
    expect(screen.getByText("준비중")).toBeDefined();
    expect(screen.queryByRole("link", { name: /감정카드/ })).toBeNull();
  });
});
