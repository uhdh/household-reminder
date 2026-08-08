import Link from "next/link";
import { PERSON_IDS, PERSON_LABELS, type PersonId } from "@/lib/spending-queries";

export function PersonFilter({ pathname, periodKey, periodValue, selected, displayNameByPerson, extraParams = {} }: { pathname: string; periodKey: "month" | "year"; periodValue: string; selected: "all" | PersonId; displayNameByPerson: Map<string, string>; extraParams?: Record<string, string> }) {
  return (
    <div className="seed-card inline-flex gap-1 p-1 shadow-none" aria-label="사람별 필터">
      {(["all", ...PERSON_IDS] as const).map((person) => {
        const active = person === selected;
        const label = person === "all" ? "전체" : displayNameByPerson.get(person) ?? PERSON_LABELS[person];
        const params = new URLSearchParams({ [periodKey]: periodValue, ...extraParams });
        if (person === "all") params.delete("person");
        else params.set("person", person);
        const href = `${pathname}?${params.toString()}`;
        return <Link key={person} href={href} aria-current={active ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${active ? "bg-bg-brand-solid text-fg-neutral-inverted" : "text-ink-muted hover:bg-bg-neutral-weak hover:text-ink"}`}>{label}</Link>;
      })}
    </div>
  );
}
