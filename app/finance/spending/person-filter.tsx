import Link from "next/link";
import { PERSON_IDS, PERSON_LABELS, type PersonId } from "@/lib/spending-queries";

export function PersonFilter({ pathname, periodKey, periodValue, selected, displayNameByPerson, extraParams = {} }: { pathname: string; periodKey: "month" | "year"; periodValue: string; selected: "all" | PersonId; displayNameByPerson: Map<string, string>; extraParams?: Record<string, string> }) {
  return (
    <div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1" aria-label="사람별 필터">
      {(["all", ...PERSON_IDS] as const).map((person) => {
        const active = person === selected;
        const label = person === "all" ? "전체" : displayNameByPerson.get(person) ?? PERSON_LABELS[person];
        const params = new URLSearchParams({ [periodKey]: periodValue, ...extraParams });
        if (person === "all") params.delete("person");
        else params.set("person", person);
        const href = `${pathname}?${params.toString()}`;
        return <Link key={person} href={href} aria-current={active ? "page" : undefined} className={`flex h-9 items-center rounded-r2 px-4 text-[14px] transition-colors ${active ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-ink-muted hover:text-ink"}`}>{label}</Link>;
      })}
    </div>
  );
}
