"use client";

import { ExternalLink, Loader2, MessageCircle, RefreshCw, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  alertError,
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
import {
  PullbackContactLogModal,
  type PullbackContactLogEntry,
} from "./PullbackContactLogModal";

type ClientOption = { ClientID: string; PartyName: string };

type PendingPullbackItem = {
  itemId: string;
  invoiceNo: string;
  partyName: string;
  styleNo: string;
  status: string;
  pullbackCandidateCount: number;
  lastContactAt: string | null;
  lastContactResponse: string | null;
  replenishedAt: string;
  daysPending: number;
};

type PillFilter = "all" | "pullback_available" | "pb_in_progress";

type SortKey =
  | "invoiceNo"
  | "partyName"
  | "styleNo"
  | "status"
  | "pullbackCandidateCount"
  | "lastContactAt"
  | "daysPending";

const PAGE_SIZE = 25;

const PULLBACK_AVAILABLE_STATUSES = new Set(["pullback", "pullback_available"]);
const PB_IN_PROGRESS_STATUSES = new Set(["pb_in_progress", "pending_pullback"]);

function daysPendingClass(days: number): string {
  if (days > 7) return "font-semibold text-red-600";
  if (days >= 3) return "font-semibold text-amber-600";
  return "text-muted-foreground";
}

function pullbackStatusBadge(status: string): { label: string; className: string } {
  const s = status.toLowerCase();
  if (s === "pullback" || s === "pullback_available") {
    return { label: "Pullback Available", className: "bg-red-100 text-red-800" };
  }
  if (s === "pb_in_progress" || s === "pending_pullback") {
    return { label: s === "pb_in_progress" ? "PB In Progress" : "Pending Pullback", className: "bg-amber-100 text-amber-900" };
  }
  return { label: status, className: "bg-muted text-muted-foreground" };
}

function formatContactAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
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

export function PendingPullbacksPage() {
  const router = useRouter();

  const [items, setItems] = useState<PendingPullbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pillFilter, setPillFilter] = useState<PillFilter>("all");
  const [pullbackAvailableCount, setPullbackAvailableCount] = useState(0);
  const [pbInProgressCount, setPbInProgressCount] = useState(0);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsUnavailable, setClientsUnavailable] = useState(false);
  const [clientId, setClientId] = useState("");
  const [styleNo, setStyleNo] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [applied, setApplied] = useState({ clientId: "", styleNo: "", status: "" });

  const [sortKey, setSortKey] = useState<SortKey>("daysPending");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [contactModal, setContactModal] = useState<PendingPullbackItem | null>(null);
  const [contactLogs, setContactLogs] = useState<PullbackContactLogEntry[]>([]);
  const [contactDraft, setContactDraft] = useState({
    channel: "WhatsApp",
    response: "Accepted",
    notes: "",
    salesperson: "",
  });
  const [salespersonChoices, setSalespersonChoices] = useState<Array<{ userId: string; label: string }>>([]);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactSaveError, setContactSaveError] = useState<string | null>(null);

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
      const fetches = [
        fetch("/api/replenishment/pending-pullbacks?status=pullback&limit=1&page=1", {
          credentials: "include",
        }),
        fetch("/api/replenishment/pending-pullbacks?status=pullback_available&limit=1&page=1", {
          credentials: "include",
        }),
        fetch("/api/replenishment/pending-pullbacks?status=pb_in_progress&limit=1&page=1", {
          credentials: "include",
        }),
        fetch("/api/replenishment/pending-pullbacks?status=pending_pullback&limit=1&page=1", {
          credentials: "include",
        }),
      ];
      const [pullbackRes, availRes, inProgRes, pendingRes] = await Promise.all(fetches);
      let availTotal = 0;
      let progTotal = 0;
      if (pullbackRes.ok) {
        const d = (await pullbackRes.json()) as { total?: number };
        availTotal += d.total ?? 0;
      }
      if (availRes.ok) {
        const d = (await availRes.json()) as { total?: number };
        availTotal += d.total ?? 0;
      }
      if (inProgRes.ok) {
        const d = (await inProgRes.json()) as { total?: number };
        progTotal += d.total ?? 0;
      }
      if (pendingRes.ok) {
        const d = (await pendingRes.json()) as { total?: number };
        progTotal += d.total ?? 0;
      }
      setPullbackAvailableCount(availTotal);
      setPbInProgressCount(progTotal);
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
      if (pillFilter === "pullback_available" && !status) {
        /* API accepts one status; prefer pullback_available for pill filter */
        status = "pullback_available";
      } else if (pillFilter === "pb_in_progress" && !status) {
        status = "pb_in_progress";
      }
      if (status) params.set("status", status);
      if (applied.clientId) params.set("clientId", applied.clientId);
      if (applied.styleNo) params.set("styleNo", applied.styleNo);

      const res = await fetch(`/api/replenishment/pending-pullbacks?${params}`, {
        credentials: "include",
      });
      const data = (await res.json()) as {
        total?: number;
        items?: PendingPullbackItem[];
        message?: string;
      };

      if (!res.ok) {
        setError(data.message ?? "Failed to load pending pullbacks.");
        setItems([]);
        setTotal(0);
        return;
      }

      let rows = data.items ?? [];
      if (pillFilter === "pullback_available" && !applied.status) {
        rows = rows.filter((r) => PULLBACK_AVAILABLE_STATUSES.has(r.status));
      } else if (pillFilter === "pb_in_progress" && !applied.status) {
        rows = rows.filter((r) => PB_IN_PROGRESS_STATUSES.has(r.status));
      }

      setItems(rows);
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

  useEffect(() => {
    if (!contactModal) return;
    setContactDraft({
      channel: "WhatsApp",
      response: "Accepted",
      notes: "",
      salesperson: "",
    });
    setSalespersonChoices([]);

    const logs: PullbackContactLogEntry[] = [];
    if (contactModal.lastContactAt) {
      logs.push({
        localId: contactModal.itemId,
        channel: "—",
        response: contactModal.lastContactResponse ?? "—",
        notes: "",
        salesperson: "—",
        loggedAt: new Date(contactModal.lastContactAt),
      });
    }
    setContactLogs(logs);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/users", { credentials: "include" });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as {
          users: Array<{
            UserID: string;
            Username: string;
            FirstName: string;
            LastName: string;
            Email: string;
          }>;
        };
        const choices = (payload.users ?? []).map((u) => ({
          userId: u.UserID,
          label: `${u.FirstName} ${u.LastName}`.trim() || u.Username || u.Email,
        }));
        if (!cancelled) setSalespersonChoices(choices);
      } catch {
        /* optional */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contactModal]);

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
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "pullbackCandidateCount":
          cmp = a.pullbackCandidateCount - b.pullbackCandidateCount;
          break;
        case "lastContactAt": {
          const ta = a.lastContactAt ? new Date(a.lastContactAt).getTime() : 0;
          const tb = b.lastContactAt ? new Date(b.lastContactAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "daysPending":
          cmp = a.daysPending - b.daysPending;
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
      setSortDir(key === "daysPending" || key === "pullbackCandidateCount" ? "desc" : "asc");
    }
  }

  function applyFilters() {
    setApplied({ clientId, styleNo, status: statusFilter });
    setPage(1);
  }

  function clearFilters() {
    setClientId("");
    setStyleNo("");
    setStatusFilter("");
    setApplied({ clientId: "", styleNo: "", status: "" });
    setPage(1);
  }

  function openInReplenishment(invoiceNo: string, itemId?: string) {
    const params = new URLSearchParams({ invoiceNo });
    if (itemId) params.set("pullbackItemId", itemId);
    router.push(`/replenishment/client?${params.toString()}`);
  }

  async function saveContactLog() {
    if (!contactModal || contactSaving) return;
    const sp = contactDraft.salesperson.trim();
    if (!sp) return;

    setContactSaving(true);
    setContactSaveError(null);
    try {
      const res = await fetch("/api/replenishment/pullback-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          itemId: contactModal.itemId,
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

      const loggedAt = new Date();
      const entry: PullbackContactLogEntry = {
        localId: crypto.randomUUID(),
        channel: contactDraft.channel,
        response: contactDraft.response,
        notes: contactDraft.notes.trim(),
        salesperson: sp,
        loggedAt,
      };
      setContactLogs((prev) => [...prev, entry]);
      setItems((prev) =>
        prev.map((row) =>
          row.itemId === contactModal.itemId
            ? {
                ...row,
                lastContactAt: loggedAt.toISOString(),
                lastContactResponse: contactDraft.response,
                status: payload.updatedStatus ?? row.status,
              }
            : row,
        ),
      );
      setContactDraft({
        channel: "WhatsApp",
        response: "Accepted",
        notes: "",
        salesperson: "",
      });
      void fetchCounts();
    } catch {
      setContactSaveError("Network error. Please try again.");
    } finally {
      setContactSaving(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pillFilterClass(pillFilter === "pullback_available")}
            onClick={() => {
              setPillFilter("pullback_available");
              setPage(1);
            }}
          >
            <span className="text-red-600" aria-hidden>
              ●
            </span>
            {pullbackAvailableCount} Pullback Available
          </button>
          <button
            type="button"
            className={pillFilterClass(pillFilter === "pb_in_progress")}
            onClick={() => {
              setPillFilter("pb_in_progress");
              setPage(1);
            }}
          >
            <span className="text-amber-500" aria-hidden>
              ●
            </span>
            {pbInProgressCount} PB In Progress
          </button>
          <button
            type="button"
            className={pillFilterClass(pillFilter === "all")}
            onClick={() => {
              setPillFilter("all");
              setPage(1);
            }}
          >
            Total {pullbackAvailableCount + pbInProgressCount}
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
              <option value="pullback">Pullback</option>
              <option value="pullback_available">Pullback Available</option>
              <option value="pb_in_progress">PB In Progress</option>
              <option value="pending_pullback">Pending Pullback</option>
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
            Loading pending pullbacks…
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-left text-sm">
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
                    <button type="button" onClick={() => toggleSort("status")} className={thBtn}>
                      Status{sortKey === "status" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={cn(thBase, "text-right")}>
                    <button type="button" onClick={() => toggleSort("pullbackCandidateCount")} className={thBtn}>
                      Candidates{sortKey === "pullbackCandidateCount" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("lastContactAt")} className={thBtn}>
                      Last Contact{sortKey === "lastContactAt" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>
                    <button type="button" onClick={() => toggleSort("daysPending")} className={thBtn}>
                      Days Pending{sortKey === "daysPending" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th className={thBase}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground">
                      No pending pullbacks match your filters.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((row) => {
                    const badge = pullbackStatusBadge(row.status);
                    return (
                      <tr key={row.itemId} className="border-b border-border/60 transition-colors hover:bg-secondary/40">
                        <td className="px-3 py-2.5 font-mono text-[13px] text-foreground">{row.invoiceNo}</td>
                        <td className="px-3 py-2.5 text-foreground">{row.partyName}</td>
                        <td className="px-3 py-2.5 font-mono text-[13px] text-foreground">{row.styleNo}</td>
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
                        <td className="px-3 py-2.5 text-right font-medium text-foreground">
                          {row.pullbackCandidateCount}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {formatContactAt(row.lastContactAt)}
                          {row.lastContactResponse ? (
                            <span className="ml-1 text-xs text-muted-foreground/80">({row.lastContactResponse})</span>
                          ) : null}
                        </td>
                        <td className={cn("px-3 py-2.5", daysPendingClass(row.daysPending))}>
                          {row.daysPending}d
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => openInReplenishment(row.invoiceNo, row.itemId)}
                              className={cn(btnGhost, "h-8 px-2.5 text-xs")}
                            >
                              <ExternalLink className="size-3" aria-hidden />
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => setContactModal(row)}
                              className={cn(btnSecondary, "h-8 px-2.5 text-xs")}
                            >
                              <MessageCircle className="size-3" aria-hidden />
                              Log Contact
                            </button>
                          </div>
                        </td>
                      </tr>
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

      {contactModal ? (
        <>
          {contactSaveError ? (
            <p className={cn(alertError, "fixed bottom-4 left-1/2 z-[210] max-w-md -translate-x-1/2 shadow-pop")}>
              {contactSaveError}
            </p>
          ) : null}
          <PullbackContactLogModal
            key={contactModal.itemId}
            clientName={contactModal.partyName}
            stockNo={contactModal.styleNo}
            defaultExpanded
            logs={contactLogs}
            contactDraft={contactDraft}
            setContactDraft={setContactDraft}
            salespersonChoices={salespersonChoices}
            onClose={() => {
              setContactModal(null);
              setContactSaveError(null);
            }}
            onSave={() => void saveContactLog()}
          />
        </>
      ) : null}
    </section>
  );
}
