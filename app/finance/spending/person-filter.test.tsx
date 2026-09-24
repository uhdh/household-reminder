import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { PersonFilter } from "./person-filter";

describe("PersonFilter", () => {
  test("1인 가구는 필터를 숨긴다", () => {
    const { container } = render(
      <PersonFilter pathname="/finance/spending" periodKey="month" periodValue="2026-09" selected="all" displayNameByPerson={new Map([["solo", "나"]])} />
    );
    expect(container.innerHTML).toBe("");
  });

  test("2인 가구는 전체 + 2명 탭을 보여준다", () => {
    render(
      <PersonFilter
        pathname="/finance/spending"
        periodKey="month"
        periodValue="2026-09"
        selected="husband"
        displayNameByPerson={
          new Map([
            ["husband", "남편"],
            ["wife", "아내"],
          ])
        }
      />
    );
    expect(screen.getByRole("link", { name: "전체" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "남편" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "아내" })).toBeTruthy();
  });

  test("3인 가구는 전체 + 3명 탭을 모두 보여준다", () => {
    render(
      <PersonFilter
        pathname="/finance/spending"
        periodKey="month"
        periodValue="2026-09"
        selected="all"
        displayNameByPerson={
          new Map([
            ["p1", "엄마"],
            ["p2", "아빠"],
            ["p3", "첫째"],
          ])
        }
      />
    );
    expect(screen.getByRole("link", { name: "엄마" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "아빠" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "첫째" })).toBeTruthy();
  });
});
