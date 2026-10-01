import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell, Card, PageHeader } from "@/components/ui";
import { ActionButton, FeedbackMessage, FormField, TextInput } from "@/components/ui";
import { getDb } from "@/lib/db";
import { households, householdInvites } from "@/lib/finance-db";
import { hashInviteToken } from "@/lib/invite-token";
import { getCurrentHousehold } from "@/lib/require-household";
import { acceptInviteAction } from "./actions";

function InviteMessage({ text }: { text: string }) {
  return (
    <AppShell size="compact" className="font-office">
      <PageHeader className="mb-5" title="초대 링크" />
      <FeedbackMessage tone="critical">{text}</FeedbackMessage>
      <p className="mt-4 text-[14px] text-ink-muted">초대한 사람에게 새 링크를 요청하거나, 직접 새 가계부를 만들 수 있어요.</p>
      <Link href="/onboarding" className="seed-button seed-button-secondary mt-4 inline-flex min-h-11 items-center px-5 py-2 text-[14px]">새 가계부 만들기</Link>
    </AppShell>
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const tokenHash = hashInviteToken(token);

  const db = getDb();
  const [invite] = await db.select().from(householdInvites).where(eq(householdInvites.tokenHash, tokenHash)).limit(1);

  if (!invite) return <InviteMessage text="유효하지 않은 초대 링크입니다." />;
  if (invite.usedAt) return <InviteMessage text="이미 사용된 초대 링크입니다." />;
  if (invite.expiresAt < new Date()) return <InviteMessage text="만료된 초대 링크입니다." />;

  const currentHousehold = await getCurrentHousehold();
  if (currentHousehold) {
    return <InviteMessage text="이미 다른 가구에 속해 있어 합류할 수 없습니다." />;
  }

  const [household] = await db.select().from(households).where(eq(households.id, invite.householdId)).limit(1);
  const householdName = household?.name ?? "가계부";

  return (
    <AppShell size="compact" className="font-office">
      <PageHeader className="mb-5" title="초대 수락" description={`"${householdName}"에 합류해요.`} />
      {error && <FeedbackMessage tone="critical" className="mb-4">{error}</FeedbackMessage>}
      <Card className="p-5 shadow-none sm:p-7">
        <form action={acceptInviteAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <FormField label="내 표시 이름" hint="가계부 안에서 나를 나타낼 이름">
            <TextInput name="displayName" placeholder="예: 남편, 아내, 지은" required maxLength={20} className="w-full" />
          </FormField>
          <ActionButton type="submit" className="w-full">
            {householdName}에 합류
          </ActionButton>
        </form>
      </Card>
    </AppShell>
  );
}
