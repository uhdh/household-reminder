// deleteHouseholdData의 삭제 순서 검증: household_members.person_id가 people을 참조하므로
// 구성원(householdMembers)을 사람(people)보다 먼저 지워야 FK 위반이 나지 않는다.
import { describe, expect, test } from "vitest";
import type { AppDb } from "@/lib/db";
import { householdMembers, people } from "@/lib/finance-db";
import { deleteHouseholdData } from "./household-lifecycle";

describe("deleteHouseholdData", () => {
  test("구성원을 사람보다 먼저 지운다(person_id FK)", async () => {
    const order: unknown[] = [];
    const fakeDb = {
      delete: (table: unknown) => {
        order.push(table);
        return { where: async () => undefined };
      },
    } as unknown as AppDb;

    await deleteHouseholdData(fakeDb, "00000000-0000-4000-8000-000000000001");

    expect(order.indexOf(householdMembers)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(householdMembers)).toBeLessThan(order.indexOf(people));
  });
});
