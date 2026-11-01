import Link from "next/link";
import { AppShell, PageHeader } from "@/components/ui";
import { getHouseholdPeople } from "@/lib/spending-queries";
import { requireHouseholdOrOnboard } from "@/lib/require-household";
import { UploadForm } from "./upload-form";
import { EmailInbox } from "./email-inbox";
import { getImportInbox } from "@/lib/import-email";

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const context = await requireHouseholdOrOnboard();
  const { householdId } = context;
  const people = await getHouseholdPeople(householdId);
  const inbox = await getImportInbox(context);

  return (
    <AppShell size="compact" className="font-office">
        <PageHeader title="자료 가져오기" description="뱅크샐러드·서울페이 엑셀로 자산과 거래 내역을 갱신해요." action={<div className="flex items-center gap-3">
            <Link href="/finance" className="text-sm text-ink-muted transition-colors hover:text-ink">
              대시보드
            </Link>
            <Link href="/" className="text-sm text-ink-muted transition-colors hover:text-ink">
              홈
            </Link>
          </div>} />

        {inbox && <EmailInbox address={inbox.address} people={people} personId={context.personId} emails={inbox.emails.map((email) => ({ ...email, receivedAt: email.receivedAt.toISOString() }))} />}
        <UploadForm error={error} success={success} people={people} />
    </AppShell>
  );
}
