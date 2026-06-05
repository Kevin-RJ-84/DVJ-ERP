"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Loader2, RotateCcw } from "lucide-react";
import { exportReplenishmentHistoryExcel } from "@/lib/replenishment-history-export";

type HistoryItem = {
  ReplenishmentID: string;
  InvoiceNo: string;
  GroupField: string;
  GroupValue: string;
  StockNo: string;
  Type: string;
  ReplenishedBy: string;
  ReplenishedAt: string;
  IsUndone: boolean;
  UndoneBy: string | null;
  UndoneAt: string | null;
  canUndo: boolean;
};

type ReplenisherOption = { userId: string; label: string };

type ClientOption = { ClientID: string; PartyName: string };

const HISTORY_PAGE_SIZES = [25, 50, 100] as const;

export function ReplenishmentHistoryPage({ canUndo }: { canUndo: boolean }) {
  const [clientId, setClientId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [replenishedBy, setReplenishedBy] = useState("");
  const [groupValue, setGroupValue] = useState("");

  const [applied, setApplied] = useState({
    clientId: "",
    fromDate: "",
    toDate: "",
    replenishedBy: "",
    groupValue: "",
  });

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState(false);

  const [replenishers, setReplenishers] = useState<ReplenisherOption[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients?limit=500", { credentials: "include" });
      const data = (await res.json()) as { clients?: ClientOption[]; message?: string };
      if (!res.ok) {
        setClientsUnavailable(true);
        return;
      }
      setClients(data.clients ?? []);
    } catch {
      setClientsUnavailable(true);
    }
  }, []);

  const loadReplenishers = useCallback(async () => {
    try {
      const res = await fetch("/api/replenishment/history/replenishers", { credentials: "include" });
      const data = (await res.json()) as { users?: ReplenisherOption[] };
      if (res.ok) {
        setReplenishers(data.users ?? []);
      }
    } catch {
      /* filter optional */
    }
  }, []);

  useEffect(() => {
    loadClients();
    loadReplenishers();
  }, [loadClients, loadReplenishers]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(pageSize));
      if (applied.clientId) params.set("clientId", applied.clientId);
      if (applied.fromDate) params.set("fromDate", applied.fromDate);
      if (applied.toDate) params.set("toDate", applied.toDate);
      if (applied.replenishedBy) params.set("replenishedBy", applied.replenishedBy);
      if (applied.groupValue) params.set("groupValue", applied.groupValue);

      const res = await fetch(`/api/replenishment/history?${params}`, { credentials: "include" });
      const data = (await res.json()) as {
        total?: number;
        items?: HistoryItem[];
        message?: string;
        error?: string;
        required?: string;
      };

      if (!res.ok) {
        throw new Error(
          data.message ?? (res.status === 403 ? "You do not have access to replenishment history." : "Failed to load history."),
        );
      }

      setTotal(data.total ?? 0);
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load history.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, applied]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  function applyFilters() {
    setApplied({
      clientId,
      fromDate,
      toDate,
      replenishedBy,
      groupValue: groupValue.trim(),
    });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const thHist =
    "sticky top-0 z-10 border-b border-stone-300 bg-white/95 px-3 py-3 text-left text-[12px] font-medium leading-snug text-[#78716C] tracking-[0.04em] shadow-[0_1px_0_rgba(0,0,0,0.06)] backdrop-blur-sm";
  const tdHist = "border-b border-stone-200 px-3 py-3 align-top text-sm text-stone-800";

  async function confirmUndo() {
    if (!confirmUndoId) return;
    setUndoLoading(true);
    try {
      const res = await fetch("/api/replenishment/undo", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replenishmentIds: [confirmUndoId] }),
      });
      const data = (await res.json()) as { message?: string; success?: boolean };
      if (!res.ok) {
        throw new Error(data.message ?? "Undo failed.");
      }
      setToast({ type: "success", message: "Replenishment undone." });
      setConfirmUndoId(null);
      await fetchHistory();
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Undo failed." });
    } finally {
      setUndoLoading(false);
    }
  }

  function formatAt(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  async function exportHistoryExcel() {
    setExportExcelLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("exportAll", "1");
      params.set("limit", "20000");
      if (applied.clientId) params.set("clientId", applied.clientId);
      if (applied.fromDate) params.set("fromDate", applied.fromDate);
      if (applied.toDate) params.set("toDate", applied.toDate);
      if (applied.replenishedBy) params.set("replenishedBy", applied.replenishedBy);
      if (applied.groupValue) params.set("groupValue", applied.groupValue);

      const res = await fetch(`/api/replenishment/history?${params}`, { credentials: "include" });
      const data = (await res.json()) as {
        total?: number;
        items?: HistoryItem[];
        message?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.message ?? (res.status === 403 ? "You do not have access to replenishment history." : "Export failed."),
        );
      }
      const exported = data.items ?? [];
      const totalMatching = data.total ?? 0;
      if (exported.length === 0) {
        setToast({ type: "error", message: "No rows to export." });
        return;
      }
      await exportReplenishmentHistoryExcel(
        exported.map((row) => ({
          invoiceNo: row.InvoiceNo,
          groupField: row.GroupField,
          groupValue: row.GroupValue,
          stockNo: row.StockNo,
          type: row.Type,
          replenishedBy: row.ReplenishedBy,
          replenishedAt: formatAt(row.ReplenishedAt),
          status: row.IsUndone ? "Undone" : "Active",
        })),
      );
      setToast({
        type: "success",
        message:
          totalMatching > exported.length
            ? `Exported ${exported.length.toLocaleString()} rows (${totalMatching.toLocaleString()} match; export is capped). Narrow filters if you need the rest.`
            : `Exported ${exported.length.toLocaleString()} row${exported.length === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Export failed." });
    } finally {
      setExportExcelLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full max-w-[1920px] flex-col gap-4">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Filters</p>
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-300 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          {!clientsUnavailable ? (
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium text-stone-700">
              Client name
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.ClientID} value={c.ClientID}>
                    {c.PartyName}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="max-w-md text-sm text-stone-600">
              Client filter unavailable (requires clients.view). Use other filters or ask an administrator.
            </p>
          )}

          <label className="flex min-w-[9rem] flex-col gap-1.5 text-sm font-medium text-stone-700">
            From date
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </label>

          <label className="flex min-w-[9rem] flex-col gap-1.5 text-sm font-medium text-stone-700">
            To date
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </label>

          <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-sm font-medium text-stone-700">
            Replenished by
            <select
              value={replenishedBy}
              onChange={(e) => setReplenishedBy(e.target.value)}
              className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            >
              <option value="">Anyone</option>
              {replenishers.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-[10rem] flex-1 flex-col gap-1.5 text-sm font-medium text-stone-700">
            Group value
            <input
              type="search"
              value={groupValue}
              onChange={(e) => setGroupValue(e.target.value)}
              placeholder="Search group value…"
              className="h-10 rounded-xl border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-200"
            />
          </label>

          <button
            type="button"
            onClick={applyFilters}
            className="mt-auto h-10 shrink-0 rounded-xl bg-violet-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-800"
          >
            Apply filters
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      {toast ? (
        <div
          className={[
            "inline-flex rounded-xl border px-4 py-2 text-sm font-medium",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Results</p>
          <button
            type="button"
            onClick={() => void exportHistoryExcel()}
            disabled={loading || exportExcelLoading || total === 0}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {exportExcelLoading ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
            )}
            Export Excel
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={`${thHist} whitespace-nowrap`}>Invoice no.</th>
                  <th className={thHist}>Group field</th>
                  <th className={thHist}>Group value</th>
                  <th className={`${thHist} whitespace-nowrap`}>Stock no.</th>
                  <th className={thHist}>Type</th>
                  <th className={thHist}>Replenished by</th>
                  <th className={`${thHist} whitespace-nowrap`}>Replenished at</th>
                  <th className={thHist}>Status</th>
                  <th className={`${thHist} w-28`}>Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center text-sm text-stone-500">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-14 text-center text-sm text-stone-500">
                      No replenishment records match these filters.
                    </td>
                  </tr>
                ) : (
                  items.map((row) => (
                    <tr key={row.ReplenishmentID} className="transition-colors hover:bg-stone-50/80">
                      <td className={`${tdHist} font-mono text-xs`}>{row.InvoiceNo}</td>
                      <td className={tdHist}>{row.GroupField}</td>
                      <td className={tdHist}>{row.GroupValue}</td>
                      <td className={`${tdHist} font-mono text-xs`}>{row.StockNo}</td>
                      <td className={`${tdHist} capitalize`}>{row.Type}</td>
                      <td className={tdHist}>{row.ReplenishedBy}</td>
                      <td className={`${tdHist} text-stone-600`}>{formatAt(row.ReplenishedAt)}</td>
                      <td className={tdHist}>
                        {row.IsUndone ? (
                          <span className="text-rose-600 line-through decoration-rose-500/80">Undone</span>
                        ) : (
                          <span className="font-medium text-emerald-700">Active</span>
                        )}
                      </td>
                      <td className={tdHist}>
                        {canUndo && row.canUndo ? (
                          <button
                            type="button"
                            onClick={() => setConfirmUndoId(row.ReplenishmentID)}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                          >
                            <RotateCcw className="size-3.5" aria-hidden />
                            Undo
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {total > 0 ? (
            <div className="flex shrink-0 flex-col gap-3 border-t border-stone-300 bg-stone-50/90 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <p className="text-xs text-stone-600">
                {`Showing ${rangeStart}–${rangeEnd} of ${total} record${total === 1 ? "" : "s"} · Page ${page} of ${totalPages}`}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="flex items-center gap-1.5 text-xs text-stone-600">
                  <span className="whitespace-nowrap font-medium">Page size</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 cursor-pointer rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-800 outline-none focus:ring-2 focus:ring-violet-300/50"
                  >
                    {HISTORY_PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-8 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="min-w-[72px] text-center text-xs text-stone-600">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-8 rounded-lg border border-stone-300 bg-white px-3 text-xs font-medium text-stone-600 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {confirmUndoId ? (
        <button
          type="button"
          className="fixed inset-0 z-50 cursor-default overflow-hidden bg-stone-950/40 p-4 backdrop-blur-[1px]"
          aria-label="Close dialog"
          onClick={() => !undoLoading && setConfirmUndoId(null)}
        />
      ) : null}
      {confirmUndoId ? (
        <div className="pointer-events-none fixed inset-0 z-[51] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="undo-replenish-title"
            className="pointer-events-auto w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="undo-replenish-title" className="text-lg font-semibold text-stone-900">
              Undo replenishment?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              This marks the selected line as undone. You can confirm new picks afterward from replenishment search if needed.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={undoLoading}
                onClick={() => setConfirmUndoId(null)}
                className="h-10 cursor-pointer rounded-xl border border-stone-200/80 px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={undoLoading}
                onClick={confirmUndo}
                className="h-10 cursor-pointer rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
              >
                {undoLoading ? "Working…" : "Yes, undo"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
