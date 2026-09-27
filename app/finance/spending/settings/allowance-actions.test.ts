// 월 용돈 한도 검증(PGlite): 본인 프로필만 수정, 빈 값은 한도 해제, 잘못된 값은 저장하지 않는다.
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb, setDbForTesting } from "@/lib/db";
import { people } from "@/lib/finance-db";
import { createPrivateSchema, H, seedPrivateHousehold } from "@/lib/spending-private-fixtures";

const mockRequireHousehold = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/require-household", () => ({ requireHousehold: mockRequireHousehold }));
// members-actions.ts가 signOut을 import하므로 next-auth 실제 모듈이 로드되지 않게 목으로 대체한다.
vi.mock("@/auth", () => ({ auth: vi.fn(), signOut: vi.fn() }));

const asViewer = (personId: string | null) =>
  mockRequireHousehold.mockResolvedValue({ userId: "u", householdId: H, role: "member", email: "t@example.com", personId });

async function run(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REDIRECT:")) return e.message.slice(9);
    throw e;
  }
  return null;
}
const allowanceOf = async (id: string) => (await getDb().select().from(people).where(eq(people.id, id)))[0].monthlyAllowance;
const form = (allowance: string) => {
  const f = new FormData();
  f.set("allowance", allowance);
  return f;
};

describe("setAllowanceAction", () => {
  beforeEach(async () => {
    const db = drizzle();
    setDbForTesting(db);
    await createPrivateSchema(db);
    await seedPrivateHousehold(db);
  });
  afterEach(() => {
    setDbForTesting(null);
    mockRequireHousehold.mockReset();
  });

  test("본인 프로필의 한도만 바뀐다(파트너 한도는 그대로)", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("300,000")));
    expect(await allowanceOf("husband")).toBe(300000);
    expect(await allowanceOf("wife")).toBeNull();
  });

  test("빈 값은 한도 해제, 0원은 유효한 한도다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("100000")));
    await run(setAllowanceAction(form("")));
    expect(await allowanceOf("husband")).toBeNull();
    await run(setAllowanceAction(form("0")));
    expect(await allowanceOf("husband")).toBe(0);
  });

  test("음수·소수·너무 큰 값·숫자가 아닌 값은 저장하지 않고 오류로 돌려보낸다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer("husband");
    await run(setAllowanceAction(form("50000")));
    for (const bad of ["-1", "1.5", "1000000000", "abc"]) {
      const url = await run(setAllowanceAction(form(bad)));
      expect(url).toContain("allowanceError=");
    }
    expect(await allowanceOf("husband")).toBe(50000);
  });

  test("프로필과 연결되지 않은 계정은 저장할 수 없다", async () => {
    const { setAllowanceAction } = await import("./members-actions");
    asViewer(null);
    const url = await run(setAllowanceAction(form("50000")));
    expect(url).toContain("allowanceError=");
    expect(await allowanceOf("husband")).toBeNull();
    expect(await allowanceOf("wife")).toBeNull();
  });
});
