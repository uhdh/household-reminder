import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { getFamilyRecords, getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { AppShell, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function EmotionCardsPage() {
  const today = todayISO();
  const context = await getEmotionFamilyContext();
  const submitted = (await getRecord(getDb(), today, context?.familyId, context?.userId)) !== undefined;
  const familyRecords = context ? await getFamilyRecords(getDb(), today, context.familyId) : [];
  const partnerSubmitted = familyRecords.some((record) => record.userId !== context?.userId);
  const todayLabel = format(parseISO(today), "M월 d일 EEEE", { locale: ko });

  return (
    <AppShell size="compact" className="gap-6">
        <PageHeader
          title="감정카드"
          eyebrow={todayLabel}
          description="부부가 각자 고른 감정 카드 3장으로 오늘의 마음을 나눠요."
        />

        {context ? (
          <Card className="p-5">
            <p className="mb-4 text-base font-bold text-fg-neutral">오늘 우리 마음</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-r3 bg-bg-neutral-weak p-3">
                <p className="text-xs text-fg-neutral-muted">나</p>
                <p className={`mt-1 text-sm font-bold ${submitted ? "text-fg-brand" : "text-fg-neutral"}`}>
                  {submitted ? "기록 완료" : "기록 전"}
                </p>
              </div>
              <div className="rounded-r3 bg-bg-neutral-weak p-3">
                <p className="text-xs text-fg-neutral-muted">배우자</p>
                <p className={`mt-1 text-sm font-bold ${partnerSubmitted ? "text-fg-brand" : "text-fg-neutral"}`}>
                  {partnerSubmitted ? "기록 완료" : "기다리는 중"}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-5">
            <p className="text-base font-bold text-fg-neutral">먼저 부부 연결이 필요해요</p>
            <p className="mt-1 text-sm text-fg-neutral-muted">가족 설정에서 초대 코드를 공유해 같은 가족으로 연결해주세요.</p>
            <Link href="/family" className="mt-4 inline-flex text-sm font-bold text-fg-brand">가족 연결하기</Link>
          </Card>
        )}

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
              우리 마음 함께 보기
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

        <Link
          href="/emotion-cards/history"
          className="seed-card flex items-center gap-3 p-4 transition-colors hover:bg-bg-layer-default-pressed"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r3 bg-bg-neutral-weak text-lg" aria-hidden="true">
            📅
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-fg-neutral">우리의 감정 기록</span>
            <span className="mt-0.5 block text-xs text-fg-neutral-muted">날짜별로 함께 기록한 마음을 확인해요</span>
          </span>
          <span className="text-fg-neutral-muted" aria-hidden="true">›</span>
        </Link>
    </AppShell>
  );
}
