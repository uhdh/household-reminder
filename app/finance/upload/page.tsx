import Link from "next/link";
import { uploadAction } from "./actions";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 font-office">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            뱅크샐러드 파일 업로드
          </h1>
          <div className="flex items-center gap-3">
            <Link href="/finance" className="text-sm text-ink-muted transition-colors hover:text-ink">
              대시보드
            </Link>
            <Link href="/" className="text-sm text-ink-muted transition-colors hover:text-ink">
              홈
            </Link>
          </div>
        </div>

        <form
          action={uploadAction}
          className="border border-hairline bg-card p-6"
        >
          <p className="mb-4 text-sm text-ink-muted">
            뱅크샐러드에서 내보낸 엑셀 파일(&apos;뱅샐현황&apos;, &apos;가계부
            내역&apos; 시트 포함)을 업로드하면 자산 현황과 거래 내역이
            저장됩니다. 같은 보유자로 다시 업로드하면 이전 데이터는
            비활성화되고 새 데이터가 최신 기준으로 반영됩니다.
          </p>

          <label className="mb-1 block text-sm font-medium text-ink-muted">
            보유자
          </label>
          <div className="mb-4 flex gap-3">
            <label className="flex flex-1 items-center gap-2 border border-hairline2 px-3 py-2 text-sm text-ink transition-colors has-[:checked]:border-husband has-[:checked]:bg-husband/10">
              <input type="radio" name="personId" value="husband" defaultChecked />
              남편
            </label>
            <label className="flex flex-1 items-center gap-2 border border-hairline2 px-3 py-2 text-sm text-ink transition-colors has-[:checked]:border-wife has-[:checked]:bg-wife/10">
              <input type="radio" name="personId" value="wife" />
              아내
            </label>
          </div>

          <label className="mb-1 block text-sm font-medium text-ink-muted">
            엑셀 파일
          </label>
          <input
            type="file"
            name="file"
            accept=".xlsx"
            required
            className="mb-4 w-full border border-hairline2 px-3 py-2 text-sm text-ink outline-none file:mr-3 file:border-0 file:bg-hairline2 file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />

          {error && (
            <p className="mb-3 border border-gain/30 bg-gain/10 px-3 py-2 text-sm text-gain">
              {error}
            </p>
          )}
          {success && (
            <p className="mb-3 border border-legend1/30 bg-legend1/10 px-3 py-2 text-sm text-legend1">
              {success}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-legend1 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90"
          >
            업로드
          </button>
        </form>
      </div>
    </div>
  );
}
