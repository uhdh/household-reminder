import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getFamilyRecords } from "@/lib/emotion-cards-db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { todayISO } from "@/lib/chores";
import { CardsView } from "../cards-view";

export const dynamic = "force-dynamic";

export default async function ResultPage() {
  const today = todayISO();
  const context = await getEmotionFamilyContext();
  const records = context
    ? await getFamilyRecords(getDb(), today, context.familyId)
    : [];

  if (records.length === 0) {
    redirect("/emotion-cards");
  }

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/emotion-cards"
              aria-label="뒤로가기"
              className="text-xl leading-none text-zinc-500 dark:text-zinc-400"
            >
              ←
            </Link>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">오늘의 마음</h1>
          </div>
          <Link href="/emotion-cards/select?edit=1" className="text-sm font-semibold text-orange-600">
            수정하기
          </Link>
        </div>
        {records.map((record) => (
          <CardsView key={record.userId ?? "legacy"} label={record.userId === context?.userId ? "나" : "가족"} cards={record.cards} />
        ))}
      </main>
    </div>
  );
}
