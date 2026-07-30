import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";

export const dynamic = "force-dynamic";

export default async function EmotionCardsPage() {
  const today = todayISO();
  const context = await getEmotionFamilyContext();
  const submitted = (await getRecord(getDb(), today, context?.familyId, context?.userId)) !== undefined;
  const todayLabel = format(parseISO(today), "M월 d일 EEEE", { locale: ko });

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-6 p-5">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">감정카드</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            말 대신, 감정 카드 3장으로 오늘의 마음을 전해요
          </p>
        </div>

        {submitted ? (
          <>
            <div className="rounded-2xl bg-white p-5 dark:bg-zinc-900">
              <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">✅ 오늘 기록 완료</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">오늘 하루도 잘 기록했어요</p>
            </div>
            <Link
              href="/emotion-cards/result"
              className="rounded-2xl bg-orange-600 py-4 text-center text-base font-bold text-white"
            >
              오늘 결과 보기
            </Link>
          </>
        ) : (
          <Link
            href="/emotion-cards/select"
            className="rounded-2xl bg-orange-600 py-4 text-center text-base font-bold text-white"
          >
            감정 선택하기
          </Link>
        )}

        <Link href="/emotion-cards/history" className="text-sm text-zinc-500 dark:text-zinc-400">
          📅 기록 보기
        </Link>
      </main>
    </div>
  );
}
