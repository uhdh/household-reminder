import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { AppShell, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmotionCardsPage() {
  const today = todayISO();
  const context = await getEmotionFamilyContext();
  const submitted = (await getRecord(getDb(), today, context?.familyId, context?.userId)) !== undefined;
  const todayLabel = format(parseISO(today), "M월 d일 EEEE", { locale: ko });

  return (
    <AppShell size="compact" className="gap-6">
        <PageHeader
          title="감정카드"
          eyebrow={todayLabel}
          description="말 대신, 감정 카드 3장으로 오늘의 마음을 전해요."
        />

        {submitted ? (
          <>
            <Card className="p-5">
              <p className="text-base font-bold text-fg-neutral">✅ 오늘 기록 완료</p>
              <p className="text-sm text-fg-neutral-muted">오늘 하루도 잘 기록했어요</p>
            </Card>
            <Link
              href="/emotion-cards/result"
              className="seed-primary-button w-full"
            >
              오늘 결과 보기
            </Link>
          </>
        ) : (
          <Link
            href="/emotion-cards/select"
            className="seed-primary-button w-full"
          >
            감정 선택하기
          </Link>
        )}

        <Link href="/emotion-cards/history" className="text-sm text-fg-neutral-muted transition hover:text-fg-neutral">
          📅 기록 보기
        </Link>
    </AppShell>
  );
}
