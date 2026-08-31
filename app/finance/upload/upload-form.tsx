import { ActionButton, FeedbackMessage, FormField, TextInput } from "@/components/ui";
import { uploadAction } from "./actions";

export function UploadForm({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      <form action={uploadAction} className="seed-card p-6">
        <p className="mb-4 text-sm text-ink-muted">
          뱅크샐러드에서 내보낸 엑셀 파일(&apos;뱅샐현황&apos;, &apos;가계부
          내역&apos; 시트 포함)을 업로드하면 자산 현황과 거래 내역이
          저장됩니다. 같은 보유자로 다시 업로드하면 이전 데이터는
          비활성화되고 새 데이터가 최신 기준으로 반영됩니다.
        </p>

        <p className="mb-2 text-sm font-medium text-fg-neutral">보유자</p>
        <div className="mb-4 flex gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-r3 border border-stroke-neutral-subtle px-3 py-2.5 text-sm text-fg-neutral transition-colors has-[:checked]:border-stroke-brand-solid has-[:checked]:bg-bg-brand-weak">
            <input type="radio" name="personId" value="husband" defaultChecked />
            남편
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-r3 border border-stroke-neutral-subtle px-3 py-2.5 text-sm text-fg-neutral transition-colors has-[:checked]:border-stroke-brand-solid has-[:checked]:bg-bg-brand-weak">
            <input type="radio" name="personId" value="wife" />
            아내
          </label>
        </div>

        <FormField label="엑셀 파일" className="mb-4">
          <TextInput
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="file:mr-3 file:rounded-full file:border-0 file:bg-bg-neutral-weak file:px-3 file:py-1.5 file:text-sm file:text-fg-neutral"
          />
        </FormField>

        {error && <FeedbackMessage tone="critical" className="mb-3">{error}</FeedbackMessage>}
        {success && <FeedbackMessage tone="positive" className="mb-3">{success}</FeedbackMessage>}

        <ActionButton type="submit" className="w-full">업로드</ActionButton>
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
