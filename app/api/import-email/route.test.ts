// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { POST } from "./route";
const { receive } = vi.hoisted(() => ({ receive: vi.fn() }));
vi.mock("@/lib/import-email", () => ({ emailImportEnabled: () => true, receiveImportEmail: receive }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

test("변조·만료된 웹훅 서명은 거부하고 유효한 수신 이벤트만 처리한다", async () => {
  const key = Buffer.from("01234567890123456789012345678901");
  vi.stubEnv("RESEND_API_KEY", "re_test"); vi.stubEnv("RESEND_WEBHOOK_SECRET", `whsec_${key.toString("base64")}`);
  const body = JSON.stringify({ type: "email.received", data: { email_id: "test-email" } });
  function request(age = 0, tamper = false) {
    const timestamp = String(Math.floor(Date.now() / 1000) - age);
    const signature = createHmac("sha256", key).update(`msg_test.${timestamp}.${body}`).digest("base64");
    return new Request("http://localhost/api/import-email", { method: "POST", body: body + (tamper ? " " : ""), headers: {
      "svix-id": "msg_test", "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`,
    } });
  }
  expect((await POST(request(0, true))).status).toBe(400);
  expect((await POST(request(600))).status).toBe(400);
  expect(receive).not.toHaveBeenCalled();
  expect((await POST(request())).status).toBe(204);
  expect(receive).toHaveBeenCalledWith("test-email");
  receive.mockRejectedValueOnce(new Error("temporary"));
  expect((await POST(request())).status).toBe(503);
});
