import Link from "next/link";
import { AppShell, PageHeader } from "@/components/ui";
import { getHouseholdPeople } from "@/lib/spending-queries";
import { requireHouseholdOrOnboard } from "@/lib/require-household";
import { UploadForm } from "./upload-form";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const { householdId } = await requireHouseholdOrOnboard();
  const people = await getHouseholdPeople(householdId);

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

        <UploadForm error={error} success={success} people={people} />
    </AppShell>
  );
}
