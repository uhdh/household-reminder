import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "./db";
import { householdMembers, importEmails, importMailboxes } from "./finance-db";
import type { HouseholdContext } from "./require-household";
import { MAX_IMPORT_BYTES } from "./finance-parse/zip";

export function emailImportEnabled() {
  return process.env.EMAIL_IMPORT_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET && process.env.IMPORT_EMAIL_DOMAIN);
}

function client() {
  if (!emailImportEnabled()) throw new Error("메일 가져오기를 준비 중입니다.");
  return new Resend(process.env.RESEND_API_KEY);
}

async function mailbox(context: HouseholdContext, create = false) {
  const db = getDb();
  const [member] = await db.select().from(householdMembers).where(and(
    eq(householdMembers.userId, context.userId), eq(householdMembers.householdId, context.householdId),
  )).limit(1);
  if (!member || !member.personId) throw new Error("설정에서 본인 프로필을 먼저 연결해 주세요.");
  if (create) await db.insert(importMailboxes).values({ memberId: member.id, token: randomBytes(24).toString("hex") }).onConflictDoNothing();
  const [box] = await db.select().from(importMailboxes).where(eq(importMailboxes.memberId, member.id)).limit(1);
  return box;
}

export async function createImportAddress(context: HouseholdContext) {
  client();
  await mailbox(context, true);
}

export async function getImportInbox(context: HouseholdContext) {
  if (!emailImportEnabled()) return null;
  const box = await mailbox(context);
  if (!box) return { address: null, emails: [] };
  const emails = await getDb().select({ id: importEmails.id, receivedAt: importEmails.receivedAt, status: importEmails.status })
    .from(importEmails).where(and(eq(importEmails.mailboxId, box.id), gte(importEmails.receivedAt, new Date(Date.now() - 7 * 86400000))))
    .orderBy(desc(importEmails.receivedAt)).limit(20);
  return { address: `u_${box.token}@${process.env.IMPORT_EMAIL_DOMAIN}`, emails };
}

/** 웹훅의 서명 검증 뒤에도 API의 실제 수신 대상 주소로 소유자를 결정한다. */
export async function receiveImportEmail(id: string) {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new Error("Invalid email id");
  const { data, error } = await client().emails.receiving.get(id);
  if (error || !data) throw new Error("메일 수신 정보를 확인하지 못했습니다.");
  const suffix = `@${process.env.IMPORT_EMAIL_DOMAIN}`.toLowerCase();
  const tokens = (data.received_for ?? []).map((address) => address.toLowerCase())
    .filter((address) => address.endsWith(suffix))
    .map((address) => address.slice(0, -suffix.length)).filter((local) => /^u_[a-f0-9]{48}$/.test(local)).map((local) => local.slice(2));
  // 여러 계정으로 동시에 보낸 파일은 어느 계정에도 자동 배정하지 않는다.
  if (new Set(tokens).size !== 1) return;
  const [box] = await getDb().select().from(importMailboxes).where(inArray(importMailboxes.token, tokens)).limit(1);
  if (!box) return;
  await getDb().insert(importEmails).values({ id, mailboxId: box.id }).onConflictDoNothing();
}

export async function getOwnedEmailFile(context: HouseholdContext, id: string) {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new Error("자료를 찾을 수 없습니다.");
  const box = await mailbox(context);
  if (!box) throw new Error("자료를 찾을 수 없습니다.");
  const [mail] = await getDb().select().from(importEmails).where(and(eq(importEmails.id, id), eq(importEmails.mailboxId, box.id),
    eq(importEmails.status, "pending"), gte(importEmails.receivedAt, new Date(Date.now() - 7 * 86400000)))).limit(1);
  if (!mail) throw new Error("가져올 수 없는 자료입니다. 새 자료를 보내 주세요.");
  const resend = client();
  const { data, error } = await resend.emails.receiving.get(id);
  const address = `u_${box.token}@${process.env.IMPORT_EMAIL_DOMAIN}`.toLowerCase();
  if (error || !data || !data.received_for?.map((value) => value.toLowerCase()).includes(address)) throw new Error("자료의 수신 계정을 확인하지 못했습니다.");
  const files = data.attachments.filter((file) => /\.(zip|xlsx)$/i.test(file.filename ?? ""));
  if (files.length !== 1) throw new Error("ZIP 또는 엑셀 첨부파일 하나를 보내 주세요.");
  const file = files[0];
  if (file.size <= 0 || file.size > MAX_IMPORT_BYTES) throw new Error("첨부파일은 10MB 이하로 보내 주세요.");
  const attachment = await resend.emails.receiving.attachments.get({ emailId: id, id: file.id });
  if (attachment.error || !attachment.data) throw new Error("첨부파일이 만료되었거나 가져올 수 없습니다. 다시 보내 주세요.");
  const url = new URL(attachment.data.download_url);
  if (url.protocol !== "https:") throw new Error("첨부파일 주소가 올바르지 않습니다.");
  // URL은 사용자 입력이 아닌 인증된 Resend API 응답에서만 가져온다. API 키는 다운로드에 보내지 않는다.
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("첨부파일을 가져오지 못했습니다.");
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) throw new Error("첨부파일은 10MB 이하로 보내 주세요.");
      chunks.push(new Uint8Array(value));
    }
  } finally { await reader.cancel(); }
  return new File(chunks, file.filename!, { type: file.content_type });
}

export async function claimImportEmail(context: HouseholdContext, id: string) {
  const box = await mailbox(context);
  if (!box) throw new Error("자료를 찾을 수 없습니다.");
  const claimed = await getDb().update(importEmails).set({ status: "importing" }).where(and(
    eq(importEmails.id, id), eq(importEmails.mailboxId, box.id), eq(importEmails.status, "pending"),
  )).returning({ id: importEmails.id });
  if (!claimed.length) throw new Error("이미 반영 중이거나 반영한 자료입니다.");
}

export async function finishImportEmail(id: string, status: "imported" | "failed") {
  await getDb().update(importEmails).set({ status }).where(and(eq(importEmails.id, id), eq(importEmails.status, "importing")));
}
