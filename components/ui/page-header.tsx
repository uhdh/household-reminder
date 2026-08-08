import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  eyebrow,
  action,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="seed-subtitle mb-1">{eyebrow}</p>}
        <h1 className="seed-title">{title}</h1>
        {description && <p className="seed-subtitle mt-1">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

