import { cn } from "@/lib/utils";

export const modalOverlay =
  "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-[2px] motion-safe:overscroll-contain";

export const modalPanel =
  "w-full rounded-2xl border border-border bg-card shadow-pop";

export const modalCloseBtn =
  "flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20";

export const btnPrimary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

export const btnSecondary =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

export const btnGhost =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

export const fieldLabel =
  "block text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const fieldInput =
  "mt-1.5 h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

export const fieldTextarea =
  "mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/20";

export const alertError =
  "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800";

export const alertSuccess =
  "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";

export function pillFilter(active: boolean) {
  return cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
    active
      ? "border-foreground/15 bg-secondary text-foreground"
      : "border-border bg-card text-muted-foreground hover:border-foreground/10 hover:bg-secondary hover:text-foreground",
  );
}

export const thBase =
  "sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2.5 text-left backdrop-blur-sm";

export const thBtn =
  "inline-flex cursor-pointer items-center gap-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase transition hover:text-foreground";
