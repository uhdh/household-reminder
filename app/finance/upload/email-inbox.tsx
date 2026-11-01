"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ActionButton, TextInput } from "@/components/ui";
import { createAddressAction, previewEmailAction } from "./email-actions";
import { uploadAction } from "./actions";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <ActionButton type="submit" disabled={pending}>{pending ? "처리 중…" : children}</ActionButton>;
}

type ImportOwner = { people?: { id: string; displayName: string }[]; personId?: string | null };

function EmailImport({ id, people = [], personId }: { id: string } & ImportOwner) {
  const [password, setPassword] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function preview() {
    setPending(true);
    setSummary("");
    setError("");
    try {
      const result = await previewEmailAction(id, password);
      setSummary(result.summary); setError(result.error);
    } catch { setError("자료 확인에 실패했습니다. 다시 시도해 주세요."); }
    finally { setPending(false); }
  }
  return <form action={uploadAction} onSubmit={(event) => {
    if (!summary || pending) { event.preventDefault(); if (!pending) void preview(); }
  }} className="mt-3 space-y-3">
    <input type="hidden" name="emailId" value={id} />
    <label className="block text-sm">압축 비밀번호
      <TextInput type="password" name="filePassword" autoComplete="off" value={password} disabled={pending}
        onChange={(event) => { setPassword(event.target.value); setSummary(""); }} className="mt-2 w-full" />
    </label>
    <ActionButton type="button" variant="secondary" disabled={pending} onClick={preview}>{pending ? "자료 확인 중…" : "자료 확인하기"}</ActionButton>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {summary && <>
      <p role="status" className="text-sm">{summary}</p>
      {!personId && <label className="block text-sm">내역의 보유자
        <select name="personId" required defaultValue="" className="mt-2 block w-full rounded border bg-bg-neutral px-3 py-2">
          <option value="" disabled>자료의 보유자를 선택해 주세요</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
        </select>
      </label>}
      <p className="text-xs text-ink-muted">{personId ? "본인 프로필로 가져옵니다. " : "선택한 보유자의 내역으로 가져옵니다. "}이미 올린 기간의 거래는 기존 내역을 유지해요. 반영 후에는 가구의 공유 설정이 적용돼요.</p>
      <label className="flex gap-2 text-sm"><input type="checkbox" name="jointAccount" />공동 계좌·카드 내역이에요</label>
      <Submit>가계부에 반영하기</Submit>
    </>}
  </form>;
}

export function EmailInbox({ address, emails, people, personId }: { address: string | null; emails: { id: string; receivedAt: string; status: string }[] } & ImportOwner) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return <section className="seed-card mb-5 p-5" aria-labelledby="email-import-title">
    <h2 id="email-import-title" className="text-lg font-bold">메일로 바로 가져오기</h2>
    <p className="my-3 text-sm leading-6 text-ink-muted">내 전용 주소를 뱅크샐러드 ‘파일로 받기’의 받는 이메일에 입력하세요. 다운로드 없이 여기서 확인할 수 있어요.</p>
    {!address ? <form action={createAddressAction}>
      <p className="mb-3 text-xs leading-5 text-ink-muted">이 기능을 사용하면 메일과 첨부파일이 수신 서비스 Resend에 전달·보관됩니다. 파일 비밀번호는 저장하지 않아요. <a href="/privacy#email-import" target="_blank" rel="noreferrer" className="underline">메일 자료 처리 안내</a></p>
      <label className="mb-3 flex items-start gap-2 text-sm"><input type="checkbox" name="emailImportConsent" required className="mt-1" />메일 자료 처리 안내를 확인하고 사용하겠습니다.</label>
      <Submit>내 수신 주소 만들기</Submit>
    </form> : <>
      <TextInput aria-label="내 수신 주소" readOnly value={address} onFocus={(event) => event.target.select()} className="w-full" />
      <div className="my-3 flex flex-wrap gap-2">
        <ActionButton type="button" variant="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(address); setMessage("주소를 복사했어요."); }
          catch { setMessage("주소를 길게 눌러 복사해 주세요."); }
        }}>주소 복사</ActionButton>
        <ActionButton type="button" variant="secondary" onClick={() => router.refresh()}>도착 확인</ActionButton>
      </div>
      <p role="status" className="text-sm">{message}</p>
      {!emails.length && <p className="mt-3 text-sm text-ink-muted">아직 도착한 자료가 없어요. 발송 후 ‘도착 확인’을 눌러 주세요.</p>}
      <ul className="divide-y divide-stroke-neutral-muted">
        {emails.map((email) => <li key={email.id} className="py-4">
          <p className="text-sm font-semibold">{new Date(email.receivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 도착</p>
          {email.status === "pending" ? <EmailImport id={email.id} people={people} personId={personId} /> : <p className="mt-2 text-sm">{email.status === "imported" ? "반영 완료" : email.status === "importing" ? "반영 중입니다. 잠시 후 다시 확인해 주세요." : "반영 중 오류가 발생했습니다. 기존 내역을 확인한 뒤 다시 보내 주세요."}</p>}
        </li>)}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">최근 7일 자료 중 최대 20개를 표시해요. 첨부가 만료되면 다시 보내 주세요.</p>
    </>}
  </section>;
}
