import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmotionSelect } from "./emotion-select";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

function noopSave() {
  return Promise.resolve({});
}
function noopAdd() {
  return Promise.resolve({ emotion: { name: "허탈함", emoji: "💭", color: "purple" as const } });
}

describe("EmotionSelect selection limit", () => {
  test("selecting a 4th card while 3 are already selected is ignored", async () => {
    const user = userEvent.setup();
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={noopSave}
      />
    );
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    await user.click(screen.getByRole("button", { name: /편안함 선택/ }));
    expect(screen.getByText("3/3")).toBeDefined();
    expect(screen.getByRole("button", { name: /편안함 선택/ }).getAttribute("aria-pressed")).toBe("false");
  });

  test("완료 button is disabled until exactly 3 are selected", async () => {
    const user = userEvent.setup();
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={noopSave}
      />
    );
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", true);
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    expect(screen.getByRole("button", { name: "완료" })).toHaveProperty("disabled", false);
  });
});

describe("EmotionSelect complete flow", () => {
  test("clicking 완료 with 3 selected calls saveRecordAction with today's date and the 3 emotions", async () => {
    const user = userEvent.setup();
    const saveRecordAction = vi.fn().mockResolvedValue({});
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={noopAdd}
        saveRecordAction={saveRecordAction}
      />
    );
    await user.click(screen.getByRole("button", { name: /행복 선택/ }));
    await user.click(screen.getByRole("button", { name: /기쁨 선택/ }));
    await user.click(screen.getByRole("button", { name: /감사 선택/ }));
    await user.click(screen.getByRole("button", { name: "완료" }));
    expect(saveRecordAction).toHaveBeenCalledTimes(1);
    expect(saveRecordAction.mock.calls[0][0]).toBe("2026-07-28");
    expect(saveRecordAction.mock.calls[0][1].map((e: { name: string }) => e.name)).toEqual([
      "행복",
      "기쁨",
      "감사",
    ]);
  });
});

describe("EmotionSelect custom emotion flow", () => {
  test("the + tile opens a sheet; adding a name calls addCustomEmotionAction and selects the result", async () => {
    const user = userEvent.setup();
    const addCustomEmotionAction = vi
      .fn()
      .mockResolvedValue({ emotion: { name: "허탈함", emoji: "💭", color: "purple" } });
    render(
      <EmotionSelect
        today="2026-07-28"
        initialSelected={[]}
        initialCustomEmotions={[]}
        backHref="/emotion-cards"
        addCustomEmotionAction={addCustomEmotionAction}
        saveRecordAction={noopSave}
      />
    );
    await user.click(screen.getByRole("button", { name: "새 감정 추가" }));
    await user.type(screen.getByLabelText("감정 이름"), "허탈함");
    await user.click(screen.getByRole("button", { name: "추가" }));
    expect(addCustomEmotionAction).toHaveBeenCalledWith("허탈함");
    expect(screen.getByText("1/3")).toBeDefined();
    expect(screen.getByRole("button", { name: /허탈함 선택/ }).getAttribute("aria-pressed")).toBe("true");
  });
});
