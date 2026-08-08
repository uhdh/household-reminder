import Link from "next/link";
import { ActionButton, AppShell, FeedbackMessage, FormField, PageHeader, TextInput } from "@/components/ui";
import { uploadAction } from "./actions";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <AppShell size="compact" className="font-office">
        <PageHeader title="뱅크샐러드 파일 업로드" description="내보낸 엑셀 파일로 자산과 거래 내역을 갱신합니다." action={<div className="flex items-center gap-3">
            <Link href="/finance" className="text-sm text-ink-muted transition-colors hover:text-ink">
              대시보드
            </Link>
            <Link href="/" className="text-sm text-ink-muted transition-colors hover:text-ink">
              홈
            </Link>
          </div>} />

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

          {error && (
            <FeedbackMessage tone="critical" className="mb-3">{error}</FeedbackMessage>
          )}
          {success && (
            <FeedbackMessage tone="positive" className="mb-3">{success}</FeedbackMessage>
          )}

          <ActionButton type="submit" className="w-full">
            업로드
          </ActionButton>
        </form>
    </AppShell>
  );
}
