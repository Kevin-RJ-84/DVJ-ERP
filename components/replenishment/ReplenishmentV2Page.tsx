"use client";

import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  FileSpreadsheet,
  Loader2,
  MessageCircle,
  Search,
  Table2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  REPLENISHMENT_GROUP_FIELDS,
  type ReplenishmentGroupField,
  type ReplenishmentV2ApiPayload,
  type ReplenishmentV2RawSoldItem,
} from "@/lib/replenishment-v2";
import {
  exportConfirmedReplenishmentExcel,
  exportConfirmedReplenishmentPdf,
  exportFactoryOrdersExcel,
  exportFactoryOrdersPdf,
  toConfirmedExportRows,
  toFactoryExportRows,
  type ReplenishmentExportSourceItem,
} from "@/lib/replenishment-exports";
import type { DashboardSession } from "@/components/layout/dashboard-session";
import { sessionHasPermission } from "@/lib/nav-permissions";
import { btnGhost, btnPrimary } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import { PullbackContactLogModal, type PullbackContactLogEntry } from "./PullbackContactLogModal";
import { PullbackDrawer, pullbackRowKey } from "./PullbackDrawer";
import { ReplenishmentHistoryTab } from "./ReplenishmentHistoryTab";
import { StockPillGroup } from "./StockPillGroup";

function canExportConfirmed(session: DashboardSession | null): boolean {
  if (!session) return false;
  const isLegacyAdmin = session.role === "admin";
  return isLegacyAdmin || sessionHasPermission(session, "replenishment.export_confirmed");
}

function canExportFactoryOrders(session: DashboardSession | null): boolean {
  if (!session) return false;
  const isLegacyAdmin = session.role === "admin";
  return isLegacyAdmin || sessionHasPermission(session, "replenishment.export_factory_orders");
}

type ClientOption = {
  ClientID: string;
  PartyName: string;
};

type StockDimCols = {
  StyleNo: string | null;
  StoneShape: string | null;
  Metal: string | null;
  MetalType: string | null;
  ProductType: string | null;
  ProductStyle: string | null;
};

type WarehouseTableItem = ReplenishmentV2ApiPayload["rows"][number]["inWarehouseItems"][number] & StockDimCols;
type PullbackTableItem = ReplenishmentV2ApiPayload["rows"][number]["pullbackItems"][number] & StockDimCols;

/** Confirmed pullback line — same payload shape as grid pullback candidates. */
export type PullbackItem = PullbackTableItem;

type PullbackChangeRecord = {
  previousItems: PullbackItem[];
  reason: string;
  changedAt: Date;
};

type PullbackContactLogBucket = {
  stockNo: string;
  logs: PullbackContactLogEntry[];
};

type TableRow = Omit<ReplenishmentV2ApiPayload["rows"][number], "inWarehouseItems" | "pullbackItems"> & {
  overrideQty: number;
  /** Distinct stock traits across sold lines in this group (Style, shape, metal, …). */
  productSummary: string;
  inWarehouseItems: WarehouseTableItem[];
  pullbackItems: PullbackTableItem[];
  /** Warehouse StockNo pills shown for this row — capped at override qty (random sample). */
  warehousePillStockNos: string[];
  selectedWarehouseStockNos: Set<string>;
  invoiceNos: string[];
  confirmedPullbackItems: PullbackItem[];
  pullbackChangeHistory: PullbackChangeRecord[];
  pullbackContactLogs: PullbackContactLogBucket[];
  /** User chose to skip pullback allocation for this row (CHANGES-7). */
  skippedPullback: boolean;
  /** Set after confirm — drives disabled row UI (CHANGES-10). */
  savedStatus?: string | null;
  savedStockNo?: string | null;
  savedPullbackCandidateCount?: number | null;
  /** DB replenishment_items.ItemID by pullback StockNo (when item exists). */
  savedPullbackItemIdByStock?: Record<string, string>;
};

const REP_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const GROUP_LABELS: Record<ReplenishmentGroupField, string> = {
  StyleNo: "StyleNo",
  ProductType: "ProductType",
  StoneShape: "StoneShape",
  Metal: "Metal",
  MetalType: "MetalType",
  ProductStyle: "ProductStyle",
};

function GroupByTreeMenu({
  groupBy,
  onSelect,
  activeRowCount,
  disabled,
}: {
  groupBy: ReplenishmentGroupField;
  onSelect: (field: ReplenishmentGroupField) => void;
  activeRowCount: number | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [treeExpanded, setTreeExpanded] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (event.target instanceof Node && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative min-w-0 sm:min-w-[14.5rem]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={[
          "flex h-10 w-full min-w-[12rem] max-w-md items-center gap-2 rounded-full border border-border bg-card px-3 text-left text-sm outline-none transition",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-foreground/30",
          "focus-visible:ring-2 focus-visible:ring-ring/20",
        ].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Briefcase strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">Product</span>
          <span className="mx-1.5 text-muted-foreground/60">·</span>
          <span className="font-semibold text-foreground">{GROUP_LABELS[groupBy]}</span>
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={["size-4 shrink-0 text-muted-foreground transition-transform motion-safe:duration-200", open ? "rotate-180" : ""].join(" ")}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 z-40 mt-2 w-[min(100vw-1.5rem,19rem)] overflow-visible rounded-2xl border border-border/95 bg-secondary p-2 shadow-[0_12px_40px_-12px_rgba(15,15,15,0.25)] ring-1 ring-stone-900/[0.06]"
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setTreeExpanded((e) => !e)}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-foreground transition hover:bg-card/90"
            aria-expanded={treeExpanded}
          >
            <Briefcase strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="flex-1">Product</span>
            <ChevronDown
              strokeWidth={1.5}
              className={["size-4 shrink-0 text-muted-foreground transition-transform motion-safe:duration-200", treeExpanded ? "rotate-180" : ""].join(" ")}
              aria-hidden
            />
          </button>

          {treeExpanded ? (
            <div
              className="relative isolate mt-1 rounded-xl bg-secondary/90 px-1 pb-1.5 pt-1"
              role="listbox"
              aria-label="Group by field"
            >
              <span
                className="pointer-events-none absolute top-2.5 bottom-2.5 left-4 z-0 w-0.5 rounded-full bg-secondary0"
                aria-hidden
              />
              <ul className="relative z-[1] flex flex-col gap-1">
                {REPLENISHMENT_GROUP_FIELDS.map((field) => {
                  const active = field === groupBy;
                  const showBadge = active && activeRowCount != null && activeRowCount > 0;
                  return (
                    <li key={field} className="relative py-px">
                      <span
                        className="pointer-events-none absolute top-1/2 left-4 z-0 h-3.5 w-3.5 -translate-y-1/2 border-b-2 border-l-2 border-stone-500 rounded-bl-[6px] bg-transparent"
                        aria-hidden
                      />
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onSelect(field);
                          setOpen(false);
                        }}
                        className={[
                          "relative z-[2] flex w-full items-center gap-2 rounded-xl py-2.5 pr-2.5 pl-10 text-left text-[13px] transition motion-safe:duration-150",
                          active
                            ? "bg-card font-semibold text-foreground shadow-md ring-2 ring-ring/30/70"
                            : "text-muted-foreground hover:bg-card/90 hover:text-foreground",
                        ].join(" ")}
                      >
                        <span className="min-w-0 flex-1 truncate">{GROUP_LABELS[field]}</span>
                        {showBadge ? (
                          <span className="shrink-0 rounded-md bg-amber-200/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-950">
                            {activeRowCount}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const DATE_FMT = new Intl.DateTimeFormat("en-CA");
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIsoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDateLocal(value: string): Date | null {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return null;
  }
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function buildCalendarGrid(monthDate: Date) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevMonthDays = new Date(y, m, 0).getDate();
  const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

  for (let i = 0; i < 42; i += 1) {
    if (i < firstDow) {
      const day = prevMonthDays - (firstDow - 1 - i);
      cells.push({ date: new Date(y, m - 1, day), inCurrentMonth: false });
    } else if (i < firstDow + daysInMonth) {
      const day = i - firstDow + 1;
      cells.push({ date: new Date(y, m, day), inCurrentMonth: true });
    } else {
      const day = i - (firstDow + daysInMonth) + 1;
      cells.push({ date: new Date(y, m + 1, day), inCurrentMonth: false });
    }
  }

  return cells;
}

function DatePickerInput({
  label,
  value,
  onChange,
  compactLabel,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Uppercase pill label (e.g. FROM / TO) */
  compactLabel?: string;
}) {
  const selectedDate = parseIsoDateLocal(value);
  const [open, setOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState<Date>(selectedDate ?? new Date());
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parsed = parseIsoDateLocal(value);
    if (parsed) {
      setDisplayMonth(parsed);
    }
  }, [value]);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current) return;
      if (event.target instanceof Node && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const monthLabel = displayMonth.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  const grid = buildCalendarGrid(displayMonth);
  const selectedIso = selectedDate ? toIsoDateLocal(selectedDate) : null;
  const todayIso = toIsoDateLocal(new Date());

  return (
    <div className="min-w-0 space-y-1.5">
      <label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {compactLabel ?? label}
      </label>
      <div ref={wrapRef} className="relative">
        <input
          type="text"
          value={value}
          placeholder="mm/dd/yyyy"
          onChange={(e) => onChange(e.target.value)}
          onClick={() => setOpen(true)}
          onFocus={() => setOpen(true)}
          className="h-11 w-full rounded-full border border-border bg-card pr-11 pl-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-secondary"
          aria-label={`Toggle ${label} calendar`}
        >
          <CalendarDays className="size-4" />
        </button>

        {open ? (
          <div className="absolute left-0 z-30 mt-2 w-[290px] rounded-xl border border-border bg-card p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setDisplayMonth(
                    (d) => new Date(d.getFullYear(), d.getMonth() - 1, 1),
                  )
                }
                className="rounded-md p-1 hover:bg-secondary"
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </button>
              <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
              <button
                type="button"
                onClick={() =>
                  setDisplayMonth(
                    (d) => new Date(d.getFullYear(), d.getMonth() + 1, 1),
                  )
                }
                className="rounded-md p-1 hover:bg-secondary"
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-muted-foreground">
              {WEEKDAY_SHORT.map((w) => (
                <span key={w} className="py-1">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map(({ date, inCurrentMonth }) => {
                const iso = toIsoDateLocal(date);
                const isSelected = iso === selectedIso;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => {
                      onChange(iso);
                      setOpen(false);
                    }}
                    className={[
                      "h-8 rounded-md text-xs transition",
                      isSelected
                        ? "bg-foreground font-semibold text-white"
                        : inCurrentMonth
                          ? "text-foreground hover:bg-secondary"
                          : "text-muted-foreground hover:bg-secondary",
                      isToday && !isSelected ? "ring-1 ring-ring/30" : "",
                    ].join(" ")}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => onChange("")}
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  onChange(toIsoDateLocal(now));
                  setDisplayMonth(now);
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-foreground hover:bg-secondary"
              >
                Today
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function IconExportButtons({
  onPdf,
  onExcel,
  disabled,
}: {
  onPdf: () => void;
  onExcel: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={disabled}
        title="Export PDF"
        onClick={onPdf}
        className={cn(btnGhost, "size-9 px-0")}
        aria-label="Export PDF"
      >
        <FileDown className="size-4" strokeWidth={2} />
        <span className="sr-only">PDF</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        title="Export Excel"
        onClick={() => void onExcel()}
        className={cn(btnGhost, "size-9 px-0")}
        aria-label="Export Excel"
      >
        <FileSpreadsheet className="size-4" strokeWidth={2} />
        <span className="sr-only">Excel</span>
      </button>
    </div>
  );
}

function normalizeGroupValue(value: string | null) {
  const next = value?.trim();
  return next && next.length > 0 ? next : "(blank)";
}

function addDistinct(target: Set<string>, value: string | null | undefined) {
  const t = value?.trim();
  if (t) target.add(t);
}

function normalizeMetalType(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function formatDistinctSet(label: string, values: Set<string>, maxShow = 3): string | null {
  if (values.size === 0) return null;
  const sorted = [...values].sort((a, b) => a.localeCompare(b));
  if (sorted.length <= maxShow) {
    return `${label}: ${sorted.join(", ")}`;
  }
  return `${label}: ${sorted.slice(0, maxShow).join(", ")} (+${sorted.length - maxShow})`;
}

/**
 * Summarizes StyleNo, StoneShape, Metal, etc. from sold lines in this group.
 * Skips repeating the group-by dimension when it matches the row's group value.
 */
function buildProductSummary(
  soldInGroup: ReplenishmentV2RawSoldItem[],
  groupBy: ReplenishmentGroupField,
  groupValue: string,
): string {
  const style = new Set<string>();
  const shape = new Set<string>();
  const metal = new Set<string>();
  const metalType = new Set<string>();
  const productType = new Set<string>();
  const productStyle = new Set<string>();

  for (const s of soldInGroup) {
    const gv = s.groupValues;
    addDistinct(style, gv.StyleNo);
    addDistinct(shape, gv.StoneShape);
    addDistinct(metal, gv.Metal);
    addDistinct(metalType, gv.MetalType);
    addDistinct(productType, gv.ProductType);
    addDistinct(productStyle, gv.ProductStyle);
  }

  const parts: string[] = [];
  const pushIf = (field: ReplenishmentGroupField, label: string, set: Set<string>) => {
    if (set.size === 0) return;
    if (field === groupBy && groupValue !== "(blank)" && set.size === 1 && [...set][0] === groupValue) {
      return;
    }
    const line = formatDistinctSet(label, set);
    if (line) parts.push(line);
  };

  pushIf("StyleNo", "Style", style);
  pushIf("StoneShape", "Shape", shape);
  pushIf("Metal", "Metal", metal);
  pushIf("MetalType", "Metal type", metalType);
  pushIf("ProductType", "Product type", productType);
  pushIf("ProductStyle", "Product style", productStyle);

  return parts.length > 0 ? parts.join(" · ") : "—";
}

function pickRandom(pool: string[], n: number): string[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Match PartyName strings for pullback vs searched client — API does not expose client ids on pullback rows yet. */
function normalizeReplenParty(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function externalPullbackCandidates(
  row: { pullbackItems: PullbackTableItem[] },
  replenPartyNorm: string,
): PullbackTableItem[] {
  const hasParty = replenPartyNorm.length > 0;
  if (!hasParty) {
    return row.pullbackItems;
  }
  return row.pullbackItems.filter((p) => normalizeReplenParty(p.PartyName) !== replenPartyNorm);
}

function abbreviateClientName(name: string | null | undefined): string {
  const t = (name ?? "").trim();
  if (!t) return "?";
  if (t.length <= 12) return t;
  return `${t.slice(0, 10)}…`;
}

/** Step 3.2 — client-side replenishment allocations (memo → stock pullback → external pullback → factory). */
function computeAllocationBreakdown(row: TableRow, replenPartyNorm: string) {
  const hasParty = replenPartyNorm.length > 0;
  const clientMemoQty = hasParty
    ? row.pullbackItems.filter((p) => normalizeReplenParty(p.PartyName) === replenPartyNorm).length
    : 0;
  const pullbackAvail = hasParty
    ? row.pullbackItems.filter((p) => normalizeReplenParty(p.PartyName) !== replenPartyNorm).length
    : row.pullbackItems.length;

  const inWarehouse = row.selectedWarehouseStockNos.size;

  const effectivePullbackAvail = row.skippedPullback ? 0 : pullbackAvail;

  let remainingDisplay = row.overrideQty;
  const memoAllocDisplay = Math.min(remainingDisplay, clientMemoQty);
  remainingDisplay -= memoAllocDisplay;
  const stockAllocDisplay = Math.min(remainingDisplay, inWarehouse);
  remainingDisplay -= stockAllocDisplay;
  const pullAllocDisplay = Math.min(remainingDisplay, effectivePullbackAvail);
  remainingDisplay -= pullAllocDisplay;
  const factoryAllocDisplay = Math.max(0, remainingDisplay);

  let remainingActual = row.overrideQty;
  remainingActual -= memoAllocDisplay;
  remainingActual -= stockAllocDisplay;
  const pullbackSlotActual = Math.min(remainingActual, pullbackAvail);
  const pullbackUsed = Math.min(pullbackSlotActual, row.confirmedPullbackItems.length);
  remainingActual -= pullbackUsed;
  const factoryAllocActual = Math.max(0, remainingActual);

  return {
    memoAlloc: memoAllocDisplay,
    stockAlloc: stockAllocDisplay,
    pullAlloc: pullAllocDisplay,
    pullbackAvail,
    clientMemoQty,
    factoryAllocDisplay,
    factoryAllocActual,
  };
}

const STATUS_BADGE_WRAP =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold";

const BADGE_CONFIG = {
  memo: {
    label: "Memo",
    dot: "bg-violet-500",
    className: "bg-[#EDE9FE] text-foreground",
    clickable: false as const,
  },
  stock: {
    label: "Stock",
    dot: "bg-emerald-600",
    className: "bg-[#DCFCE7] text-[#166534]",
    clickable: false as const,
  },
  pullback_available: {
    label: "Pullback Available",
    dot: "bg-red-600",
    className: "bg-[#FEE2E2] text-[#991B1B] hover:bg-[#FECACA]",
    clickable: true as const,
  },
  pullback_confirmed: {
    label: "Pullback Confirmed",
    dot: "bg-blue-600",
    className: "bg-[#DBEAFE] text-[#1E40AF]",
    clickable: false as const,
  },
  pb_in_progress: {
    label: "PB In Progress",
    dot: "bg-amber-600",
    className: "bg-[#FEF3C7] text-[#92400E]",
    clickable: false as const,
  },
  factory_order_skippable: {
    label: "Factory Order",
    dot: "bg-amber-500",
    className: "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]",
    clickable: true as const,
  },
  factory_order_final: {
    label: "Factory Order",
    dot: "bg-amber-500",
    className: "bg-[#F1F5F9] text-[#475569]",
    clickable: false as const,
  },
} as const;

type StatusBadgeType = keyof typeof BADGE_CONFIG;

function DisabledStatusChip({ label }: { label: string }) {
  const short = label.replace(/^[^\s]+\s*/, "").trim() || label;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-200 px-2.5 py-1 text-xs font-semibold text-foreground">
      <span className="size-2 shrink-0 rounded-full bg-stone-500" aria-hidden />
      {short}
    </span>
  );
}

function computeConfirmSummary(rows: TableRow[], replenPartyNorm: string) {
  let lines = 0;
  let units = 0;
  for (const row of rows) {
    const a = computeAllocationBreakdown(row, replenPartyNorm);
    const factoryU = a.factoryAllocDisplay;
    const pullU = row.skippedPullback
      ? 0
      : Math.max(row.confirmedPullbackItems.length, a.pullAlloc > 0 ? a.pullAlloc : 0);
    if (factoryU + pullU > 0) {
      lines += 1;
      units += factoryU + pullU;
    }
  }
  return { lines, units };
}

function logResponseKey(resp: string): string {
  return resp.trim().toLowerCase().replace(/\s+/g, "_");
}

function toApiChannel(channel: string): string {
  const map: Record<string, string> = {
    WhatsApp: "whatsapp",
    Call: "call",
    Email: "email",
    "In Person": "in_person",
  };
  return map[channel] ?? channel.toLowerCase().replace(/\s+/g, "_");
}

function toApiClientResponse(response: string): string {
  const map: Record<string, string> = {
    Accepted: "accepted",
    Rejected: "rejected",
    "No Answer": "no_answer",
    "Callback Requested": "callback_requested",
  };
  return map[response] ?? response.toLowerCase().replace(/\s+/g, "_");
}

async function fetchPullbackItemIdByInvoiceStyle(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const res = await fetch("/api/replenishment/pending-pullbacks?limit=500&page=1", {
      credentials: "include",
    });
    if (!res.ok) return map;
    const data = (await res.json()) as {
      items?: Array<{ itemId: string; invoiceNo: string; styleNo: string }>;
    };
    for (const item of data.items ?? []) {
      map.set(`${item.invoiceNo}|${item.styleNo}`, item.itemId);
    }
  } catch {
    /* optional */
  }
  return map;
}

function attachPullbackItemIds(rows: TableRow[], idMap: Map<string, string>): TableRow[] {
  if (idMap.size === 0) return rows;
  return rows.map((row) => {
    const nextIds = { ...(row.savedPullbackItemIdByStock ?? {}) };
    for (const inv of row.invoiceNos) {
      const itemId = idMap.get(`${inv}|${row.groupValue}`);
      if (!itemId) continue;
      for (const pb of row.confirmedPullbackItems) {
        nextIds[pb.StockNo] = itemId;
      }
    }
    return Object.keys(nextIds).length > 0
      ? { ...row, savedPullbackItemIdByStock: nextIds }
      : row;
  });
}

function lastLogForStock(row: TableRow, stockNo: string): PullbackContactLogEntry | null {
  const bucket = row.pullbackContactLogs.find((b) => b.stockNo === stockNo);
  if (!bucket || bucket.logs.length === 0) return null;
  const sorted = [...bucket.logs].sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime());
  return sorted[sorted.length - 1] ?? null;
}

/** Confirmed pullback pill chrome — blue when accepted/no outreach yet; amber while outreach pending. */
function pullbackPillVariant(row: TableRow, stockNo: string): "blue" | "amber" {
  const last = lastLogForStock(row, stockNo);
  if (!last) return "blue";
  return logResponseKey(last.response) === "accepted" ? "blue" : "amber";
}

function derivePullbackBadgeState(
  row: TableRow,
  replenPartyNorm: string,
): "pullback_available" | "pullback_confirmed" | "pb_in_progress" | null {
  const { pullAlloc, pullbackAvail } = computeAllocationBreakdown(row, replenPartyNorm);
  if (row.skippedPullback) return null;
  if (pullAlloc === 0) return null;
  if (pullbackAvail === 0) return null;
  if (row.confirmedPullbackItems.length === 0) {
    return "pullback_available";
  }
  const totalLogs = row.pullbackContactLogs.reduce((sum, bucket) => sum + bucket.logs.length, 0);
  if (totalLogs === 0) {
    return "pullback_confirmed";
  }
  const allAccepted = row.confirmedPullbackItems.every((item) => {
    const last = lastLogForStock(row, item.StockNo);
    if (!last) return false;
    return logResponseKey(last.response) === "accepted";
  });
  if (allAccepted) return "pullback_confirmed";
  return "pb_in_progress";
}

function getFactoryOrderBadgeType(
  row: TableRow,
  replenPartyNorm: string,
): "factory_order_skippable" | "factory_order_final" {
  const { pullbackAvail } = computeAllocationBreakdown(row, replenPartyNorm);
  if (row.skippedPullback && pullbackAvail > 0) {
    return "factory_order_skippable";
  }
  return "factory_order_final";
}

type RowUiState = {
  isDisabled: boolean;
  disabledChip: string | null;
  mode: "disabled" | "locked_selection" | "full_recalc" | "active";
};

function deriveRowUiState(row: TableRow, replenPartyNorm: string): RowUiState {
  const status = row.savedStatus;
  const candidateCount = row.savedPullbackCandidateCount ?? computeAllocationBreakdown(row, replenPartyNorm).pullbackAvail;

  if (status) {
    if (["stock", "memo", "pullback_confirmed", "factory_order_placed"].includes(status)) {
      const chips: Record<string, string> = {
        stock: row.savedStockNo ? `✅ Stocked · ${row.savedStockNo}` : "✅ Stocked",
        memo: "✅ Memo",
        pullback_confirmed: "✅ Pulled Back",
        factory_order_placed: "🏭 Ordered",
      };
      return { isDisabled: true, disabledChip: chips[status] ?? null, mode: "disabled" };
    }
    if (status === "factory_order" && candidateCount === 0) {
      return { isDisabled: true, disabledChip: "🏭 Factory Order", mode: "disabled" };
    }
    if (status === "pending_pullback" || status === "pb_in_progress") {
      return { isDisabled: false, disabledChip: null, mode: "locked_selection" };
    }
    if (status === "pullback_available" || (status === "factory_order" && candidateCount > 0)) {
      return { isDisabled: false, disabledChip: null, mode: "full_recalc" };
    }
  }

  const badge = derivePullbackBadgeState(row, replenPartyNorm);
  if (badge === "pb_in_progress") {
    return { isDisabled: false, disabledChip: null, mode: "locked_selection" };
  }
  if (badge === "pullback_available" || (row.skippedPullback && candidateCount > 0)) {
    return { isDisabled: false, disabledChip: null, mode: "full_recalc" };
  }

  return { isDisabled: false, disabledChip: null, mode: "active" };
}

function daysSinceSoldClass(days: number): string {
  if (days > 14) return "font-semibold text-[#DC2626]";
  if (days >= 7) return "font-semibold text-[#D97706]";
  return "text-foreground";
}

type PendingInvoiceRow = {
  invoiceNo: string;
  partyName: string;
  pieceCount: number;
  invoiceDate: string;
  daysSinceSold: number;
};

function ExportDropdown({
  label,
  onPdf,
  onExcel,
  disabled,
}: {
  label: string;
  onPdf: () => void;
  onExcel: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {label}
        <ChevronDown className="size-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-[10rem] rounded-lg border border-border bg-card py-1 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          >
            <FileDown className="size-4" />
            PDF
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
            onClick={() => {
              setOpen(false);
              onExcel();
            }}
          >
            <FileSpreadsheet className="size-4" />
            Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({
  type,
  onClick,
}: {
  type: StatusBadgeType;
  onClick?: () => void;
}) {
  const cfg = BADGE_CONFIG[type];
  const wrap = cn(
    STATUS_BADGE_WRAP,
    "gap-1.5 px-2.5 py-1",
    cfg.className,
  );
  const content = (
    <>
      <span className={cn("size-2 shrink-0 rounded-full", cfg.dot)} aria-hidden />
      {cfg.label}
    </>
  );
  if (cfg.clickable && onClick) {
    return (
      <button type="button" className={cn(wrap, "cursor-pointer")} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <span className={cn(wrap, "cursor-default")}>{content}</span>;
}

function ReplenishmentStatusCell({
  row,
  replenPartyNorm,
  setRows,
  finalizeRows,
}: {
  row: TableRow;
  replenPartyNorm: string;
  setRows: Dispatch<SetStateAction<TableRow[]>>;
  finalizeRows: (list: TableRow[]) => TableRow[];
}) {
  const [skipOpen, setSkipOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const allocation = computeAllocationBreakdown(row, replenPartyNorm);
  const { memoAlloc, stockAlloc, factoryAllocDisplay, pullbackAvail } = allocation;

  const pullbackBadge = derivePullbackBadgeState(row, replenPartyNorm);
  /** Planned remainder assuming external pullback fills up to pullbackAvail — drives status badges vs pullback. */
  const factoryBadge =
    factoryAllocDisplay > 0 ? getFactoryOrderBadgeType(row, replenPartyNorm) : null;

  const badges: { type: StatusBadgeType; onClick?: () => void }[] = [];

  if (memoAlloc > 0) badges.push({ type: "memo" });
  if (stockAlloc > 0) badges.push({ type: "stock" });
  if (!row.skippedPullback && pullbackBadge) {
    badges.push({
      type: pullbackBadge,
      onClick:
        pullbackBadge === "pullback_available"
          ? () => {
              setRestoreOpen(false);
              setSkipOpen(true);
            }
          : undefined,
    });
  }
  if (factoryBadge) {
    badges.push({
      type: factoryBadge,
      onClick:
        factoryBadge === "factory_order_skippable"
          ? () => {
              setSkipOpen(false);
              setRestoreOpen(true);
            }
          : undefined,
    });
  }

  function applySkipPullback() {
    setRows((prev) =>
      finalizeRows(
        prev.map((r) =>
          r.groupValue !== row.groupValue
            ? r
            : {
                ...r,
                skippedPullback: true,
                confirmedPullbackItems: [],
                pullbackContactLogs: [],
              },
        ),
      ),
    );
    setSkipOpen(false);
  }

  function applyRestorePullback() {
    setRows((prev) =>
      finalizeRows(
        prev.map((r) => (r.groupValue !== row.groupValue ? r : { ...r, skippedPullback: false })),
      ),
    );
    setRestoreOpen(false);
  }

  useEffect(() => {
    if (!skipOpen && !restoreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSkipOpen(false);
        setRestoreOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [skipOpen, restoreOpen]);

  if (badges.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      <div className="flex max-w-[14rem] flex-wrap gap-1">
        {badges.map(({ type, onClick }) => (
          <StatusBadge key={type} type={type} onClick={onClick} />
        ))}
      </div>
      {skipOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setSkipOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="skip-pullback-modal-title"
            className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="skip-pullback-modal-title" className="text-base font-semibold text-foreground">
              Skip pullback?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{pullbackAvail}</span> pullback candidate
              {pullbackAvail === 1 ? "" : "s"} available. This will mark as Factory Order instead.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                onClick={() => setSkipOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                onClick={applySkipPullback}
              >
                Skip Pullback
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {restoreOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-[2px]"
          role="presentation"
          onClick={() => setRestoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-pullback-modal-title"
            className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="restore-pullback-modal-title" className="text-base font-semibold text-foreground">
              Use pullback again?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">{pullbackAvail}</span> candidate
              {pullbackAvail === 1 ? "" : "s"} still available for this item.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                onClick={() => setRestoreOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800"
                onClick={applyRestorePullback}
              >
                Use Pullback
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function regroup(payload: ReplenishmentV2ApiPayload, groupBy: ReplenishmentGroupField): TableRow[] {
  const soldByGroup = new Map<string, number>();
  const invoiceNosByGroup = new Map<string, Set<string>>();
  for (const item of payload.raw.soldItems) {
    const key = normalizeGroupValue(item.groupValues[groupBy]);
    soldByGroup.set(key, (soldByGroup.get(key) ?? 0) + 1);
    if (!invoiceNosByGroup.has(key)) invoiceNosByGroup.set(key, new Set());
    invoiceNosByGroup.get(key)!.add(item.invoiceNo);
  }

  return [...soldByGroup.entries()]
    .map(([groupValue, soldQty]) => {
      const soldInGroup = payload.raw.soldItems.filter(
        (item) => normalizeGroupValue(item.groupValues[groupBy]) === groupValue,
      );
      const productSummary = buildProductSummary(soldInGroup, groupBy, groupValue);
      const soldMetalTypes = new Set(
        soldInGroup
          .map((item) => normalizeMetalType(item.groupValues.MetalType))
          .filter((metalType) => metalType.length > 0),
      );
      const matchesSoldMetalType = (value: string | null | undefined) =>
        soldMetalTypes.size === 0 || soldMetalTypes.has(normalizeMetalType(value));

      const inWarehouseItems = payload.raw.inWarehouseItems
        .filter(
          (item) =>
            normalizeGroupValue(item.groupValues[groupBy]) === groupValue &&
            matchesSoldMetalType(item.groupValues.MetalType),
        )
        .map((item) => ({
          StockNo: item.stockNo,
          ProductDescription: item.productDescription,
          Location: item.location,
          BoxCode: item.boxCode,
          StyleNo: item.groupValues.StyleNo,
          StoneShape: item.groupValues.StoneShape,
          Metal: item.groupValues.Metal,
          MetalType: item.groupValues.MetalType,
          ProductType: item.groupValues.ProductType,
          ProductStyle: item.groupValues.ProductStyle,
        }));
      const pullbackItems = payload.raw.pullbackItems
        .filter(
          (item) =>
            normalizeGroupValue(item.groupValues[groupBy]) === groupValue &&
            matchesSoldMetalType(item.groupValues.MetalType),
        )
        .sort((a, b) => {
          const aOverall = a.overallRank ?? -Infinity;
          const bOverall = b.overallRank ?? -Infinity;
          if (aOverall !== bOverall) return bOverall - aOverall;
          return (b.styleRank ?? -Infinity) - (a.styleRank ?? -Infinity);
        })
        .map((item) => ({
          StockNo: item.stockNo,
          ProductDescription: item.productDescription,
          PartyName: item.partyName,
          MemoNo: item.memoNo,
          MemoEndDate: item.memoEndDate,
          CloseToExpiryDays: item.closeToExpiryDays,
          OverallRank: item.overallRank,
          StyleRank: item.styleRank,
          StyleNo: item.groupValues.StyleNo,
          StoneShape: item.groupValues.StoneShape,
          Metal: item.groupValues.Metal,
          MetalType: item.groupValues.MetalType,
          ProductType: item.groupValues.ProductType,
          ProductStyle: item.groupValues.ProductStyle,
        }));
      const inWarehouse = inWarehouseItems.length;
      const pullbackAvailable = pullbackItems.length;
      const warehousePool = inWarehouseItems.map((i) => i.StockNo);
      const pillCount = Math.min(soldQty, warehousePool.length);
      const warehousePillStockNos = pickRandom(warehousePool, pillCount);
      const selectedWarehouseStockNos = new Set(warehousePillStockNos);
      return {
        groupValue,
        styleRank:
          groupBy === "StyleNo" && groupValue !== "(blank)"
            ? (soldInGroup.find((s) => s.groupValues.StyleNo?.trim() === groupValue)?.styleRank ??
              null)
            : null,
        soldQty,
        overrideQty: soldQty,
        inWarehouse,
        pullbackAvailable,
        factoryOrder: Math.max(0, soldQty - selectedWarehouseStockNos.size),
        inWarehouseItems,
        pullbackItems,
        productSummary,
        warehousePillStockNos,
        selectedWarehouseStockNos,
        invoiceNos: [...(invoiceNosByGroup.get(groupValue) ?? [])],
        confirmedPullbackItems: [],
        pullbackChangeHistory: [],
        pullbackContactLogs: [],
        skippedPullback: false,
      };
    })
    .sort((a, b) => a.groupValue.localeCompare(b.groupValue));
}

type InvoiceSearchSummary = {
  invoiceNo: string;
  partyName: string;
  invoiceDate: string;
  lineCount: number;
};

function sessionFromJwtPayload(
  permissions: string[],
  role: "admin" | "member",
): DashboardSession {
  return {
    userId: "",
    avatarKey: null,
    role,
    username: "",
    roleId: null,
    roleName: "",
    permissions,
    email: "",
    firstName: "",
    lastName: "",
  };
}

export function ReplenishmentV2Page({ session: sessionProp = null }: { session?: DashboardSession | null }) {
  const searchParams = useSearchParams();
  const [session, setSession] = useState<DashboardSession | null>(sessionProp);

  useEffect(() => {
    setSession(sessionProp);
  }, [sessionProp]);

  useEffect(() => {
    if (sessionProp) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/replenishment/pending-count", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          permissions?: string[];
          role?: "admin" | "member";
        };
        if (!Array.isArray(data.permissions) || cancelled) return;
        const role = data.role === "admin" || data.role === "member" ? data.role : "member";
        setSession(sessionFromJwtPayload(data.permissions, role));
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionProp]);

  const showExportConfirmed = canExportConfirmed(session);
  const showExportFactoryOrders = canExportFactoryOrders(session);
  const [mainTab, setMainTab] = useState<"search" | "history">("search");
  const [searchMode, setSearchMode] = useState<"client" | "invoice">("client");
  const [invoiceNoInput, setInvoiceNoInput] = useState("");
  const [invoiceSearchSummary, setInvoiceSearchSummary] = useState<InvoiceSearchSummary | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<ClientOption[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [groupBy, setGroupBy] = useState<ReplenishmentGroupField>("StyleNo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawPayload, setRawPayload] = useState<ReplenishmentV2ApiPayload | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [pullbackDrawer, setPullbackDrawer] = useState<string | null>(null);
  const [changeReasonModalGroup, setChangeReasonModalGroup] = useState<string | null>(null);
  const [changeReasonDraft, setChangeReasonDraft] = useState("");
  const [swapRejectedModal, setSwapRejectedModal] = useState<{ groupValue: string; item: PullbackItem } | null>(
    null,
  );
  const [swapRejectedReasonDraft, setSwapRejectedReasonDraft] = useState("");
  const [removeConfirmDialog, setRemoveConfirmDialog] = useState<{
    open: boolean;
    groupValue: string;
    item: PullbackItem | null;
  }>({ open: false, groupValue: "", item: null });
  const [removeReasonModal, setRemoveReasonModal] = useState<{
    open: boolean;
    groupValue: string;
    item: PullbackItem | null;
  }>({ open: false, groupValue: "", item: null });
  const [removeReasonDraft, setRemoveReasonDraft] = useState("");
  const [contactLogModal, setContactLogModal] = useState<{
    groupValue: string;
    stockNo: string;
    clientName: string;
    itemId?: string;
    defaultExpanded?: boolean;
  } | null>(null);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState({
    channel: "WhatsApp",
    response: "Accepted",
    notes: "",
    salesperson: "",
  });
  const [salespersonChoices, setSalespersonChoices] = useState<Array<{ userId: string; label: string }>>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [repPage, setRepPage] = useState(0);
  const [repPageSize, setRepPageSize] = useState<number>(25);
  const [repJumpDraft, setRepJumpDraft] = useState("1");
  const [clientHighlightIndex, setClientHighlightIndex] = useState(0);
  const clientSuggestRef = useRef<HTMLDivElement | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showPendingDrawer, setShowPendingDrawer] = useState(false);
  const [pendingInvoiceTotal, setPendingInvoiceTotal] = useState(0);
  const [pendingInvoices, setPendingInvoices] = useState<PendingInvoiceRow[]>([]);
  const [pendingDrawerLoading, setPendingDrawerLoading] = useState(false);
  const [pendingSortBy, setPendingSortBy] = useState<
    "invoiceNo" | "partyName" | "pieceCount" | "daysSinceSold"
  >("daysSinceSold");
  const [pendingSortDir, setPendingSortDir] = useState<"asc" | "desc">("desc");
  const [confirmWarningOpen, setConfirmWarningOpen] = useState(false);
  const [confirmWarningCount, setConfirmWarningCount] = useState(0);
  const [exportSnapshot, setExportSnapshot] = useState<ReplenishmentExportSourceItem[]>([]);

  useEffect(() => {
    setClientHighlightIndex(0);
  }, [clientSuggestions]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    function onDocMouseDown(event: MouseEvent) {
      if (!clientSuggestRef.current) return;
      if (event.target instanceof Node && !clientSuggestRef.current.contains(event.target)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!contactLogModal) return;
    setContactDraft({
      channel: "WhatsApp",
      response: "Accepted",
      notes: "",
      salesperson: "",
    });
    setSalespersonChoices([]);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users");
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as {
          users: Array<{
            UserID: string;
            Username: string;
            FirstName: string | null;
            LastName: string | null;
            IsActive: boolean | null;
          }>;
        };
        if (!payload.users || cancelled) return;
        const next = payload.users
          .filter((u) => u.IsActive !== false)
          .map((u) => {
            const nn = `${u.FirstName ?? ""} ${u.LastName ?? ""}`.trim();
            const label = nn.length > 0 ? nn : u.Username;
            return { userId: u.UserID, label };
          });
        setSalespersonChoices(next.sort((a, b) => a.label.localeCompare(b.label)));
      } catch {
        /* users list optional — manual name entry fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactLogModal]);

  useEffect(() => {
    const inv = searchParams.get("invoiceNo")?.trim();
    if (!inv) return;
    setSearchMode("invoice");
    setInvoiceNoInput(inv);
    setMainTab("search");
  }, [searchParams]);

  useEffect(() => {
    if (!hasSearched) return;
    void (async () => {
      try {
        const res = await fetch("/api/replenishment/pending-count", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { totalPendingInvoices?: number };
        setPendingInvoiceTotal(data.totalPendingInvoices ?? 0);
      } catch {
        /* optional */
      }
    })();
  }, [hasSearched, confirmed]);

  useEffect(() => {
    if (!showPendingDrawer) return;
    let cancelled = false;
    (async () => {
      setPendingDrawerLoading(true);
      try {
        const params = new URLSearchParams({
          sortBy: pendingSortBy,
          sortDir: pendingSortDir,
        });
        const res = await fetch(`/api/replenishment/pending-invoices?${params}`, {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as PendingInvoiceRow[];
        if (!cancelled) setPendingInvoices(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setPendingInvoices([]);
      } finally {
        if (!cancelled) setPendingDrawerLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showPendingDrawer, pendingSortBy, pendingSortDir]);

  const selectedClientName = useMemo(() => {
    const hit = clientSuggestions.find((c) => c.ClientID === clientId);
    if (hit) return hit.PartyName;
    return clientSearch.trim();
  }, [clientId, clientSearch, clientSuggestions]);

  const exportDisplayName = invoiceSearchSummary?.partyName ?? selectedClientName;

  const replenPartyKey = useMemo(() => normalizeReplenParty(exportDisplayName), [exportDisplayName]);

  const finalizeRowsForParty = useCallback((list: TableRow[], partyKey: string) => {
    return list.map((row) => ({
      ...row,
      factoryOrder: computeAllocationBreakdown(row, partyKey).factoryAllocDisplay,
    }));
  }, []);

  const finalizeRows = useCallback(
    (list: TableRow[]) => finalizeRowsForParty(list, replenPartyKey),
    [replenPartyKey, finalizeRowsForParty],
  );

  function handleRemovePullbackItem(groupValue: string, item: PullbackItem) {
    const row = rows.find((r) => r.groupValue === groupValue);
    if (!row) return;
    if (row.confirmedPullbackItems.length === 1) {
      setRemoveConfirmDialog({ open: true, groupValue, item });
    } else {
      setRemoveReasonDraft("");
      setRemoveReasonModal({ open: true, groupValue, item });
    }
  }

  function confirmRemoveOnlyPullback() {
    const { groupValue, item } = removeConfirmDialog;
    if (!groupValue || !item) return;
    setRows((prev) =>
      finalizeRows(
        prev.map((row) => {
          if (row.groupValue !== groupValue) return row;
          return {
            ...row,
            confirmedPullbackItems: [],
            pullbackContactLogs: [],
            skippedPullback: true,
            pullbackChangeHistory: [
              ...row.pullbackChangeHistory,
              {
                previousItems: [...row.confirmedPullbackItems],
                reason: "Removed only pullback item — moved to Factory Order",
                changedAt: new Date(),
              },
            ],
          };
        }),
      ),
    );
    setRemoveConfirmDialog({ open: false, groupValue: "", item: null });
  }

  function submitRemovePullbackWithReason() {
    const reason = removeReasonDraft.trim();
    const item = removeReasonModal.item;
    const gv = removeReasonModal.groupValue;
    if (!item || !gv || reason.length < 10) return;
    const rmKey = pullbackRowKey(item);
    setRows((prev) =>
      finalizeRows(
        prev.map((row) => {
          if (row.groupValue !== gv) return row;
          const nextConfirmed = row.confirmedPullbackItems.filter((ci) => pullbackRowKey(ci) !== rmKey);
          return {
            ...row,
            confirmedPullbackItems: nextConfirmed,
            pullbackContactLogs: row.pullbackContactLogs.filter((b) => b.stockNo !== item.StockNo),
            pullbackChangeHistory: [
              ...row.pullbackChangeHistory,
              { previousItems: [...row.confirmedPullbackItems], reason, changedAt: new Date() },
            ],
          };
        }),
      ),
    );
    setRemoveReasonModal({ open: false, groupValue: "", item: null });
    setRemoveReasonDraft("");
  }

  const pullbackDrawerBundle = useMemo(() => {
    if (!pullbackDrawer) return null;
    const row = rows.find((r) => r.groupValue === pullbackDrawer);
    if (!row) return null;
    const candidates = externalPullbackCandidates(row, replenPartyKey);
    const alloc = computeAllocationBreakdown(row, replenPartyKey);
    return {
      row,
      candidates,
      maxSelectable: alloc.pullAlloc,
      titleCount: candidates.length,
    };
  }, [pullbackDrawer, rows, replenPartyKey]);

  const hasAnyGreenPill = rows.some((row) => row.selectedWarehouseStockNos.size > 0);

  const canConfirmReplenishment = useMemo(
    () =>
      rows.some((row) => {
        const a = computeAllocationBreakdown(row, replenPartyKey);
        return (
          row.selectedWarehouseStockNos.size > 0 ||
          row.confirmedPullbackItems.length > 0 ||
          a.memoAlloc > 0 ||
          a.factoryAllocDisplay > 0 ||
          (a.pullAlloc > 0 && !row.skippedPullback)
        );
      }),
    [rows, replenPartyKey],
  );

  const confirmSummary = useMemo(
    () => computeConfirmSummary(rows, replenPartyKey),
    [rows, replenPartyKey],
  );

  const visibleRows = useMemo(
    () =>
      showCompleted
        ? rows
        : rows.filter((row) => !deriveRowUiState(row, replenPartyKey).isDisabled),
    [rows, showCompleted, replenPartyKey],
  );

  const repTotalPages = Math.max(1, Math.ceil(visibleRows.length / repPageSize));
  const safeRepPage = Math.min(repPage, repTotalPages - 1);
  const repPageRows = visibleRows.slice(safeRepPage * repPageSize, (safeRepPage + 1) * repPageSize);
  const repStartRow = visibleRows.length === 0 ? 0 : safeRepPage * repPageSize + 1;
  const repEndRow = Math.min((safeRepPage + 1) * repPageSize, visibleRows.length);

  useEffect(() => {
    setRepPage((p) => Math.min(p, Math.max(0, repTotalPages - 1)));
  }, [repTotalPages]);

  useEffect(() => {
    setRepJumpDraft(String(safeRepPage + 1));
  }, [safeRepPage]);

  function applyRepJump() {
    const n = parseInt(repJumpDraft.trim(), 10);
    if (!Number.isFinite(n)) return;
    const target = Math.min(Math.max(1, n), repTotalPages);
    setRepPage(target - 1);
  }

  function selectClientSuggestion(client: ClientOption) {
    setClientId(client.ClientID);
    setClientSearch(client.PartyName);
    setClientSuggestions([]);
    setSuggestionsOpen(false);
  }

  async function fetchClientSuggestions(query: string) {
    const q = query.trim();
    if (q.length < 3) {
      setClientSuggestions([]);
      setClientId("");
      setSuggestionsOpen(false);
      return;
    }
    setSuggestionsOpen(true);
    setClientLoading(true);
    const params = new URLSearchParams({
      search: q,
      matchMode: "startsWith",
      limit: "8",
    });
    const res = await fetch(`/api/clients?${params.toString()}`);
    const payload = (await res.json()) as { clients: ClientOption[]; message?: string };
    setClientLoading(false);
    if (!res.ok) {
      throw new Error(payload.message ?? "Could not load clients.");
    }
    setClientSuggestions(payload.clients);
    if (payload.clients.length > 0) {
      setClientId(payload.clients[0].ClientID);
    } else {
      setClientId("");
    }
  }

  async function handleSearch() {
    if (searchMode === "invoice") {
      const inv = invoiceNoInput.trim();
      if (!inv) {
        setError("Enter an invoice number.");
        setHasSearched(false);
        return;
      }
      setHasSearched(true);
      setLoading(true);
      setError(null);
      setConfirmed(false);
      setToast(null);
      setInvoiceSearchSummary(null);
      try {
        const params = new URLSearchParams({
          invoiceNo: inv,
          groupBy,
          includeRaw: "1",
        });
        const res = await fetch(`/api/replenishment/v2?${params.toString()}`);
        const payload = (await res.json()) as ReplenishmentV2ApiPayload & {
          message?: string;
          invoiceSearchSummary?: InvoiceSearchSummary;
        };
        if (!res.ok) {
          setError(payload.message ?? "Search failed.");
          return;
        }
        setRawPayload(payload);
        const summary = payload.invoiceSearchSummary;
        const allocPk = normalizeReplenParty(summary?.partyName ?? "");
        const grouped = finalizeRowsForParty(regroup(payload, groupBy), allocPk);
        const idMap = await fetchPullbackItemIdByInvoiceStyle();
        let nextRows = attachPullbackItemIds(grouped, idMap);
        const deepLinkItemId = searchParams.get("pullbackItemId")?.trim();
        if (deepLinkItemId && summary) {
          nextRows = nextRows.map((row) => {
            if (!row.invoiceNos.includes(summary.invoiceNo)) return row;
            const ids = { ...(row.savedPullbackItemIdByStock ?? {}) };
            if (row.confirmedPullbackItems.length > 0) {
              for (const pb of row.confirmedPullbackItems) {
                ids[pb.StockNo] = deepLinkItemId;
              }
            } else {
              ids.__item = deepLinkItemId;
            }
            return { ...row, savedPullbackItemIdByStock: ids };
          });
        }
        setRows(nextRows);
        setRepPage(0);
        if (summary) {
          setInvoiceSearchSummary(summary);
          const d = summary.invoiceDate.slice(0, 10);
          setFromDate(d);
          setToDate(d);
        }
      } catch {
        setError("Unexpected network error.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!clientId) {
      setError("Type at least 3 letters to match a client.");
      setHasSearched(false);
      return;
    }
    if (!fromDate || !toDate) {
      setError("Select from/to dates.");
      setHasSearched(false);
      return;
    }

    setHasSearched(true);
    setLoading(true);
    setError(null);
    setConfirmed(false);
    setToast(null);
    setInvoiceSearchSummary(null);
    try {
      const params = new URLSearchParams({
        clientId,
        fromDate,
        toDate,
        groupBy,
        includeRaw: "1",
      });
      const res = await fetch(`/api/replenishment/v2?${params.toString()}`);
      const payload = (await res.json()) as ReplenishmentV2ApiPayload & { message?: string };
      if (!res.ok) {
        setError(payload.message ?? "Search failed.");
        return;
      }
      setRawPayload(payload);
      const grouped = finalizeRows(regroup(payload, groupBy));
      const idMap = await fetchPullbackItemIdByInvoiceStyle();
      setRows(attachPullbackItemIds(grouped, idMap));
      setRepPage(0);
    } catch {
      setError("Unexpected network error.");
    } finally {
      setLoading(false);
    }
  }

  function onGroupByChange(next: ReplenishmentGroupField) {
    setGroupBy(next);
    if (!rawPayload) return;
    setRows(finalizeRows(regroup(rawPayload, next)));
    setConfirmed(false);
    setToast(null);
    setRepPage(0);
  }

  function onOverrideQtyChange(groupValue: string, nextValue: number) {
    setRows((prev) =>
      finalizeRows(
        prev.map((row) => {
          if (row.groupValue !== groupValue) return row;
          const overrideQty = Math.max(0, Number.isFinite(nextValue) ? Math.trunc(nextValue) : 0);
          const pool = row.inWarehouseItems.map((item) => item.StockNo);
          const pillCount = Math.min(overrideQty, pool.length);
          const warehousePillStockNos = pickRandom(pool, pillCount);
          const selectedWarehouseStockNos = new Set(warehousePillStockNos);
          return {
            ...row,
            overrideQty,
            warehousePillStockNos,
            selectedWarehouseStockNos,
            skippedPullback: false,
          };
        }),
      ),
    );
  }

  function onTogglePill(groupValue: string, stockNo: string) {
    setRows((prev) =>
      finalizeRows(
        prev.map((row) => {
          if (row.groupValue !== groupValue) return row;
          const next = new Set(row.selectedWarehouseStockNos);
          if (next.has(stockNo)) {
            next.delete(stockNo);
          } else {
            next.add(stockNo);
          }
          return {
            ...row,
            selectedWarehouseStockNos: next,
          };
        }),
      ),
    );
  }

  function onPullbackConfirm(selected: PullbackTableItem[]) {
    const gv = pullbackDrawer;
    if (!gv) return;
    setRows((prev) =>
      finalizeRows(
        prev.map((row) =>
          row.groupValue !== gv ? row : { ...row, confirmedPullbackItems: selected as PullbackItem[] },
        ),
      ),
    );
    setPullbackDrawer(null);
  }

  function submitChangePullbackReason() {
    const gv = changeReasonModalGroup;
    const reason = changeReasonDraft.trim();
    if (!gv || reason.length < 10) return;
    setRows((prev) =>
      finalizeRows(
        prev.map((row) =>
          row.groupValue !== gv
            ? row
            : {
                ...row,
                pullbackChangeHistory: [
                  ...row.pullbackChangeHistory,
                  { previousItems: [...row.confirmedPullbackItems], reason, changedAt: new Date() },
                ],
                confirmedPullbackItems: [],
              },
        ),
      ),
    );
    setChangeReasonModalGroup(null);
    setChangeReasonDraft("");
    setPullbackDrawer(gv);
  }

  function handleSwapRejectedFromDrawer(item: PullbackTableItem) {
    const gv = pullbackDrawer;
    if (!gv) return;
    setPullbackDrawer(null);
    setSwapRejectedModal({ groupValue: gv, item });
    setSwapRejectedReasonDraft("");
  }

  function submitSwapRejectedReason() {
    const reason = swapRejectedReasonDraft.trim();
    if (!swapRejectedModal || reason.length < 10) return;
    const { groupValue, item } = swapRejectedModal;
    const rmKey = pullbackRowKey(item);
    setRows((prev) =>
      finalizeRows(
        prev.map((row) => {
          if (row.groupValue !== groupValue) return row;
          const nextConfirmed = row.confirmedPullbackItems.filter(
            (ci) => pullbackRowKey(ci) !== rmKey,
          );
          return {
            ...row,
            confirmedPullbackItems: nextConfirmed,
            pullbackChangeHistory: [
              ...row.pullbackChangeHistory,
              { previousItems: [item], reason, changedAt: new Date() },
            ],
          };
        }),
      ),
    );
    setSwapRejectedModal(null);
    setSwapRejectedReasonDraft("");
    setPullbackDrawer(groupValue);
  }

  function applyContactLogToRow(
    row: TableRow,
    stockNo: string,
    entry: PullbackContactLogEntry,
    updatedStatus: string | null,
  ): TableRow {
    const nextBuckets = [...row.pullbackContactLogs];
    const ix = nextBuckets.findIndex((b) => b.stockNo === stockNo);
    if (ix === -1) nextBuckets.push({ stockNo, logs: [entry] });
    else nextBuckets[ix] = { stockNo, logs: [...nextBuckets[ix].logs, entry] };

    let nextRow: TableRow = {
      ...row,
      pullbackContactLogs: nextBuckets,
    };

    if (updatedStatus) {
      nextRow = {
        ...nextRow,
        savedStatus: updatedStatus,
      };
      if (updatedStatus === "pullback_available") {
        nextRow = {
          ...nextRow,
          confirmedPullbackItems: [],
        };
      }
    }

    return nextRow;
  }

  async function savePullbackContactAttempt() {
    if (!contactLogModal) return;
    const sp = contactDraft.salesperson.trim();
    if (!sp) return;

    const entry: PullbackContactLogEntry = {
      localId: crypto.randomUUID(),
      channel: contactDraft.channel,
      response: contactDraft.response,
      notes: contactDraft.notes.trim(),
      salesperson: sp,
      loggedAt: new Date(),
    };

    const itemId =
      contactLogModal.itemId ??
      rows.find((r) => r.groupValue === contactLogModal.groupValue)?.savedPullbackItemIdByStock?.[
        contactLogModal.stockNo
      ];

    if (itemId) {
      setContactSaveError(null);
      try {
        const res = await fetch("/api/replenishment/pullback-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId,
            channel: toApiChannel(contactDraft.channel),
            clientResponse: toApiClientResponse(contactDraft.response),
            notes: contactDraft.notes.trim() || null,
            salesperson: sp,
          }),
        });
        const payload = (await res.json()) as {
          message?: string;
          success?: boolean;
          updatedStatus?: string | null;
        };
        if (!res.ok) {
          setContactSaveError(payload.message ?? "Failed to save contact log.");
          return;
        }
        setRows((prev) =>
          finalizeRows(
            prev.map((row) => {
              if (row.groupValue !== contactLogModal.groupValue) return row;
              return applyContactLogToRow(
                row,
                contactLogModal.stockNo,
                entry,
                payload.updatedStatus ?? null,
              );
            }),
          ),
        );
      } catch {
        setContactSaveError("Network error. Please try again.");
        return;
      }
    } else {
      setRows((prev) =>
        finalizeRows(
          prev.map((row) => {
            if (row.groupValue !== contactLogModal.groupValue) return row;
            return applyContactLogToRow(row, contactLogModal.stockNo, entry, null);
          }),
        ),
      );
    }

    setContactDraft({
      channel: "WhatsApp",
      response: "Accepted",
      notes: "",
      salesperson: "",
    });
  }

  function buildConfirmPayload() {
    return rows
      .filter((row) => {
        const a = computeAllocationBreakdown(row, replenPartyKey);
        return (
          row.selectedWarehouseStockNos.size > 0 ||
          row.confirmedPullbackItems.length > 0 ||
          a.memoAlloc > 0 ||
          a.factoryAllocDisplay > 0 ||
          (a.pullAlloc > 0 && !row.skippedPullback)
        );
      })
      .map((row) => {
        const alloc = computeAllocationBreakdown(row, replenPartyKey);
        const clientMemoStockNos = row.pullbackItems
          .filter((p) => normalizeReplenParty(p.PartyName) === replenPartyKey)
          .map((p) => p.StockNo);
        return {
          groupValue: row.groupValue,
          invoiceNos: row.invoiceNos,
          overrideQty: row.overrideQty,
          skippedPullback: row.skippedPullback,
          allocation: {
            memoAlloc: alloc.memoAlloc,
            stockAlloc: alloc.stockAlloc,
            pullAlloc: alloc.pullAlloc,
            factoryAllocDisplay: alloc.factoryAllocDisplay,
            pullbackAvail: alloc.pullbackAvail,
          },
          pullbackBadge: derivePullbackBadgeState(row, replenPartyKey),
          clientMemoStockNos,
          stockNos: [
            ...[...row.selectedWarehouseStockNos].map((stockNo) => ({
              stockNo,
              type: "warehouse" as const,
            })),
            ...row.confirmedPullbackItems.map((pb) => ({
              stockNo: pb.StockNo,
              type: "pullback" as const,
            })),
          ],
          confirmedPullbackItems: row.confirmedPullbackItems,
          pullbackChangeHistory: row.pullbackChangeHistory.map((h) => ({
            previousItems: h.previousItems,
            reason: h.reason,
            changedAt: h.changedAt.toISOString(),
          })),
          pullbackContactLogs: row.pullbackContactLogs.map((bucket) => ({
            stockNo: bucket.stockNo,
            logs: bucket.logs.map((log) => ({
              localId: log.localId,
              channel: log.channel,
              response: log.response,
              notes: log.notes,
              salesperson: log.salesperson,
              loggedAt: log.loggedAt.toISOString(),
            })),
          })),
        };
      });
  }

  function buildExportSnapshot(): ReplenishmentExportSourceItem[] {
    const now = new Date().toISOString();
    const items: ReplenishmentExportSourceItem[] = [];
    for (const row of rows) {
      const alloc = computeAllocationBreakdown(row, replenPartyKey);
      const badge = derivePullbackBadgeState(row, replenPartyKey);
      for (const inv of row.invoiceNos) {
        for (const sn of row.selectedWarehouseStockNos) {
          items.push({
            invoiceNo: inv,
            partyName: exportDisplayName,
            styleNo: row.groupValue,
            status: "stock",
            stockNo: sn,
            replenishedByName: "—",
            replenishedAt: now,
          });
        }
        for (let i = 0; i < alloc.memoAlloc; i++) {
          items.push({
            invoiceNo: inv,
            partyName: exportDisplayName,
            styleNo: row.groupValue,
            status: "memo",
            stockNo: "—",
            replenishedByName: "—",
            replenishedAt: now,
          });
        }
        for (const pb of row.confirmedPullbackItems) {
          const status =
            badge === "pb_in_progress" ? "pending_pullback" : "pullback_confirmed";
          items.push({
            invoiceNo: inv,
            partyName: exportDisplayName,
            styleNo: row.groupValue,
            status,
            stockNo: pb.StockNo,
            replenishedByName: "—",
            replenishedAt: now,
          });
        }
        for (let i = 0; i < alloc.factoryAllocDisplay; i++) {
          items.push({
            invoiceNo: inv,
            partyName: exportDisplayName,
            styleNo: row.groupValue,
            status: "factory_order",
            stockNo: "—",
            replenishedByName: "—",
            replenishedAt: now,
          });
        }
      }
    }
    return items;
  }

  function resolveSavedStatus(row: TableRow): string {
    const alloc = computeAllocationBreakdown(row, replenPartyKey);
    const badge = derivePullbackBadgeState(row, replenPartyKey);
    if (row.selectedWarehouseStockNos.size > 0) return "stock";
    if (alloc.memoAlloc > 0 && alloc.stockAlloc === 0) return "memo";
    if (badge === "pullback_confirmed") return "pullback_confirmed";
    if (badge === "pb_in_progress") return "pending_pullback";
    if (badge === "pullback_available" && !row.skippedPullback) return "pullback";
    if (row.skippedPullback || alloc.factoryAllocDisplay > 0) return "factory_order";
    return "factory_order";
  }

  async function submitConfirm(force: boolean) {
    setConfirmLoading(true);
    try {
      const url = force ? "/api/replenishment/confirm?force=true" : "/api/replenishment/confirm";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupField: groupBy,
          rows: buildConfirmPayload(),
        }),
      });
      const payload = (await res.json()) as {
        message?: string;
        needsConfirmation?: boolean;
        inProgressCount?: number;
        success?: boolean;
      };
      if (payload.needsConfirmation && payload.inProgressCount) {
        setConfirmWarningCount(payload.inProgressCount);
        setConfirmWarningOpen(true);
        return;
      }
      if (!res.ok) {
        setToast({ type: "error", message: payload.message ?? "Confirm failed." });
        return;
      }
      setConfirmed(true);
      setConfirmWarningOpen(false);
      setExportSnapshot(buildExportSnapshot());
      const idMap = await fetchPullbackItemIdByInvoiceStyle();
      setRows((prev) =>
        attachPullbackItemIds(
          prev.map((row) => {
            const status = resolveSavedStatus(row);
            const stockNo =
              status === "stock" ? [...row.selectedWarehouseStockNos][0] ?? null : null;
            return {
              ...row,
              savedStatus: status,
              savedStockNo: stockNo,
              savedPullbackCandidateCount: computeAllocationBreakdown(row, replenPartyKey).pullbackAvail,
            };
          }),
          idMap,
        ),
      );
      setToast({ type: "success", message: "Replenishment confirmed successfully." });
    } catch {
      setToast({ type: "error", message: "Unexpected error. Please try again." });
    } finally {
      setConfirmLoading(false);
    }
  }

  function handleConfirm() {
    void submitConfirm(false);
  }

  function exportConfirmedPdf() {
    if (!confirmed || exportSnapshot.length === 0) return;
    exportConfirmedReplenishmentPdf(toConfirmedExportRows(exportSnapshot), exportDisplayName);
  }

  async function exportConfirmedExcel() {
    if (!confirmed || exportSnapshot.length === 0) return;
    await exportConfirmedReplenishmentExcel(toConfirmedExportRows(exportSnapshot), exportDisplayName);
  }

  function exportFactoryPdf() {
    if (!confirmed || exportSnapshot.length === 0) return;
    exportFactoryOrdersPdf(toFactoryExportRows(exportSnapshot), exportDisplayName);
  }

  async function exportFactoryExcel() {
    if (!confirmed || exportSnapshot.length === 0) return;
    await exportFactoryOrdersExcel(toFactoryExportRows(exportSnapshot), exportDisplayName);
  }

  function togglePendingSort(col: typeof pendingSortBy) {
    if (pendingSortBy === col) {
      setPendingSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setPendingSortBy(col);
      setPendingSortDir(col === "daysSinceSold" ? "desc" : "asc");
    }
  }


  const pullbackContactSortedLogs = useMemo(() => {
    if (!contactLogModal) return [];
    const row = rows.find((r) => r.groupValue === contactLogModal.groupValue);
    const bucket = row?.pullbackContactLogs.find((b) => b.stockNo === contactLogModal.stockNo);
    if (!bucket) return [];
    return [...bucket.logs].sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
  }, [contactLogModal, rows]);

  const reTh =
    "sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm";
  const reTd = "border-b border-border px-4 py-3.5 align-top text-sm text-foreground";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-end gap-6 border-b border-border px-1">
        <button
          type="button"
          onClick={() => setMainTab("search")}
          className={
            mainTab === "search"
              ? "border-b-2 border-foreground pb-2 text-sm font-semibold text-foreground"
              : "pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Search & Replenish
        </button>
        <button
          type="button"
          onClick={() => setMainTab("history")}
          className={
            mainTab === "history"
              ? "border-b-2 border-foreground pb-2 text-sm font-semibold text-foreground"
              : "pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          }
        >
          History
        </button>
      </div>

      {mainTab === "history" ? (
        <ReplenishmentHistoryTab session={session} />
      ) : null}

      {mainTab === "search" ? (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="surface-card relative z-20 shrink-0 overflow-visible p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
              Find lines to replenish
            </h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Search by client or invoice across a date range.
            </p>
          </div>
          <div className="inline-flex shrink-0 gap-0.5 rounded-full bg-secondary p-0.5">
            <button
              type="button"
              onClick={() => {
                setSearchMode("client");
                setError(null);
                setInvoiceSearchSummary(null);
              }}
              className={cn(
                "h-8 rounded-full px-4 text-[12px] font-semibold transition",
                searchMode === "client"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Client
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchMode("invoice");
                setError(null);
                setInvoiceSearchSummary(null);
              }}
              className={cn(
                "h-8 rounded-full px-4 text-[12px] font-semibold transition",
                searchMode === "invoice"
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Invoice
            </button>
          </div>
        </div>
        {searchMode === "client" ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1.5">
            <label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Client
            </label>
            <div className="relative" ref={clientSuggestRef}>
              <input
                value={clientSearch}
                onChange={(e) => {
                  const next = e.target.value;
                  setClientSearch(next);
                  void fetchClientSuggestions(next);
                }}
                onFocus={() => {
                  if (clientSearch.trim().length >= 3 && clientSuggestions.length > 0) {
                    setSuggestionsOpen(true);
                  }
                }}
                onKeyDown={(e) => {
                  if (!suggestionsOpen || clientSuggestions.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setClientHighlightIndex((i) => Math.min(i + 1, clientSuggestions.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setClientHighlightIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const c = clientSuggestions[clientHighlightIndex];
                    if (c) selectClientSuggestion(c);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setSuggestionsOpen(false);
                  }
                }}
                placeholder="Search client name…"
                className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-2 focus:ring-ring/20"
                autoComplete="off"
                role="combobox"
                aria-expanded={suggestionsOpen}
                aria-controls="client-suggest-listbox"
                aria-autocomplete="list"
                {...(suggestionsOpen && clientSuggestions.length > 0
                  ? { "aria-activedescendant": `client-suggest-opt-${clientHighlightIndex}` }
                  : {})}
              />
              {clientSearch.trim().length >= 3 && suggestionsOpen ? (
                <div
                  id="client-suggest-listbox"
                  className="absolute top-full right-0 left-0 z-50 mt-1.5 max-h-[min(18rem,calc(100vh-8rem))] overflow-y-auto rounded-xl border border-border/90 bg-card p-2 shadow-[0_12px_40px_-12px_rgba(15,15,15,0.22)] ring-1 ring-stone-900/[0.06]"
                  role="listbox"
                  aria-label="Client matches"
                >
                  <p className="mb-1 text-xs text-muted-foreground">
                    {clientLoading
                      ? "Searching clients..."
                      : clientSuggestions.length > 0
                        ? "Use ↑ ↓ and Enter to choose a client"
                        : "No matching client found"}
                  </p>
                  {clientSuggestions.length > 0
                    ? clientSuggestions.map((client, index) => {
                        const keyboardActive = index === clientHighlightIndex;
                        const autoSelected = client.ClientID === clientId;
                        return (
                          <button
                            key={client.ClientID}
                            type="button"
                            role="option"
                            aria-selected={autoSelected || keyboardActive}
                            id={`client-suggest-opt-${index}`}
                            onMouseEnter={() => setClientHighlightIndex(index)}
                            onClick={() => selectClientSuggestion(client)}
                            className={[
                              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition",
                              keyboardActive
                                ? "bg-secondary font-medium text-foreground ring-2 ring-ring/30/80"
                                : autoSelected
                                  ? "bg-secondary text-foreground"
                                  : "text-foreground hover:bg-secondary",
                            ].join(" ")}
                          >
                            <span>{client.PartyName}</span>
                          </button>
                        );
                      })
                    : null}
                </div>
              ) : null}
            </div>
          </div>
          <DatePickerInput label="From Date" compactLabel="From" value={fromDate} onChange={setFromDate} />
          <DatePickerInput label="To Date" compactLabel="To" value={toDate} onChange={setToDate} />
          <div className="flex items-end">
            <button
              type="button"
              disabled={loading}
              onClick={handleSearch}
              className={cn(btnPrimary, "h-11 w-full min-w-[7.5rem] px-6")}
            >
              <Search className="size-4" strokeWidth={2.2} />
              Search
            </button>
          </div>
        </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1.5">
              <label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Invoice
              </label>
              <input
                value={invoiceNoInput}
                onChange={(e) => setInvoiceNoInput(e.target.value)}
                placeholder="e.g. INV-0291"
                className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/25 focus:ring-2 focus:ring-ring/20"
                autoComplete="off"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={loading}
                onClick={handleSearch}
                className={cn(btnPrimary, "h-11 w-full min-w-[7.5rem] px-6")}
              >
                <Search className="size-4" strokeWidth={2.2} />
                Search
              </button>
            </div>
          </div>
        )}
        {invoiceSearchSummary ? (
          <p
            className="mt-2 rounded-md border-[0.5px] border-foreground bg-[#EDE9FE] px-3 py-1.5 text-xs font-medium text-foreground sm:text-sm"
            role="status"
          >
            Invoice #{invoiceSearchSummary.invoiceNo} · {invoiceSearchSummary.partyName} ·{" "}
            {new Date(invoiceSearchSummary.invoiceDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {invoiceSearchSummary.lineCount} items
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}
      </div>

      <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Results</h3>
            {hasSearched && visibleRows.length > 0 ? (
              <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {visibleRows.length} group{visibleRows.length === 1 ? "" : "s"}
              </span>
            ) : null}
            {hasSearched && pendingInvoiceTotal > 0 ? (
              <button
                type="button"
                onClick={() => setShowPendingDrawer(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-800 transition hover:bg-red-100"
              >
                {pendingInvoiceTotal} pending invoice{pendingInvoiceTotal === 1 ? "" : "s"}
                <ChevronRight className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
            {rows.length > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  className="size-3.5 rounded border-border"
                />
                Show completed
              </label>
            ) : null}
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-[12px] font-medium text-muted-foreground">Group by</span>
              <GroupByTreeMenu
                groupBy={groupBy}
                onSelect={onGroupByChange}
                activeRowCount={hasSearched ? rows.length : null}
                disabled={loading}
              />
            </div>
            {rows.length > 0 && showExportConfirmed ? (
              <IconExportButtons
                disabled={!confirmed}
                onPdf={exportConfirmedPdf}
                onExcel={exportConfirmedExcel}
              />
            ) : null}
            {rows.length > 0 && showExportFactoryOrders && !showExportConfirmed ? (
              <IconExportButtons
                disabled={!confirmed}
                onPdf={exportFactoryPdf}
                onExcel={exportFactoryExcel}
              />
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-3 border-b border-border/80 bg-secondary/30 px-4 py-2 sm:hidden">
            {rows.length > 0 && showExportFactoryOrders && showExportConfirmed ? (
              <span className="text-[11px] text-muted-foreground">Factory exports after confirm</span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={`${reTh} min-w-[5.5rem] whitespace-nowrap`}>Style</th>
                  <th className={`${reTh} min-w-[11rem]`}>Product</th>
                  <th className={reTh}>Sold</th>
                  <th className={reTh}>Qty</th>
                  <th className={`${reTh} min-w-[8.5rem]`}>Status</th>
                  <th className={reTh}>WH</th>
                  <th className={reTh}>Pullback</th>
                  <th className={reTh}>Factory</th>
                  <th className={`${reTh} min-w-[5.5rem] text-right`}> </th>
                </tr>
              </thead>
              <tbody className="bg-card">
                {repPageRows.map((row) => {
                  const ui = deriveRowUiState(row, replenPartyKey);
                  return (
                  <tr
                    key={row.groupValue}
                    className={[
                      "transition-colors",
                      ui.isDisabled ? "pointer-events-none bg-[#FAFAF9] opacity-50" : "hover:bg-secondary/80",
                    ].join(" ")}
                  >
                    <td className={`${reTd} font-semibold text-foreground`}>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-foreground">{row.groupValue}</span>
                        {row.styleRank != null ? (
                          <span className="inline-flex items-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            #{row.styleRank}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${reTd} max-w-xs text-[13px] leading-snug text-muted-foreground`}>
                      {row.productSummary}
                    </td>
                    <td className={`${reTd} font-medium tabular-nums text-foreground`}>{row.soldQty}</td>
                    <td className={reTd}>
                      <div className="inline-flex min-w-[3rem] items-center justify-center rounded-full bg-secondary px-3 py-1">
                        <input
                          type="number"
                          min={0}
                          value={row.overrideQty}
                          onChange={(e) => onOverrideQtyChange(row.groupValue, Number(e.target.value))}
                          className="w-10 border-0 bg-transparent p-0 text-center text-sm font-semibold tabular-nums text-foreground outline-none focus:ring-0"
                        />
                      </div>
                    </td>
                    <td className={`${reTd} align-middle`}>
                      {ui.disabledChip ? (
                        <DisabledStatusChip label={ui.disabledChip} />
                      ) : (
                        <ReplenishmentStatusCell
                          row={row}
                          replenPartyNorm={replenPartyKey}
                          setRows={setRows}
                          finalizeRows={finalizeRows}
                        />
                      )}
                    </td>
                    <td className={`${reTd} align-top`}>
                      <div className="space-y-1.5">
                        <span className="font-medium tabular-nums text-foreground">
                          {row.inWarehouse > 0 ? row.inWarehouse : "—"}
                        </span>
                        {row.warehousePillStockNos.length > 0 ? (
                          <StockPillGroup
                            allStockNos={row.warehousePillStockNos}
                            selectedStockNos={row.selectedWarehouseStockNos}
                            onToggle={(sn) => onTogglePill(row.groupValue, sn)}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className={`${reTd} font-medium tabular-nums text-foreground`}>
                      {row.pullbackAvailable > 0 ? row.pullbackAvailable : "—"}
                    </td>
                    <td className={`${reTd} font-semibold tabular-nums text-foreground`}>
                      {row.factoryOrder > 0 ? row.factoryOrder : "—"}
                    </td>
                    <td className={`${reTd} text-right align-middle`}>
                      <div className="flex flex-col items-end gap-1.5">
                        {!ui.isDisabled &&
                        !row.skippedPullback &&
                        computeAllocationBreakdown(row, replenPartyKey).pullbackAvail > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPullbackDrawer(row.groupValue);
                            }}
                            className={cn(
                              btnGhost,
                              "h-8 gap-1.5 px-3 text-[12px] font-semibold",
                            )}
                            aria-label={`View pullback for ${row.groupValue}`}
                          >
                            <Eye className="size-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
                            View
                          </button>
                        ) : null}
                        {row.confirmedPullbackItems.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {row.confirmedPullbackItems.map((item) => {
                                const variant = pullbackPillVariant(row, item.StockNo);
                                const dotMeta =
                                  variant === "blue"
                                    ? { bg: "#059669", title: "Pullback confirmed" }
                                    : { bg: "#D97706", title: "Contact in progress" };
                                const pillTone =
                                  variant === "blue"
                                    ? "bg-[#DBEAFE] text-[#1E40AF] hover:bg-[#BFDBFE]"
                                    : "bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A]";
                                const rmItem = removeConfirmDialog.item;
                                const confirmOpen =
                                  removeConfirmDialog.open &&
                                  removeConfirmDialog.groupValue === row.groupValue &&
                                  rmItem !== null &&
                                  pullbackRowKey(rmItem) === pullbackRowKey(item);
                                return (
                                  <div
                                    key={`${item.StockNo}-${item.MemoNo}`}
                                    className="relative inline-flex flex-col items-start gap-1"
                                  >
                                    <div
                                      className={`group relative inline-flex max-w-full cursor-pointer items-stretch overflow-hidden rounded-full transition-colors duration-150 ${pillTone}`}
                                    >
                                      <button
                                        type="button"
                                        className="inline-flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1"
                                        onClick={() => {
                                          setContactSaveError(null);
                                          setContactLogModal({
                                            groupValue: row.groupValue,
                                            stockNo: item.StockNo,
                                            clientName: (item.PartyName ?? "").trim() || "Client",
                                            itemId:
                                              row.savedPullbackItemIdByStock?.[item.StockNo] ??
                                              row.savedPullbackItemIdByStock?.__item,
                                            defaultExpanded: true,
                                          });
                                        }}
                                        aria-label={`Open contact log for ${item.StockNo}`}
                                      >
                                        <span
                                          className="inline-block size-2 shrink-0 rounded-full"
                                          style={{ backgroundColor: dotMeta.bg }}
                                          title={dotMeta.title}
                                        />
                                        <span className="min-w-0 truncate">
                                          {abbreviateClientName(item.PartyName)} · {item.StockNo}
                                        </span>
                                        <span className="ml-1 hidden shrink-0 items-center gap-0.5 group-hover:inline-flex">
                                          <span title="Log contact attempt">
                                            <MessageCircle className="size-3 opacity-70" aria-hidden />
                                          </span>
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        title="Remove from pullback"
                                        className="hidden shrink-0 items-center justify-center border-l border-black/[0.08] px-2 py-1 text-current opacity-70 transition-colors hover:text-[#991B1B] hover:opacity-100 group-hover:inline-flex"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemovePullbackItem(row.groupValue, item);
                                        }}
                                      >
                                        <X className="size-3" aria-hidden />
                                      </button>
                                    </div>
                                    {confirmOpen ? (
                                      <div
                                        className="absolute top-full left-0 z-50 mt-1 max-w-[320px] rounded-[10px] border-[0.5px] border-[#D97706] bg-[#FFFBEB] px-4 py-3.5 shadow-lg"
                                        role="dialog"
                                        aria-labelledby={`remove-pullback-${item.StockNo}`}
                                      >
                                        <div className="flex gap-2">
                                          <AlertTriangle className="size-4 shrink-0 text-[#D97706]" aria-hidden />
                                          <div className="min-w-0 space-y-2">
                                            <p
                                              id={`remove-pullback-${item.StockNo}`}
                                              className="text-sm font-semibold text-foreground"
                                            >
                                              Remove pullback?
                                            </p>
                                            <p className="text-[13px] leading-snug text-foreground">
                                              This will move{" "}
                                              <span className="font-semibold">{row.groupValue}</span> to Factory Order.
                                            </p>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                              <button
                                                type="button"
                                                className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                                                onClick={confirmRemoveOnlyPullback}
                                              >
                                                Remove & Skip to Factory
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
                                                onClick={() =>
                                                  setRemoveConfirmDialog({
                                                    open: false,
                                                    groupValue: "",
                                                    item: null,
                                                  })
                                                }
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setChangeReasonModalGroup(row.groupValue);
                                setChangeReasonDraft("");
                              }}
                              className="self-start text-left text-[11px] font-medium text-foreground underline-offset-4 hover:text-foreground hover:underline"
                            >
                              Change Selection
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="align-middle bg-card">
                      <div className="flex min-h-[min(42vh,340px)] flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                        {loading ? (
                          <>
                            <Loader2 className="size-9 shrink-0 animate-spin text-foreground/80" aria-hidden />
                            <p className="text-sm font-medium text-foreground">Searching…</p>
                            <p className="max-w-xs text-xs text-muted-foreground">Matching sales to stock for this client.</p>
                          </>
                        ) : hasSearched && !error ? (
                          <>
                            <Table2 strokeWidth={1.25} className="size-10 shrink-0 text-muted-foreground/60" aria-hidden />
                            <p className="text-sm font-medium text-foreground">No groups for this search</p>
                            <p className="max-w-xs text-xs text-muted-foreground">Adjust the date range or pick another client.</p>
                          </>
                        ) : (
                          <>
                            <Table2 strokeWidth={1.25} className="size-10 shrink-0 text-muted-foreground/60" aria-hidden />
                            <p className="text-sm font-medium text-foreground">Results will appear here</p>
                            <p className="max-w-xs text-xs text-muted-foreground">Pick a client and dates, then run Search.</p>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {rows.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 sm:px-5">
              <p className="text-[13px] font-medium tabular-nums text-muted-foreground">
                {repStartRow}–{repEndRow} of {visibleRows.length}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <span className="font-medium">Rows</span>
                  <select
                    value={repPageSize}
                    onChange={(e) => {
                      setRepPageSize(Number(e.target.value));
                      setRepPage(0);
                    }}
                    className="h-8 cursor-pointer rounded-full border border-border bg-card px-2.5 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring/20"
                  >
                    {REP_PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRepPage((p) => Math.max(0, p - 1))}
                    disabled={safeRepPage === 0}
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="min-w-[3.5rem] text-center text-[13px] font-semibold tabular-nums text-foreground">
                    {safeRepPage + 1}/{repTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRepPage((p) => Math.min(repTotalPages - 1, p + 1))}
                    disabled={safeRepPage >= repTotalPages - 1}
                    className="flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="surface-card flex shrink-0 flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              {confirmSummary.lines > 0 ? (
                <>
                  {confirmSummary.lines} line{confirmSummary.lines === 1 ? "" : "s"} · {confirmSummary.units} unit
                  {confirmSummary.units === 1 ? "" : "s"} across pullback & factory
                </>
              ) : (
                <>Select warehouse stock, pullback, or factory lines to confirm</>
              )}
            </p>
            {toast ? (
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium",
                  toast.type === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800",
                )}
              >
                {toast.type === "success" ? <Check className="size-4 shrink-0" /> : <X className="size-4 shrink-0" />}
                {toast.message}
              </div>
            ) : null}
            {showExportFactoryOrders && confirmed && showExportConfirmed ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <ExportDropdown
                  label="Factory orders"
                  disabled={false}
                  onPdf={exportFactoryPdf}
                  onExcel={() => void exportFactoryExcel()}
                />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!canConfirmReplenishment || confirmLoading || confirmed}
            onClick={handleConfirm}
            className={cn(btnPrimary, "h-11 shrink-0 px-6")}
          >
            <Check className="size-4" strokeWidth={2.2} />
            {confirmed ? "Confirmed" : confirmLoading ? "Confirming…" : "Confirm Replenishment"}
          </button>
        </div>
      ) : null}

      <PullbackDrawer
        open={Boolean(pullbackDrawer && pullbackDrawerBundle)}
        titleCount={pullbackDrawerBundle?.titleCount ?? 0}
        candidates={pullbackDrawerBundle?.candidates ?? []}
        maxSelectable={pullbackDrawerBundle?.maxSelectable ?? 0}
        getContactLogsForStock={(stockNo) => {
          if (!pullbackDrawer) return [];
          const r = rows.find((x) => x.groupValue === pullbackDrawer);
          const bucket = r?.pullbackContactLogs.find((b) => b.stockNo === stockNo);
          return (bucket?.logs ?? []).map((l) => ({ response: l.response, loggedAt: l.loggedAt }));
        }}
        onSwapRejected={handleSwapRejectedFromDrawer}
        onClose={() => {
          setPullbackDrawer(null);
        }}
        onConfirm={onPullbackConfirm}
      />

      {changeReasonModalGroup ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pullback-change-reason-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h3 id="pullback-change-reason-title" className="text-lg font-semibold text-foreground">
              Reason for Change
            </h3>
            <textarea
              value={changeReasonDraft}
              onChange={(e) => setChangeReasonDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
              placeholder="Describe why pullback selection changes (minimum 10 characters)."
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setChangeReasonModalGroup(null);
                  setChangeReasonDraft("");
                }}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={changeReasonDraft.trim().length < 10}
                onClick={submitChangePullbackReason}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue to Change
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {swapRejectedModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="swap-rejected-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h3 id="swap-rejected-title" className="text-lg font-semibold text-foreground">
              Reason for swap
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Removing rejected pullback selection for{" "}
              <span className="font-mono font-semibold text-foreground">{swapRejectedModal.item.StockNo}</span>.
            </p>
            <textarea
              value={swapRejectedReasonDraft}
              onChange={(e) => setSwapRejectedReasonDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
              placeholder="Describe why you are swapping this selection (minimum 10 characters)."
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSwapRejectedModal(null);
                  setSwapRejectedReasonDraft("");
                }}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={swapRejectedReasonDraft.trim().length < 10}
                onClick={submitSwapRejectedReason}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save & reopen drawer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {removeReasonModal.open && removeReasonModal.item ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/50 p-3 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-pullback-reason-title"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <h3 id="remove-pullback-reason-title" className="text-lg font-semibold text-foreground">
              Reason for Removing {abbreviateClientName(removeReasonModal.item.PartyName)} ·{" "}
              {removeReasonModal.item.StockNo}
            </h3>
            <textarea
              value={removeReasonDraft}
              onChange={(e) => setRemoveReasonDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/20"
              placeholder="Why are you removing this pullback item?"
            />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRemoveReasonModal({ open: false, groupValue: "", item: null });
                  setRemoveReasonDraft("");
                }}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={removeReasonDraft.trim().length < 10}
                onClick={submitRemovePullbackWithReason}
                className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove Item
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmWarningOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
          >
            <div className="flex gap-3">
              <AlertTriangle className="size-5 shrink-0 text-amber-600" />
              <div>
                <h3 className="text-lg font-semibold text-foreground">Pending pullbacks</h3>
                <p className="mt-2 text-sm text-foreground">
                  {confirmWarningCount} item{confirmWarningCount === 1 ? "" : "s"} still have pending pullbacks.
                  These will be saved as Pending Pullback and will NOT be included in the confirmed
                  replenishment export. Continue?
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmWarningOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary"
              >
                Go Back
              </button>
              <button
                type="button"
                disabled={confirmLoading}
                onClick={() => void submitConfirm(true)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPendingDrawer ? (
        <>
          <button
            type="button"
            aria-label="Close pending invoices drawer"
            className="fixed inset-0 z-[65] bg-stone-950/40"
            onClick={() => setShowPendingDrawer(false)}
          />
          <aside className="fixed inset-y-0 right-0 z-[66] flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Pending Invoices</h2>
              <button
                type="button"
                onClick={() => setShowPendingDrawer(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {pendingDrawerLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="size-8 animate-spin text-foreground" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-secondary">
                    <tr>
                      {(
                        [
                          ["invoiceNo", "InvoiceNo"],
                          ["partyName", "Party Name"],
                          ["pieceCount", "No. of Pieces"],
                          ["daysSinceSold", "Days Since Sold"],
                        ] as const
                      ).map(([key, label]) => (
                        <th key={key} className="border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                          <button type="button" onClick={() => togglePendingSort(key)} className="hover:text-foreground">
                            {label}
                            {pendingSortBy === key ? (pendingSortDir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvoices.map((inv) => (
                      <tr key={inv.invoiceNo} className="border-b border-stone-100 hover:bg-secondary/80">
                        <td className="px-3 py-2 font-mono font-medium">{inv.invoiceNo}</td>
                        <td className="px-3 py-2">{inv.partyName}</td>
                        <td className="px-3 py-2 tabular-nums">{inv.pieceCount}</td>
                        <td className={`px-3 py-2 tabular-nums ${daysSinceSoldClass(inv.daysSinceSold)}`}>
                          {inv.daysSinceSold}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        </>
      ) : null}

      {contactLogModal ? (
        <>
          {contactSaveError ? (
            <p className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800 shadow-lg">
              {contactSaveError}
            </p>
          ) : null}
          <PullbackContactLogModal
            key={`${contactLogModal.groupValue}-${contactLogModal.stockNo}`}
            clientName={contactLogModal.clientName}
            stockNo={contactLogModal.stockNo}
            defaultExpanded={contactLogModal.defaultExpanded}
            logs={pullbackContactSortedLogs}
            contactDraft={contactDraft}
            setContactDraft={setContactDraft}
            salespersonChoices={salespersonChoices}
            onClose={() => {
              setContactLogModal(null);
              setContactSaveError(null);
            }}
            onSave={() => void savePullbackContactAttempt()}
          />
        </>
      ) : null}
    </section>
      ) : null}
    </div>
  );
}
