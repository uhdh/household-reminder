import Link from "next/link";
import { getCurrentFamily } from "./actions";
import { FamilyForm } from "./family-form";
import { AppShell, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const family = await getCurrentFamily();
  return (
    <AppShell size="compact">
        <Link href="/" className="text-sm text-fg-neutral-muted transition hover:text-fg-neutral">← 홈으로</Link>
        <PageHeader
          title="가족 공간"
          description="같은 가족 공간에 참여한 사람끼리 청소·생필품·감정카드를 함께 사용합니다."
          className="mt-5"
        />
        {family ? (
          <div className="mt-6 rounded-r4 bg-bg-brand-weak p-5">
            <p className="t4-medium text-fg-brand">가족 초대코드</p>
            <p className="mt-2 text-3xl font-black tracking-[0.25em] text-fg-brand">{family.inviteCode}</p>
            <p className="mt-3 t4-regular text-fg-brand-contrast">이 코드를 가족에게 알려주면 같은 공간에 참여할 수 있습니다.</p>
          </div>
        ) : <div className="mt-6"><FamilyForm /></div>}
    </AppShell>
  );
}
