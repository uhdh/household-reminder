import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell, Card, PageHeader } from "@/components/ui";
import { ActionButton, FeedbackMessage, FormField, TextInput } from "@/components/ui";
import { getCurrentHousehold } from "@/lib/require-household";
import { createHouseholdAction } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; error?: string }>;
}) {
  const { invite, error } = await searchParams;

  // proxy.ts가 이미 로그인 + 명단(또는 open signup) 여부를 확인했으므로 여기서는 가구 소속만 본다.
  const household = await getCurrentHousehold();
  if (household) redirect("/finance");

  return (
    <AppShell size="compact" className="font-office">
      <PageHeader title="가계부 시작하기" description="가구를 새로 만들거나, 초대 링크로 합류할 수 있어요." />

      {invite && (
        <Card className="mb-4 p-4 shadow-none">
          <p className="text-[13px] text-ink-muted">
            초대 링크로 오셨네요. 아래에서 새로 만드는 대신{" "}
            <Link href={`/invite/${invite}`} className="font-semibold text-fg-brand">
              초대 수락하기
            </Link>
            로 바로 합류할 수 있어요.
          </p>
        </Card>
      )}

      {error && <FeedbackMessage tone="critical" className="mb-4">{error}</FeedbackMessage>}

      <Card className="p-5 shadow-none sm:p-7">
        <h2 className="mb-4 text-[16px] font-bold text-ink">새 가계부 만들기</h2>
        <form action={createHouseholdAction} className="space-y-4">
          <FormField label="가구 이름" hint="예: 우리집">
            <TextInput name="householdName" placeholder="우리집" maxLength={50} className="w-full" />
          </FormField>
          <FormField label="내 표시 이름" hint="가계부 안에서 나를 나타낼 이름">
            <TextInput name="displayName" placeholder="예: 남편, 아내, 지은" required maxLength={20} className="w-full" />
          </FormField>
          <ActionButton type="submit" className="w-full">
            가계부 만들기
          </ActionButton>
        </form>
      </Card>
    </AppShell>
  );
}
