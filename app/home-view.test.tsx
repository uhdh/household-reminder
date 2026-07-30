import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { HomeView } from "./home-view";
import type { Section } from "@/lib/sections";

const sections: Section[] = [
  { id: "one", name: "One", icon: "1️⃣", href: "/one", getStatus: async () => ({ ready: true, label: "3" }) },
  { id: "two", name: "Two", icon: "2️⃣", href: "/two", getStatus: async () => ({ ready: false }) },
];

describe("HomeView", () => {
  test("renders section names and statuses", async () => {
    render(await HomeView({ sections }));
    expect(screen.getByText("One")).toBeDefined();
    expect(screen.getByText("Two")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});
