import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getRecord } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { CardsView } from "../cards-view";

export const dynamic = "force-dynamic";

export default async function ResultPage() {
  const today = todayISO();
  const cards = await getRecord(getDb(), today);

  if (!cards) {
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
        <CardsView label="나" cards={cards} />
      </main>
    </div>
  );
}
