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
    <div className="seed-page">
      <main className="mx-auto flex max-w-md flex-1 flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/emotion-cards"
              aria-label="뒤로가기"
              className="seed-icon-button text-xl leading-none"
            >
              ←
            </Link>
            <h1 className="text-xl font-bold text-fg-neutral">오늘 우리 마음</h1>
          </div>
          <Link href="/emotion-cards/select?edit=1" className="t4-bold text-fg-brand">
            수정하기
          </Link>
        </div>
        {records.map((record) => (
          <CardsView key={record.userId ?? "legacy"} label={record.userId === context?.userId ? "나" : "배우자"} cards={record.cards} />
        ))}
      </main>
    </div>
  );
}
