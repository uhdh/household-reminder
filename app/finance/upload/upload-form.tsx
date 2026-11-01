"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useAppExperience } from "@/app/app-experience";
import { ActionButton, FeedbackMessage, FormField, TextInput } from "@/components/ui";
import { uploadAction } from "./actions";

function UploadSubmitButton({ isApp }: { isApp: boolean }) {
  const { pending } = useFormStatus();
  return <ActionButton type="submit" disabled={pending} className="w-full">{pending ? "자료를 정리하고 있어요…" : isApp ? "가계부에 반영하기" : "업로드"}</ActionButton>;
}

export function UploadForm({
  error,
  success,
  people,
}: {
  error?: string;
  success?: string;
  people: { id: string; displayName: string }[];
}) {
  const isApp = Boolean(useAppExperience());
  const [filename, setFilename] = useState("");
  const [pcLink, setPcLink] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  async function copyPcLink() {
    const link = new URL("/finance/upload", window.location.origin).href;
    setPcLink(link);
    try {
      await navigator.clipboard.writeText(link);
      setCopyMessage("주소를 복사했어요. PC에서 같은 Google 계정으로 로그인해 주세요.");
    } catch {
      setCopyMessage("아래 주소를 길게 눌러 복사한 뒤 PC에서 열어주세요.");
    }
  }

  return (
    <>
      {isApp && (
        <section className="seed-card mb-4 p-5" aria-labelledby="mobile-import-heading">
          <h2 id="mobile-import-heading" className="text-lg font-bold">휴대폰에서 자료 가져오기</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-ink-muted">
            <li>뱅크샐러드에서 엑셀 파일을 받아요. 받는 방법은 아래에 있어요.</li>
            <li>받은 ZIP 파일을 휴대폰에 저장해요. 압축은 풀지 않아도 돼요.</li>
            <li>아래에서 파일과 보유자를 선택한 뒤 가계부에 반영해요.</li>
          </ol>
          <details className="mt-4 border-t border-stroke-neutral-muted pt-4">
            <summary className="cursor-pointer py-2 text-sm font-semibold text-fg-brand">PC에서 올릴래요</summary>
            <p className="my-3 text-sm leading-6 text-ink-muted">PC에서 같은 Google 계정으로 로그인해 파일을 올리면 앱에서도 같은 가계부를 확인할 수 있어요.</p>
            <ActionButton onClick={copyPcLink} variant="secondary" className="w-full">PC 업로드 주소 복사</ActionButton>
            {pcLink && <TextInput aria-label="PC 업로드 주소" value={pcLink} readOnly onFocus={(event) => event.target.select()} className="mt-3 w-full" />}
            <p role="status" className="mt-2 text-xs leading-5 text-ink-muted">{copyMessage}</p>
          </details>
        </section>
      )}
      <form action={uploadAction} onReset={() => setFilename("")} className="seed-card p-6">
        {isApp && <p className="mb-4 text-sm leading-6 text-ink-muted">파일을 선택한 뒤 내역의 보유자를 확인해 주세요. 선택만으로는 가계부가 바뀌지 않아요.</p>}
        <details open={!isApp} className="mb-4 text-sm leading-6 text-ink-muted">
          <summary className="cursor-pointer py-2 font-medium text-fg-neutral">가져오는 자료와 중복 처리 안내</summary>
          <p className="mt-2">
          뱅크샐러드에서 내보낸 엑셀 파일(&apos;뱅샐현황&apos;, &apos;가계부
          내역&apos; 시트 포함)을 업로드하면 자산 현황과 거래 내역이
          저장됩니다. 기간이 겹치는 파일을 다시 올려도 이미 올린 날짜의
          거래와 직접 고친 분류는 그대로 두고, 새 날짜의 거래만 추가돼요.
          자산 현황은 최신 파일 기준으로 바뀝니다. 서울페이 이용내역 엑셀도
          이 화면에서 함께 올릴 수 있어요.
          </p>
        </details>

        <p className="mb-2 text-sm font-medium text-fg-neutral">보유자</p>
        <div className="mb-4 flex gap-3">
          {people.map((person, index) => (
            <label
              key={person.id}
              className="flex flex-1 items-center gap-2 rounded-r3 border border-stroke-neutral-subtle px-3 py-2.5 text-sm text-fg-neutral transition-colors has-[:checked]:border-stroke-brand-solid has-[:checked]:bg-bg-brand-weak"
            >
              <input type="radio" name="personId" value={person.id} defaultChecked={index === 0} />
              {person.displayName}
            </label>
          ))}
        </div>

        <label className="mb-4 flex items-start gap-2 text-sm text-fg-neutral">
          <input type="checkbox" name="jointAccount" className="mt-1" />
          <span>
            이 파일은 공동 계좌/카드 내역이에요
            <span className="block text-xs text-ink-muted">
              체크하면 이 파일의 새 거래가 사용 대상 &quot;우리&quot;(공동 지출)로 기록돼요.
            </span>
          </span>
        </label>

        <FormField label="엑셀 또는 ZIP 파일" className="mb-4">
          <TextInput
            type="file"
            name="file"
            accept=".zip,.xlsx,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            onChange={(event) => setFilename(event.target.files?.[0]?.name ?? "")}
            className="file:mr-3 file:rounded-full file:border-0 file:bg-bg-neutral-weak file:px-3 file:py-1.5 file:text-sm file:text-fg-neutral"
          />
        </FormField>
        {filename && <p role="status" className="mb-4 break-all text-sm text-fg-brand">선택한 파일: {filename}</p>}

        <FormField label="파일 비밀번호" className="mb-1">
          <TextInput type="password" name="filePassword" autoComplete="off" />
        </FormField>
        <p className="mb-4 text-xs text-ink-muted">
          뱅크샐러드 내보내기에서 정한 압축 비밀번호 또는 엑셀 비밀번호를 입력하세요. 비밀번호는 저장하지 않아요.
        </p>

        {error && <FeedbackMessage tone="critical" className="mb-3">{error}</FeedbackMessage>}
        {success && <FeedbackMessage tone="positive" className="mb-3">{success}</FeedbackMessage>}

        <UploadSubmitButton isApp={isApp} />
      </form>

      <section className="seed-card mt-6 p-6" aria-labelledby="banksalad-download-guide">
        <div>
          <p className="text-xs font-bold text-fg-brand">파일 준비하기</p>
          <h2 id="banksalad-download-guide" className="mt-1 text-lg font-bold text-fg-neutral">
            뱅크샐러드 엑셀 파일 다운받는 방법
          </h2>
          <p className="mt-2 text-sm leading-6 text-fg-neutral-muted">뱅크샐러드 앱에서 아래 순서대로 이동하세요.</p>
        </div>

        <ol className="mt-5 space-y-3" aria-label="엑셀 파일 다운로드 순서">
          {[
            ["1", "가계부", "뱅크샐러드 앱에서 가계부를 열어요."],
            ["2", "상단 톱니바퀴", "가계부 화면 위쪽의 설정을 눌러요."],
            ["3", "파일로 받기", "정보와 기간을 입력한 뒤 파일을 받아요."],
          ].map(([number, title, description]) => (
            <li key={number} className="flex gap-3 rounded-r3 bg-bg-neutral-weak px-4 py-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg-brand-solid text-xs font-bold text-static-white">{number}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-fg-neutral">{title}</p>
                <p className="mt-0.5 text-sm leading-5 text-fg-neutral-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 border-t border-stroke-neutral-subtle pt-4 text-sm leading-6 text-fg-neutral-muted">
          <p>원하는 기간을 선택할 수 있으며, 한 번에 최대 1년까지 받을 수 있어요.</p>
          <p className="mt-1 text-xs">기간 선택 지원 버전: iOS 26.32.0 이상 · Android 26.34.0 이상</p>
        </div>

        <a
          href="https://help.banksalad.com/207"
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex min-h-10 w-full items-center justify-center rounded-r3 border border-stroke-brand-solid px-4 py-2 text-sm font-bold text-fg-brand transition-colors hover:bg-bg-brand-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stroke-brand-solid"
        >
          뱅크샐러드 공식 안내 보기
        </a>
      </section>
    </>
  );
}
