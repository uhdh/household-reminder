import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getRecord } from "@/lib/emotion-cards-db";
import { CardsView } from "../../cards-view";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const cards = ISO_DATE_RE.test(date) ? getRecord(getDb(), date) : undefined;

  if (!cards) {
    redirect("/emotion-cards/history");
  }

  const dateLabel = format(parseISO(date), "M월 d일 EEEE", { locale: ko });

  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link
            href="/emotion-cards/history"
            aria-label="뒤로가기"
            className="text-xl leading-none text-zinc-500 dark:text-zinc-400"
          >
            ←
          </Link>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{dateLabel}</h1>
        </div>
        <CardsView label="나" cards={cards} />
      </main>
    </div>
  );
}
