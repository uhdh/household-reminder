import { Resend } from "resend";
import { emailImportEnabled, receiveImportEmail } from "@/lib/import-email";

export async function POST(request: Request) {
  if (!emailImportEnabled()) return new Response(null, { status: 503 });
  if (Number(request.headers.get("content-length")) > 65536) return new Response(null, { status: 413 });
  if (!request.body) return new Response(null, { status: 400 });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) return new Response(null, { status: 413 });
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const body = Buffer.concat(chunks).toString("utf8");
  let event;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({ payload: body, webhookSecret: process.env.RESEND_WEBHOOK_SECRET!, headers: {
      id: request.headers.get("svix-id") ?? "", timestamp: request.headers.get("svix-timestamp") ?? "", signature: request.headers.get("svix-signature") ?? "",
    } });
  } catch { return new Response(null, { status: 400 }); }
  if (event.type !== "email.received") return new Response(null, { status: 204 });
  try { await receiveImportEmail(event.data.email_id); }
  catch { return new Response(null, { status: 503 }); } // Resend 재시도. 본문/비밀번호는 로그에 남기지 않는다.
  return new Response(null, { status: 204 });
}
