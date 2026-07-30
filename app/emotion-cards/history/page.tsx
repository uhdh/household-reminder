import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getAllRecordsDesc } from "@/lib/emotion-cards-db";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const records = await getAllRecordsDesc(getDb());

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-2.5 p-5">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">기록</h1>
        {records.length === 0 && (
          <p className="py-10 text-center text-sm text-zinc-400">아직 기록이 없어요</p>
        )}
        {records.map((record) => (
          <Link
            key={record.date}
            href={`/emotion-cards/history/${record.date}`}
            className="flex items-center justify-between rounded-2xl bg-white px-4.5 py-4 dark:bg-zinc-900"
          >
            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              {format(parseISO(record.date), "M월 d일 (EEEEE)", { locale: ko })}
            </span>
            <span className="flex gap-1.5">
              {record.cards.map((card, i) => (
                <span
                  key={i}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-zinc-100 text-lg dark:bg-zinc-800"
                >
                  {card.emoji}
                </span>
              ))}
            </span>
          </Link>
        ))}
      </main>
    </div>
  );
}
