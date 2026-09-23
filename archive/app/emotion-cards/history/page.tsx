import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getAllRecordsDesc } from "@/lib/emotion-cards-db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const context = await getEmotionFamilyContext();
  const records = context ? await getAllRecordsDesc(getDb(), context.familyId) : [];
  const recordsByDate = new Map<string, typeof records>();
  for (const record of records) {
    const sameDate = recordsByDate.get(record.date) ?? [];
    sameDate.push(record);
    recordsByDate.set(record.date, sameDate);
  }
  const groupedRecords = Array.from(recordsByDate, ([date, entries]) => ({ date, entries }));

  return (
    <div className="seed-page">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-2.5 p-5">
        <h1 className="text-xl font-bold text-fg-neutral">기록</h1>
        {records.length === 0 && (
          <p className="py-10 text-center text-sm text-fg-neutral-subtle">아직 기록이 없어요</p>
        )}
        {groupedRecords.map(({ date, entries }) => (
          <Link
            key={date}
            href={`/emotion-cards/history/${date}`}
            className="seed-card flex items-center justify-between px-4.5 py-4"
          >
            <span className="text-sm font-bold text-fg-neutral">
              {format(parseISO(date), "M월 d일 (EEEEE)", { locale: ko })}
              <span className="ml-2 text-xs font-normal text-fg-neutral-muted">{entries.length}명 기록</span>
            </span>
            <span className="flex gap-1.5">
              {entries.flatMap((entry) => entry.cards).slice(0, 6).map((card, i) => (
                <span
                  key={i}
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-bg-neutral-weak text-lg"
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
