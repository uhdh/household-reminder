import { redirect } from "next/navigation";
import { getEmotionFamilyContext } from "@/lib/emotion-cards-context";
import { getDb } from "@/lib/db";
import { getRecord, getCustomEmotions } from "@/lib/emotion-cards-db";
import { todayISO } from "@/lib/chores";
import { EmotionSelect } from "../emotion-select";
import { addCustomEmotion, saveRecord } from "../actions";

export const dynamic = "force-dynamic";

export default async function SelectPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  const isEdit = edit === "1";
  const today = todayISO();
  const context = await getEmotionFamilyContext();
  const existing = await getRecord(getDb(), today, context?.familyId, context?.userId);

  if (existing && !isEdit) {
    redirect("/emotion-cards/result");
  }

  const customEmotions = await getCustomEmotions(getDb());

  return (
    <EmotionSelect
      today={today}
      initialSelected={isEdit ? (existing ?? []) : []}
      initialCustomEmotions={customEmotions}
      backHref={isEdit ? "/emotion-cards/result" : "/emotion-cards"}
      addCustomEmotionAction={addCustomEmotion}
      saveRecordAction={saveRecord}
    />
  );
}
