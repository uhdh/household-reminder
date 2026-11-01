// @vitest-environment node
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import { afterEach, expect, test, vi } from "vitest";
import { setDbForTesting } from "./db";
import { importEmails } from "./finance-db";
import { claimImportEmail, createImportAddress, finishImportEmail, getImportInbox, getOwnedEmailFile, receiveImportEmail } from "./import-email";

afterEach(() => { setDbForTesting(null); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("개인 주소 분리·실제 수신대상 검증·웹훅 중복·타인 접근·동시 반영을 차단한다", async () => {
  vi.stubEnv("EMAIL_IMPORT_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "test"); vi.stubEnv("IMPORT_EMAIL_DOMAIN", "test.resend.app");
  const pg = new PGlite(); const db = drizzle(pg); setDbForTesting(db);
  try {
    await pg.exec(`CREATE TABLE household_members (id uuid PRIMARY KEY, user_id uuid, household_id uuid, role text, person_id text, created_at timestamptz DEFAULT now());`);
    await pg.exec(readFileSync(new URL("../scripts/migrate-import-email.sql", import.meta.url), "utf8"));
    const user1 = "00000000-0000-4000-8000-000000000001", user2 = "00000000-0000-4000-8000-000000000002";
    const householdId = "00000000-0000-4000-8000-000000000003";
    for (const id of [user1, user2]) await db.execute(sql`INSERT INTO household_members(id,user_id,household_id,person_id) VALUES (${id},${id},${householdId},${id})`);
    const a = { userId: user1, householdId, personId: user1, role: "owner", email: "a@example.com" };
    const b = { ...a, userId: user2, personId: user2 };
    await Promise.all([createImportAddress(a), createImportAddress(a), createImportAddress(b)]);
    const address = (await getImportInbox(a))!.address!;
    expect(address).not.toBe((await getImportInbox(b))!.address);
    expect(address).toMatch(/^u_[a-f0-9]{48}@test.resend.app$/);
    const id = "00000000-0000-4000-8000-000000000004";
    let recipients = [address];
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes("/attachments/")) return Response.json({ download_url: "https://attachments.example.com/test" });
      if (String(url).startsWith("https://attachments.example.com")) return new Response(new Uint8Array([1, 2, 3]));
      return Response.json({ id, received_for: recipients, to: [address], attachments: [{ id: "attachment", filename: "export.zip", size: 3, content_type: "application/zip" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await receiveImportEmail(id); await receiveImportEmail(id);
    expect((await getImportInbox(a))!.emails).toHaveLength(1);
    expect((await getImportInbox(b))!.emails).toHaveLength(0);
    fetchMock.mockClear();
    await expect(getOwnedEmailFile(b, id)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await getOwnedEmailFile(a, id)).size).toBe(3);
    recipients = ["someone-else@test.resend.app"];
    await expect(getOwnedEmailFile(a, id)).rejects.toThrow("수신 계정");
    const claimed = await Promise.allSettled([claimImportEmail(a, id), claimImportEmail(a, id)]);
    expect(claimed.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    await finishImportEmail(id, "imported");
    await receiveImportEmail(id);
    expect((await db.select().from(importEmails).where(eq(importEmails.id, id)))[0].status).toBe("imported");
    await expect(getOwnedEmailFile(a, id)).rejects.toThrow();
  } finally { await pg.close(); }
});
