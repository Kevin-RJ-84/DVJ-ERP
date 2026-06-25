"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
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
import { classifyItemStatus, isConfirmedStatus, isFactoryStatus } from "@/lib/replenishment-item-status";

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

function canRescan(session: DashboardSession | null): boolean {
  if (!session) return false;
  const isLegacyAdmin = session.role === "admin";
  return isLegacyAdmin || sessionHasPermission(session, "replenishment.rescan");
}

const PAGE_SIZE = 25;

type HistoryLineItem = {
  itemId: string;
  styleNo: string;
  metalType: string | null;
  status: string;
  stockNo: string;
  holdCompany: string | null;
  productDescription: string | null;
  metalPurity: string | null;
  replenishedByName: string;
  replenishedAt: string;
  rescanCount: number;
  lastRescannedAt: string | null;
  canRescan: boolean;
};

type HistoryGroup = {
  type: "invoice" | "style_upload";
  invoiceNo: string | null;
  styleUploadRef: string | null;
  replenishmentType: "invoice" | "style_upload";
  partyName: string;
  replenishedAt: string;
  replenishedByName: string;
  totalItems: number;
  confirmedCount: number;
  factoryCount: number;
  pendingCount: number;
  soldCount: number;
  rescanableCount: number;
  items: HistoryLineItem[];
};

type ClientOption = { ClientID: string; PartyName: string };

type RescanResultRow = {
  itemId: string;
  styleNo: string;
  oldStatus: string;
  newStatus: string;
  oldStockNo: string | null;
  newStockNo: string | null;
  changed: boolean;
};

function groupKeyOf(group: HistoryGroup): string {
  return group.type === "style_upload" ? `ref:${group.styleUploadRef}` : `inv:${group.invoiceNo}`;
}

function formatAt(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

const histBadgeWrap = "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold";

function historyStatusBadge(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    stock: { label: "Stock", className: "bg-[#DCFCE7] text-[#166634]" },
    memo: { label: "Memo", className: "bg-[#EDE9FE] text-[#3B0764]" },
    hold: { label: "Hold", className: "bg-[#FCE7F3] text-[#9D174D]" },
    pullback_confirmed: { label: "Pullback Confirmed", className: "bg-[#DBEAFE] text-[#1E40AF]" },
    pb_in_progress: { label: "PB In Progress", className: "bg-[#FEF3C7] text-[#92400E]" },
    pending_pullback: { label: "Pending Pullback", className: "bg-[#FEF3C7] text-[#92400E]" },
    pullback_available: { label: "Pullback Available", className: "bg-[#FEE2E2] text-[#991B1B]" },
    pullback: { label: "Pullback", className: "bg-[#FEE2E2] text-[#991B1B]" },
    factory_order: { label: "Factory Order", className: "bg-[#F1F5F9] text-[#475569]" },
    factory_order_placed: { label: "Ordered", className: "bg-[#DBEAFE] text-[#1E40AF]" },
    sold: { label: "Sold ✓", className: "bg-[#F3F4F6] text-[#9CA3AF]" },
  };
  return map[s] ?? { label: status, className: "bg-stone-200 text-stone-800" };
}

function recomputeGroupCounts(group: HistoryGroup): HistoryGroup {
  let confirmedCount = 0;
  let factoryCount = 0;
  let pendingCount = 0;
  let soldCount = 0;
  let rescanableCount = 0;

  for (const item of group.items) {
    const status = item.status.toLowerCase();
    if (status === "sold") {
      soldCount += 1;
      continue;
    }
    rescanableCount += 1;
    const bucket = classifyItemStatus(item.status);
    if (bucket === "confirmed") confirmedCount += 1;
    else if (bucket === "factory") factoryCount += 1;
    else if (bucket === "pending") pendingCount += 1;
  }

  return {
    ...group,
    totalItems: group.items.length,
    confirmedCount,
    factoryCount,
    pendingCount,
    soldCount,
    rescanableCount,
  };
}

function applyRescanResultsToGroups(
  groups: HistoryGroup[],
  results: RescanResultRow[],
): HistoryGroup[] {
  const byId = new Map(results.map((r) => [r.itemId, r]));
  return groups.map((group) => {
    let touched = false;
    const items = group.items.map((item) => {
      const result = byId.get(item.itemId);
      if (!result) return item;
      touched = true;
      const status = result.newStatus;
      return {
        ...item,
        status,
        stockNo: result.newStockNo ?? item.stockNo,
        canRescan: status.toLowerCase() !== "sold",
        rescanCount: result.changed ? item.rescanCount + 1 : item.rescanCount,
        lastRescannedAt: result.changed ? new Date().toISOString() : item.lastRescannedAt,
      };
    });
    return touched ? recomputeGroupCounts({ ...group, items }) : group;
  });
}

function groupToExportItems(group: HistoryGroup): ReplenishmentExportSourceItem[] {
  const ref = group.invoiceNo ?? group.styleUploadRef ?? "—";
  return group.items.map((item) => ({
    invoiceNo: ref,
    partyName: group.partyName,
    styleNo: item.styleNo,
    status: item.status,
    stockNo: item.stockNo,
    productDescription: item.productDescription,
    metalType: item.metalType,
    metalPurity: item.metalPurity,
    replenishedByName: item.replenishedByName,
    replenishedAt: item.replenishedAt,
  }));
}

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
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-40"
      >
        {label}
        <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 min-w-[9rem] rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-stone-50"
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          >
            <FileDown className="size-3.5" />
            PDF
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-stone-50"
            onClick={() => {
              setOpen(false);
              onExcel();
            }}
          >
            <FileSpreadsheet className="size-3.5" />
            Excel
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ReplenishmentHistoryTab({ session = null }: { session?: DashboardSession | null }) {
  const showExportConfirmed = canExportConfirmed(session);
  const showExportFactoryOrders = canExportFactoryOrders(session);
  const showRescan = canRescan(session);
  const [accessOk, setAccessOk] = useState<boolean | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<ClientOption[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientsUnavailable, setClientsUnavailable] = useState(false);
  const clientSuggestRef = useRef<HTMLDivElement | null>(null);
  const [clientHighlightIndex, setClientHighlightIndex] = useState(0);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [applied, setApplied] = useState({ clientId: "", invoiceNo: "" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<HistoryGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [rescanningAll, setRescanningAll] = useState(false);
  const [rescanningGroups, setRescanningGroups] = useState<Set<string>>(new Set());
  const [rescanningItems, setRescanningItems] = useState<Set<string>>(new Set());
  const [highlightedItems, setHighlightedItems] = useState<Set<string>>(new Set());

  const totalRescanable = useMemo(
    () => groups.reduce((sum, g) => sum + g.rescanableCount, 0),
    [groups],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

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
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/replenishment/history?page=1&limit=1`, { credentials: "include" });
      if (cancelled) return;
      setAccessOk(res.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const params = new URLSearchParams({ search: q, matchMode: "startsWith", limit: "8" });
    try {
      const res = await fetch(`/api/clients?${params}`, { credentials: "include" });
      const payload = (await res.json()) as { clients?: ClientOption[] };
      setClientLoading(false);
      if (!res.ok) {
        setClientsUnavailable(true);
        setClientSuggestions([]);
        return;
      }
      setClientsUnavailable(false);
      setClientSuggestions(payload.clients ?? []);
      setClientId(payload.clients?.[0]?.ClientID ?? "");
    } catch {
      setClientLoading(false);
      setClientsUnavailable(true);
    }
  }

  function selectClientSuggestion(client: ClientOption) {
    setClientId(client.ClientID);
    setClientSearch(client.PartyName);
    setClientSuggestions([]);
    setSuggestionsOpen(false);
  }

  const fetchHistory = useCallback(async () => {
    if (accessOk === false) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (applied.clientId) params.set("clientId", applied.clientId);
      if (applied.invoiceNo) params.set("invoiceNo", applied.invoiceNo);
      const res = await fetch(`/api/replenishment/history?${params}`, { credentials: "include" });
      const data = (await res.json()) as {
        total?: number;
        items?: HistoryGroup[];
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "Failed to load history.");
      }
      setTotal(data.total ?? 0);
      setGroups(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history.");
      setGroups([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [accessOk, applied, page]);

  useEffect(() => {
    if (accessOk !== true) return;
    void fetchHistory();
  }, [accessOk, fetchHistory]);

  function applyFilters() {
    setPage(1);
    setExpandedGroups(new Set());
    setApplied({
      clientId,
      invoiceNo: invoiceNo.trim(),
    });
  }

  function clearFilters() {
    setClientSearch("");
    setClientId("");
    setInvoiceNo("");
    setPage(1);
    setExpandedGroups(new Set());
    setApplied({ clientId: "", invoiceNo: "" });
  }

  async function callRescan(body: Record<string, unknown>): Promise<{
    ok: boolean;
    changed: number;
    results: RescanResultRow[];
    message?: string;
  }> {
    const res = await fetch("/api/replenishment/rescan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const payload = (await res.json()) as {
      success?: boolean;
      changed?: number;
      results?: RescanResultRow[];
      message?: string;
    };
    return {
      ok: res.ok,
      changed: payload.changed ?? 0,
      results: payload.results ?? [],
      message: payload.message,
    };
  }

  function flashItems(itemIds: string[]) {
    const changedIds = itemIds.filter(Boolean);
    if (changedIds.length === 0) return;
    setHighlightedItems((prev) => new Set([...prev, ...changedIds]));
    window.setTimeout(() => {
      setHighlightedItems((prev) => {
        const next = new Set(prev);
        for (const id of changedIds) next.delete(id);
        return next;
      });
    }, 300);
  }

  async function handleRescanAll() {
    if (!showRescan || rescanningAll) return;
    setRescanningAll(true);
    try {
      const body = applied.invoiceNo
        ? { invoiceNo: applied.invoiceNo }
        : applied.clientId
          ? { all: true, clientId: applied.clientId }
          : { all: true };
      const { ok, changed, results, message } = await callRescan(body);
      if (!ok) {
        setToast({ type: "error", message: message ?? "Rescan failed." });
        return;
      }
      setGroups((prev) => applyRescanResultsToGroups(prev, results));
      flashItems(results.filter((r) => r.changed).map((r) => r.itemId));
      setToast({
        type: "success",
        message: changed > 0 ? `${changed} item${changed === 1 ? "" : "s"} updated` : "No changes found",
      });
      if (applied.invoiceNo || applied.clientId) {
        await fetchHistory();
      }
    } catch {
      setToast({ type: "error", message: "Rescan failed." });
    } finally {
      setRescanningAll(false);
    }
  }

  async function handleRescanGroup(group: HistoryGroup) {
    if (!showRescan) return;
    const key = groupKeyOf(group);
    if (rescanningGroups.has(key)) return;
    setRescanningGroups((prev) => new Set(prev).add(key));
    try {
      const body =
        group.type === "style_upload"
          ? { styleUploadRef: group.styleUploadRef }
          : { invoiceNo: group.invoiceNo };
      const { ok, changed, results, message } = await callRescan(body);
      if (!ok) {
        setToast({ type: "error", message: message ?? "Rescan failed." });
        return;
      }
      setGroups((prev) => applyRescanResultsToGroups(prev, results));
      flashItems(results.filter((r) => r.changed).map((r) => r.itemId));
      if (changed > 0) {
        setToast({
          type: "success",
          message: `${changed} item${changed === 1 ? "" : "s"} updated in group`,
        });
      }
    } catch {
      setToast({ type: "error", message: "Rescan failed." });
    } finally {
      setRescanningGroups((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleRescanItem(itemId: string) {
    if (!showRescan || rescanningItems.has(itemId)) return;
    setRescanningItems((prev) => new Set(prev).add(itemId));
    try {
      const { ok, results, message } = await callRescan({ itemIds: [itemId] });
      if (!ok) {
        setToast({ type: "error", message: message ?? "Rescan failed." });
        return;
      }
      setGroups((prev) => applyRescanResultsToGroups(prev, results));
      const changed = results.some((r) => r.changed);
      if (changed) flashItems([itemId]);
    } catch {
      setToast({ type: "error", message: "Rescan failed." });
    } finally {
      setRescanningItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const thHist =
    "border-b border-stone-200 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[#78716C]";
  const tdHist = "border-b border-stone-100 px-3 py-2 text-sm text-stone-800";

  if (accessOk === false) {
    return (
      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-amber-950">Access denied</p>
        <p className="mt-2 text-sm text-amber-900/90">
          You need <span className="font-mono text-xs">replenishment_history.view</span> to use History.
        </p>
      </div>
    );
  }

  if (accessOk === null) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-violet-600" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-2xl border border-stone-300 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:p-5">
        {showRescan && totalRescanable > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={rescanningAll || loading}
              onClick={() => void handleRescanAll()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 text-sm font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-50"
            >
              {rescanningAll ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" aria-hidden />
              )}
              Rescan All
            </button>
          </div>
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Filters</p>
        <div className="flex flex-wrap items-end gap-3">
          {!clientsUnavailable ? (
            <div className="relative min-w-[12rem] flex-1" ref={clientSuggestRef}>
              <label className="mb-1.5 block text-sm font-medium text-stone-700">Client name</label>
              <input
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  void fetchClientSuggestions(e.target.value);
                }}
                onFocus={() => {
                  if (clientSearch.trim().length >= 3 && clientSuggestions.length > 0) setSuggestionsOpen(true);
                }}
                placeholder="Type 3+ letters…"
                className="h-10 w-full rounded-lg border border-stone-300 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-300"
              />
              {suggestionsOpen && clientSuggestions.length > 0 ? (
                <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
                  {clientSuggestions.map((c, i) => (
                    <li key={c.ClientID}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-stone-50 ${i === clientHighlightIndex ? "bg-violet-50" : ""}`}
                        onClick={() => selectClientSuggestion(c)}
                      >
                        {c.PartyName}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="min-w-[10rem] flex-1">
            <label className="mb-1.5 block text-sm font-medium text-stone-700">Invoice / Ref no</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="e.g. INV-0291 or style ref"
              className="h-10 w-full rounded-lg border border-stone-300 px-3 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            />
          </div>
          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-sm font-semibold text-white hover:bg-violet-800"
          >
            <Search className="size-4" />
            Search
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-10 items-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Clear
          </button>
        </div>

        {toast ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
          >
            {toast.message}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="size-8 animate-spin text-violet-600" />
            </div>
          ) : groups.length === 0 ? (
            <p className="py-16 text-center text-sm text-stone-500">No replenishment history found.</p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const key = groupKeyOf(group);
                const expanded = expandedGroups.has(key);
                const exportItems = groupToExportItems(group);
                const hasConfirmed = group.items.some((i) => isConfirmedStatus(i.status));
                const hasFactory = group.items.some((i) => isFactoryStatus(i.status));
                const isStyleUpload = group.type === "style_upload";
                const headerLabel = isStyleUpload ? group.styleUploadRef : group.invoiceNo;
                const groupRescanning = rescanningGroups.has(key);

                return (
                  <div key={key} className="overflow-hidden rounded-xl border border-stone-200 bg-[#FAFAF9]">
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-stone-50/80 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {expanded ? (
                          <ChevronDown className="size-4 shrink-0 text-stone-500" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 text-stone-500" />
                        )}
                        <span className="font-mono font-semibold text-[#1C1917]">{headerLabel}</span>
                        <span className="text-stone-400">·</span>
                        <span className="truncate text-sm text-stone-700">{group.partyName}</span>
                        <span className="text-stone-400">·</span>
                        <span className="text-sm text-stone-600">{formatAt(group.replenishedAt)}</span>
                        <span className="text-stone-400">·</span>
                        <span className="text-sm text-stone-600">{group.totalItems} items</span>
                        {isStyleUpload ? (
                          <span className={`${histBadgeWrap} bg-violet-100 text-violet-800`}>🏷 Style Upload</span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-6 sm:pl-0">
                        {group.confirmedCount > 0 ? (
                          <span className={`${histBadgeWrap} bg-[#DCFCE7] text-[#166634]`}>
                            ✅ {group.confirmedCount}
                          </span>
                        ) : null}
                        {group.factoryCount > 0 ? (
                          <span className={`${histBadgeWrap} bg-[#F1F5F9] text-[#475569]`}>
                            🏭 {group.factoryCount}
                          </span>
                        ) : null}
                        {group.pendingCount > 0 ? (
                          <span className={`${histBadgeWrap} bg-[#FEF3C7] text-[#92400E]`}>
                            ⏳ {group.pendingCount}
                          </span>
                        ) : null}
                        <span className={`${histBadgeWrap} bg-stone-100 text-stone-600`}>
                          💰 {group.soldCount} sold
                        </span>
                      </div>
                    </button>

                    <div className="flex flex-wrap gap-2 border-t border-stone-200 px-4 py-2">
                      {showRescan && group.rescanableCount > 0 ? (
                        <button
                          type="button"
                          disabled={groupRescanning || rescanningAll}
                          onClick={() => void handleRescanGroup(group)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-2.5 text-xs font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50"
                        >
                          {groupRescanning ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <RefreshCw className="size-3.5" aria-hidden />
                          )}
                          Rescan Group
                        </button>
                      ) : null}

                      {isStyleUpload ? (
                        (showExportConfirmed && hasConfirmed) || (showExportFactoryOrders && hasFactory) ? (
                          <ExportDropdown
                            label="Export ▼"
                            onPdf={() => {
                              if (hasConfirmed) {
                                exportConfirmedReplenishmentPdf(
                                  toConfirmedExportRows(exportItems),
                                  group.partyName,
                                );
                              } else {
                                exportFactoryOrdersPdf(toFactoryExportRows(exportItems), group.partyName);
                              }
                            }}
                            onExcel={() => {
                              if (hasConfirmed) {
                                void exportConfirmedReplenishmentExcel(
                                  toConfirmedExportRows(exportItems),
                                  group.partyName,
                                );
                              } else {
                                void exportFactoryOrdersExcel(toFactoryExportRows(exportItems), group.partyName);
                              }
                            }}
                          />
                        ) : null
                      ) : (
                        <Fragment>
                          {showExportConfirmed && hasConfirmed ? (
                            <ExportDropdown
                              label="Export Confirmed ▼"
                              onPdf={() =>
                                exportConfirmedReplenishmentPdf(
                                  toConfirmedExportRows(exportItems),
                                  group.partyName,
                                )
                              }
                              onExcel={() =>
                                void exportConfirmedReplenishmentExcel(
                                  toConfirmedExportRows(exportItems),
                                  group.partyName,
                                )
                              }
                            />
                          ) : null}
                          {showExportFactoryOrders && hasFactory ? (
                            <ExportDropdown
                              label="Export Factory Orders ▼"
                              onPdf={() =>
                                exportFactoryOrdersPdf(toFactoryExportRows(exportItems), group.partyName)
                              }
                              onExcel={() =>
                                void exportFactoryOrdersExcel(toFactoryExportRows(exportItems), group.partyName)
                              }
                            />
                          ) : null}
                        </Fragment>
                      )}
                    </div>

                    {expanded ? (
                      <div className="overflow-x-auto border-t border-stone-200 bg-white">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="bg-stone-50/80">
                              <th className={thHist}>StyleNo</th>
                              <th className={thHist}>MetalType</th>
                              <th className={thHist}>Status</th>
                              <th className={thHist}>StockNo</th>
                              {showRescan ? <th className={thHist}>Rescan</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item) => {
                              const badge = historyStatusBadge(item.status);
                              const isSold = item.status.toLowerCase() === "sold";
                              const itemRescanning = rescanningItems.has(item.itemId);
                              const highlighted = highlightedItems.has(item.itemId);
                              return (
                                <tr
                                  key={item.itemId}
                                  className={`hover:bg-stone-50/50 ${highlighted ? "bg-yellow-100 transition-colors duration-300" : ""}`}
                                >
                                  <td className={`${tdHist} font-mono font-medium`}>{item.styleNo}</td>
                                  <td className={tdHist}>{item.metalType ?? "—"}</td>
                                  <td className={tdHist}>
                                    <span
                                      className={`${histBadgeWrap} ${badge.className} ${isSold ? "opacity-80" : ""}`}
                                    >
                                      {badge.label}
                                    </span>
                                  </td>
                                  <td className={`${tdHist} font-mono text-stone-600`}>
                                    {item.stockNo && item.stockNo !== "—" ? item.stockNo : "—"}
                                  </td>
                                  {showRescan ? (
                                    <td className={tdHist}>
                                      {item.canRescan ? (
                                        <button
                                          type="button"
                                          disabled={itemRescanning || groupRescanning || rescanningAll}
                                          onClick={() => void handleRescanItem(item.itemId)}
                                          className="inline-flex size-8 items-center justify-center rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                                          aria-label="Rescan item"
                                        >
                                          <RefreshCw
                                            className={`size-4 ${itemRescanning ? "animate-spin" : ""}`}
                                          />
                                        </button>
                                      ) : (
                                        <span className="text-stone-400">—</span>
                                      )}
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3 text-sm text-stone-600">
            <span>
              {rangeStart}–{rangeEnd} of {total} groups
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
