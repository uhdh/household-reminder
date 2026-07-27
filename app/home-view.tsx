import Link from "next/link";
import { SECTIONS, type Section, type SectionStatus } from "@/lib/sections";

function formatToday() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function SectionRow({
  section,
  status,
}: {
  section: Section;
  status: SectionStatus;
}) {
  const card = (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-zinc-900 ${status.ready ? "" : "opacity-60 shadow-none"}`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-lg dark:bg-zinc-800">
        {section.icon}
      </span>
      <span className="flex-1 font-semibold text-zinc-900 dark:text-zinc-50">
        {section.name}
      </span>
      {status.ready ? (
        // red = needs-attention count (e.g. overdue items); revisit if a
        // ready section's status isn't a "needs attention" count
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {status.label}
        </span>
      ) : (
        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          준비중
        </span>
      )}
    </div>
  );

  if (!status.ready) {
    return <div>{card}</div>;
  }

  return <Link href={section.href}>{card}</Link>;
}

export function HomeView({
  sections = SECTIONS,
}: {
  sections?: Section[];
}) {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-1 flex-col px-5 py-10">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatToday()}
        </p>
        <h1 className="mb-6 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          우리집 👋
        </h1>
        <ul className="flex flex-col gap-3">
          {sections.map((section) => (
            <li key={section.id}>
              <SectionRow section={section} status={section.getStatus()} />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
