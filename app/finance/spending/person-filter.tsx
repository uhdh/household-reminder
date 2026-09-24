import Link from "next/link";

export function PersonFilter({
  pathname,
  periodKey,
  periodValue,
  selected,
  displayNameByPerson,
  extraParams = {},
}: {
  pathname: string;
  periodKey: "month" | "year";
  periodValue: string;
  selected: "all" | string;
  displayNameByPerson: Map<string, string>;
  extraParams?: Record<string, string>;
}) {
  const personIds = Array.from(displayNameByPerson.keys());
  // 1인 가구는 필터를 보여줄 이유가 없다(늘 "전체"와 같은 결과).
  if (personIds.length <= 1) return null;

  return (
    <div className="inline-flex gap-0.5 rounded-r3 bg-bg-neutral-weak p-1" aria-label="사람별 필터">
      {["all", ...personIds].map((person) => {
        const active = person === selected;
        const label = person === "all" ? "전체" : (displayNameByPerson.get(person) ?? person);
        const params = new URLSearchParams({ [periodKey]: periodValue, ...extraParams });
        if (person === "all") params.delete("person");
        else params.set("person", person);
        const href = `${pathname}?${params.toString()}`;
        return (
          <Link
            key={person}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 items-center rounded-r2 px-4 text-[14px] transition-colors ${active ? "bg-bg-brand-solid font-bold text-fg-neutral-inverted" : "font-medium text-ink-muted hover:text-ink"}`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
