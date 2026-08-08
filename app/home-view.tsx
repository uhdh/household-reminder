import Link from "next/link";
import { SECTIONS, type Section, type SectionStatus } from "@/lib/sections";
import { AppShell, Card, PageHeader, StatusBadge } from "@/components/ui";

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
    <Card className={`flex items-center gap-3 p-3 transition-colors hover:bg-bg-layer-default-pressed ${status.ready ? "" : "opacity-60 shadow-none"}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-r3 bg-bg-brand-weak text-xl">
        {section.icon}
      </span>
      <span className="flex-1 t5-bold text-fg-neutral">
        {section.name}
      </span>
      {status.ready ? (
        <span className="flex items-center gap-2">
          {status.overdueIcons && status.overdueIcons.length > 0 && (
            <span className="flex items-center gap-0.5" aria-label="밀린 항목 아이콘">
              {status.overdueIcons.slice(0, 5).map((icon, index) => (
                <span key={`${icon}-${index}`} className="text-lg leading-none" title="밀린 항목">
                  {icon}
                </span>
              ))}
              {status.overdueIcons.length > 5 && (
                <span className="text-xs font-semibold text-fg-neutral-muted">
                  +{status.overdueIcons.length - 5}
                </span>
              )}
            </span>
          )}
          <StatusBadge tone={status.overdueIcons?.length ? "critical" : "brand"}>
            {status.label}
          </StatusBadge>
        </span>
      ) : (
        <StatusBadge tone="neutral">
          준비중
        </StatusBadge>
      )}
    </Card>
  );

  if (!status.ready) {
    return <div>{card}</div>;
  }

  const isExternal = section.href.startsWith("http");

  return (
    <Link
      href={section.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {card}
    </Link>
  );
}

export async function HomeView({
  sections = SECTIONS,
}: {
  sections?: Section[];
}) {
  const statuses = await Promise.all(sections.map((section) => section.getStatus()));

  return (
    <AppShell size="compact" className="font-sans">
        <PageHeader title="우리집 👋" eyebrow={formatToday()} className="mb-6" />
        <ul className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <li key={section.id}>
              <SectionRow section={section} status={statuses[index]} />
            </li>
          ))}
        </ul>
    </AppShell>
  );
}
