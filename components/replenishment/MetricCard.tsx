"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight, Factory, PackageSearch, Truck } from "lucide-react";

type MetricTone = "inStock" | "pullback" | "factory";

type MetricCardProps = {
  title: string;
  value: number;
  hint: string;
  loading?: boolean;
  canViewDetails?: boolean;
  onViewDetails?: () => void;
  tone?: MetricTone;
};

const toneStyles: Record<
  MetricTone,
  { bar: string; iconWrap: string; icon: LucideIcon }
> = {
  inStock: {
    bar: "from-emerald-600 to-emerald-950",
    iconWrap: "bg-emerald-50/90 text-emerald-800 ring-emerald-900/10 backdrop-blur-sm",
    icon: PackageSearch,
  },
  pullback: {
    bar: "from-orange-400 to-rose-600",
    iconWrap: "bg-orange-50/90 text-orange-950 ring-orange-900/10 backdrop-blur-sm",
    icon: Truck,
  },
  factory: {
    bar: "from-stone-600 to-stone-900",
    iconWrap: "bg-stone-100/90 text-stone-800 ring-stone-900/10 backdrop-blur-sm",
    icon: Factory,
  },
};

export function MetricCard({
  title,
  value,
  hint,
  loading,
  canViewDetails,
  onViewDetails,
  tone = "inStock",
}: MetricCardProps) {
  const t = toneStyles[tone];
  const Icon = t.icon;

  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-white/55 bg-white/72 shadow-[0_20px_50px_-18px_rgba(15,15,15,0.08)] backdrop-blur-lg">
      <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${t.bar}`} aria-hidden />
      <div className="p-5 pl-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${t.iconWrap}`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                {title}
              </p>
              {loading ? (
                <div className="mt-3 h-9 w-24 animate-pulse rounded-lg bg-stone-200/80" />
              ) : (
                <p className="mt-1.5 tabular-nums text-3xl font-bold tracking-tight text-stone-900">
                  {value}
                </p>
              )}
            </div>
          </div>
          {canViewDetails && !loading ? (
            <button
              type="button"
              onClick={onViewDetails}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-stone-200/80 bg-white/80 px-3 py-2 text-xs font-semibold text-stone-800 backdrop-blur-sm transition-colors duration-200 hover:border-violet-200/80 hover:bg-violet-50/90 hover:text-violet-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
            >
              Details
              <ChevronRight className="size-3.5 opacity-70" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-sm leading-snug text-stone-600">{hint}</p>
      </div>
    </article>
  );
}
