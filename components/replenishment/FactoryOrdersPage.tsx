"use client";

import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  alertSuccess,
  btnGhost,
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
  pillFilter as pillFilterClass,
  thBase,
  thBtn,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

type ClientOption = { ClientID: string; PartyName: string };

type FactoryOrderItem = {
  itemId: string;
  invoiceNo: string;
  partyName: string;
  styleNo: string;
  productDescription: string | null;
  metalType: string | null;
  metalPurity: string | null;
  stoneShape: string | null;
  productType: string | null;
  quantity: number;
  status: string;
  daysWaiting: number;
  factoryOrderPlacedAt: string | null;
  factoryOrderPlacedByName: string | null;
};

type PillFilter = "all" | "pending" | "ordered";

type SortKey =
  | "invoiceNo"
  | "partyName"
  | "styleNo"
  | "productDescription"
  | "metalType"
  | "metalPurity"
  | "quantity"
  | "daysWaiting"
  | "status";

const PAGE_SIZE = 25;

function daysWaitingClass(days: number): string {
  if (days > 7) return "font-semibold text-red-600";
  if (days >= 3) return "font-semibold text-amber-600";
  return "text-muted-foreground";
}

function factoryStatusBadge(status: string): { label: string; className: string } {
  if (status === "factory_order_placed") {
    return { label: "Ordered", className: "bg-blue-100 text-blue-800" };
  }
  return { label: "Pending", className: "bg-amber-100 text-amber-900" };
}

function formatPlacedAt(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export function FactoryOrdersPage() {
  const [items, setItems] = useState<FactoryOrderItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [pillFilter, setPillFilter] = useState<PillFilter>("all");
  const [pendingCount, setPendingCount] = useState(0);
  const [orderedCount, setOrderedCount] = useState(0);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState(false);
  const [clientId, setClientId] = useState("");
  const [styleNo, setStyleNo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [applied, setApplied] = useState({ clientId: "", styleNo: "", status: "" });

  const [sortKey, setSortKey] = useState<SortKey>("daysWaiting");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [expandItemId, setExpandItemId] = useState<string | null>(null);
  const [orderNotes, setOrderNotes] = useState("");
  const [markLoading, setMarkLoading] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/clients?limit=500", { credentials: "include" });
        const data = (await res.json()) as { clients?: ClientOption[] };
        if (!res.ok) {
          setClientsUnavailable(true);
          return;
        }
        setClients(data.clients ?? []);
      } catch {
        setClientsUnavailable(true);
      }
    })();
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const [pendingRes, orderedRes] = await Promise.all([
        fetch("/api/replenishment/factory-orders?status=factory_order&limit=1&page=1", {
          credentials: "include",
        }),
        fetch("/api/replenishment/factory-orders?status=factory_order_placed&limit=1&page=1", {
          credentials: "include",
        }),
      ]);
      if (pendingRes.ok) {
        const d = (await pendingRes.json()) as { total?: number };
        setPendingCount(d.total ?? 0);
      }
      if (orderedRes.ok) {
        const d = (await orderedRes.json()) as { total?: number };
        setOrderedCount(d.total ?? 0);
      }
    } catch {
      /* counts optional */
    }
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      let status = applied.status;
      if (pillFilter === "pending") status = "factory_order";
      else if (pillFilter === "ordered") status = "factory_order_placed";
      if (status) params.set("status", status);
      if (applied.clientId) params.set("clientId", applied.clientId);
      if (applied.styleNo) params.set("styleNo", applied.styleNo);

      const res = await fetch(`/api/replenishment/factory-orders?${params}`, { credentials: "include" });
      const data = (await res.json()) as {
        total?: number;
        items?: FactoryOrderItem[];
        message?: string;
      };

      if (!res.ok) {
        setError(data.message ?? "Failed to load factory orders.");
        setItems([]);
        setTotal(0);
        return;
      }

      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Network error.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, applied, pillFilter]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const sortedItems = useMemo(() => {
    const rows = [...items];
    rows.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "invoiceNo":
          cmp = a.invoiceNo.localeCompare(b.invoiceNo);
          break;
        case "partyName":
          cmp = a.partyName.localeCompare(b.partyName);
          break;
        case "styleNo":
          cmp = a.styleNo.localeCompare(b.styleNo);
          break;
        case "productDescription":
          cmp = (a.productDescription ?? "").localeCompare(b.productDescription ?? "");
          break;
        case "metalType":
          cmp = (a.metalType ?? "").localeCompare(b.metalType ?? "");
          break;
        case "metalPurity":
          cmp = (a.metalPurity ?? "").localeCompare(b.metalPurity ?? "");
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "daysWaiting":
          cmp = a.daysWaiting - b.daysWaiting;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [items, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "daysWaiting" || key === "quantity" ? "desc" : "asc");
    }
  }

  function applyFilters() {
    setApplied({ clientId, styleNo, status: statusFilter });
    setPage(1);
    setExpandItemId(null);
  }

  function clearFilters() {
    setClientId("");
    setStyleNo("");
    setStatusFilter("");
    setApplied({ clientId: "", styleNo: "", status: "" });
    setPage(1);
    setExpandItemId(null);
  }

  async function confirmMarkOrdered(item: FactoryOrderItem) {
    setMarkLoading(true);
    try {
      const res = await fetch("/api/replenishment/factory-orders/mark-ordered", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          itemId: item.itemId,
          notes: orderNotes.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) {
        setToast({ type: "error", message: data.message ?? "Could not mark as ordered." });
        return;
      }
      setToast({ type: "success", message: `${item.invoiceNo} marked as ordered.` });
      setExpandItemId(null);
      setOrderNotes("");
      await Promise.all([fetchItems(), fetchCounts()]);
    } catch {
      setToast({ type: "error", message: "Network error." });
    } finally {
      setMarkLoading(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      {toast ? (
        <div
          className={cn(
            "shrink-0 rounded-xl border px-4 py-2 text-sm font-medium",
            toast.type === "success" ? alertSuccess : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {toast.message}
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pillFilterClass(pillFilter === "pending")}
            onClick={() => {
              setPillFilter("pending");
              setPage(1);
              setExpandItemId(null);
            }}
          >
            <span className="text-amber-500" aria-hidden>
              ●
            </span>
            {pendingCount} Pending
          </button>
          <button
            type="button"
            className={pillFilterClass(pillFilter === "ordered")}
            onClick={() => {
              setPillFilter("ordered");
              setPage(1);
              setExpandItemId(null);
            }}
          >
            <span className="text-blue-600" aria-hidden>
              ●
            </span>
            {orderedCount} Ordered
          </button>
          <button
            type="button"
            className={pillFilterClass(pillFilter === "all")}
            onClick={() => {
              setPillFilter("all");
              setPage(1);
              setExpandItemId(null);
            }}
          >
            Total {pendingCount + orderedCount}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void Promise.all([fetchItems(), fetchCounts()])}
          className={btnGhost}
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-border px-4 py-3">
          <label className="min-w-[10rem] flex-1">
            <span className={fieldLabel}>Client Name</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={clientsUnavailable}
              className={fieldInput}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.ClientID} value={c.ClientID}>
                  {c.PartyName}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[8rem] flex-1">
            <span className={fieldLabel}>StyleNo</span>
            <input
              type="text"
              value={styleNo}
              onChange={(e) => setStyleNo(e.target.value)}
              placeholder="Filter by style…"
              className={fieldInput}
            />
          </label>
          <label className="min-w-[8rem]">
            <span className={fieldLabel}>Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={pillFilter !== "all"}
              className={fieldInput}
            >
              <option value="">All statuses</option>
              <option value="factory_order">Pending</option>
              <option value="factory_order_placed">Ordered</option>
            </select>
          </label>
          <button type="button" onClick={applyFilters} className={btnPrimary}>
            <Search className="size-4" aria-hidden />
            Search
          </button>
          {(applied.clientId || applied.styleNo || applied.status) && (
            <button type="button" onClick={clearFilters} className={btnSecondary}>
              <X className="size-4" aria-hidden />
              Clear
            </button>
          )}
        </div>

        {error ? (
          <div className="px-4 py-8 text-center text-sm text-red-700">{error}</div>
        ) : loading && items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading factory orders…
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("invoiceNo")} className={thBtn}>
                      InvoiceNo{sortKey === "invoiceNo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("partyName")} className={thBtn}>
                      Client{sortKey === "partyName" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("styleNo")} className={thBtn}>
                      StyleNo{sortKey === "styleNo" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("productDescription")} className={thBtn}>
                      Description{sortKey === "productDescription" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("metalType")} className={thBtn}>
                      Metal{sortKey === "metalType" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("metalPurity")} className={thBtn}>
                      MetalPurity{sortKey === "metalPurity" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={cn(thBase, "text-right")}>
                    <button type="button" onClick={() => toggleSort("quantity")} className={thBtn}>
                      Qty{sortKey === "quantity" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("daysWaiting")} className={thBtn}>
                      Days Waiting{sortKey === "daysWaiting" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("status")} className={thBtn}>
                      Status{sortKey === "status" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-12 text-center text-muted-foreground">
                      No factory orders match your filters.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((row) => {
                    const badge = factoryStatusBadge(row.status);
                    const isOrdered = row.status === "factory_order_placed";
                    const isExpanded = expandItemId === row.itemId;

                    return (
                      <Fragment key={row.itemId}>
                        <tr
                          className={cn(
                            "border-b border-border/60 transition-colors",
                            isOrdered ? "bg-secondary/30 opacity-60" : "hover:bg-secondary/40",
                          )}
                        >
                          <td className="px-3 py-2.5 font-mono text-[13px] text-foreground">{row.invoiceNo}</td>
                          <td className="px-3 py-2.5 text-foreground">{row.partyName}</td>
                          <td className="px-3 py-2.5 font-mono text-[13px] text-foreground">{row.styleNo}</td>
                          <td className="max-w-[200px] truncate px-3 py-2.5 text-muted-foreground">
                            {row.productDescription ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.metalType ?? "—"}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{row.metalPurity ?? "—"}</td>
                          <td className="px-3 py-2.5 text-right font-medium text-foreground">{row.quantity}</td>
                          <td className={cn("px-3 py-2.5", daysWaitingClass(row.daysWaiting))}>
                            {row.daysWaiting}d
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={cn(
                                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {isOrdered ? (
                              <span className="text-xs text-muted-foreground">
                                Ordered by {row.factoryOrderPlacedByName ?? "—"}
                                {row.factoryOrderPlacedAt ? ` · ${formatPlacedAt(row.factoryOrderPlacedAt)}` : ""}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandItemId(isExpanded ? null : row.itemId);
                                  setOrderNotes("");
                                }}
                                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                              >
                                Mark as Ordered
                              </button>
                            )}
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b border-border/60 bg-secondary/30">
                            <td colSpan={10} className="px-4 py-4">
                              <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-4 shadow-card">
                                <p className="text-sm font-semibold text-foreground">
                                  Mark {row.invoiceNo} as ordered from factory?
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">This cannot be undone.</p>
                                <label className="mt-3 block">
                                  <span className={fieldLabel}>Notes (optional)</span>
                                  <input
                                    type="text"
                                    value={orderNotes}
                                    onChange={(e) => setOrderNotes(e.target.value)}
                                    className={fieldInput}
                                    placeholder="Factory reference or notes…"
                                  />
                                </label>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    disabled={markLoading}
                                    onClick={() => void confirmMarkOrdered(row)}
                                    className={btnPrimary}
                                  >
                                    {markLoading ? "Saving…" : "Confirm Order Placed"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={markLoading}
                                    onClick={() => {
                                      setExpandItemId(null);
                                      setOrderNotes("");
                                    }}
                                    className={btnSecondary}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} items
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={btnGhost}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className={btnGhost}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
