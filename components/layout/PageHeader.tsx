import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  iconClassName = "bg-foreground text-background",
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-2 shrink-0 border-b border-border pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-2xl shadow-card ${iconClassName}`}
          >
            <Icon className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
            {description ? (
              <p className="mt-1 max-w-4xl text-sm leading-snug text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="shrink-0 sm:pb-0.5">{actions}</div> : null}
      </div>
    </header>
  );
}
