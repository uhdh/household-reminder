import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardsView } from "./cards-view";
import type { Emotion } from "@/lib/emotions";

const cards: Emotion[] = [
  { name: "행복", emoji: "😊", color: "green" },
  { name: "슬픔", emoji: "😢", color: "blue" },
  { name: "화남", emoji: "😡", color: "red" },
];

describe("CardsView", () => {
  test("renders the label and all three cards", () => {
    render(<CardsView label="나" cards={cards} />);
    expect(screen.getByText("나")).toBeDefined();
    expect(screen.getByText("행복")).toBeDefined();
    expect(screen.getByText("😊")).toBeDefined();
    expect(screen.getByText("슬픔")).toBeDefined();
    expect(screen.getByText("화남")).toBeDefined();
  });

  test("tapping a card opens an overlay with its name and definition", async () => {
    const user = userEvent.setup();
    render(<CardsView label="나" cards={cards} />);
    await user.click(screen.getByRole("button", { name: /행복/ }));
    expect(screen.getByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeDefined();
  });

  test("clicking the overlay backdrop closes it", async () => {
    const user = userEvent.setup();
    render(<CardsView label="나" cards={cards} />);
    await user.click(screen.getByRole("button", { name: /행복/ }));
    expect(screen.getByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeDefined();
    await user.click(screen.getByTestId("card-overlay-backdrop"));
    expect(screen.queryByText("지금 이 순간이 즐겁고 좋게 느껴지는 마음")).toBeNull();
  });
});
