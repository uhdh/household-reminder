import Link from "next/link";
import { redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { getDb } from "@/lib/db";
import { getFamilyRecords } from "@/lib/emotion-cards-db";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { CardsView } from "../../cards-view";

export const dynamic = "force-dynamic";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const context = await getEmotionFamilyContext();
  const records = ISO_DATE_RE.test(date) && context ? await getFamilyRecords(getDb(), date, context.familyId) : [];

  if (records.length === 0) {
    redirect("/emotion-cards/history");
  }

  const dateLabel = format(parseISO(date), "M월 d일 EEEE", { locale: ko });

  return (
    <div className="seed-page">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Link
            href="/emotion-cards/history"
            aria-label="뒤로가기"
            className="seed-icon-button text-xl leading-none"
          >
            ←
          </Link>
          <h1 className="text-xl font-bold text-fg-neutral">{dateLabel}</h1>
        </div>
        {records.map((record) => (
          <CardsView key={record.userId ?? "legacy"} label={record.userId === context?.userId ? "나" : "배우자"} cards={record.cards} />
        ))}
      </main>
    </div>
  );
}
