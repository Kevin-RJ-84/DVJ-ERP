"use client";

import { useEffect, useMemo, useState } from "react";

type ClientRow = {
  ClientID: string;
  PartyCode: string | null;
  PartyName: string;
  CloseToExpiryDays: number;
  IsStockPullAllowed: boolean;
  CreatedAt: string;
  OverallRank: number | null;
  OverallScore: string | null;
};

type SortField =
  | "OverallRank"
  | "PartyName"
  | "PartyCode"
  | "OverallScore"
  | "CloseToExpiryDays"
  | "IsStockPullAllowed";
type SortDir = "asc" | "desc";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function formatScore(value: string | null | undefined): string {
  if (!value) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function SortArrow({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) {
    return <span className="ml-0.5 text-[10px] text-muted-foreground/50">⇅</span>;
  }
  return <span className="ml-0.5 text-[10px] text-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>;
}

type ClientManagementProps = {
  initialClients: ClientRow[];
};

export function ClientManagement({ initialClients }: ClientManagementProps) {
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("OverallRank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);
  const [jumpDraft, setJumpDraft] = useState("1");

  function onSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(0);
  }

  const visibleClients = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? clients.filter((c) => c.PartyName.toLowerCase().includes(term))
      : clients;

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "OverallRank": {
          const ar = a.OverallRank ?? Infinity;
          const br = b.OverallRank ?? Infinity;
          cmp = ar - br;
          break;
        }
        case "PartyName":
          cmp = a.PartyName.localeCompare(b.PartyName);
          break;
        case "PartyCode":
          cmp = (a.PartyCode ?? "").localeCompare(b.PartyCode ?? "");
          break;
        case "OverallScore": {
          const as = Number(a.OverallScore ?? 0);
          const bs = Number(b.OverallScore ?? 0);
          cmp = as - bs;
          break;
        }
        case "CloseToExpiryDays":
          cmp = a.CloseToExpiryDays - b.CloseToExpiryDays;
          break;
        case "IsStockPullAllowed":
          cmp = (a.IsStockPullAllowed ? 1 : 0) - (b.IsStockPullAllowed ? 1 : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [clients, search, sortField, sortDir]);

  const totalPages = useMemo(() => {
    if (visibleClients.length === 0) return 1;
    return Math.max(1, Math.ceil(visibleClients.length / pageSize));
  }, [visibleClients.length, pageSize]);

  const safePage = Math.min(page, totalPages - 1);
  const pageClients = visibleClients.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const startRow = visibleClients.length === 0 ? 0 : safePage * pageSize + 1;
  const endRow = Math.min((safePage + 1) * pageSize, visibleClients.length);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    setJumpDraft(String(safePage + 1));
  }, [safePage]);

  function applyJump() {
    const n = parseInt(jumpDraft.trim(), 10);
    if (!Number.isFinite(n)) return;
    const target = Math.min(Math.max(1, n), totalPages);
    setPage(target - 1);
  }

  async function refreshClients() {
    setError(null);
    try {
      const response = await fetch("/api/clients");
      const result = (await response.json()) as {
        message?: string;
        clients?: ClientRow[];
      };
      if (!response.ok) {
        setError(result.message ?? "Unable to refresh clients.");
        return;
      }
      setClients(result.clients ?? []);
      setPage(0);
    } catch {
      setError("Unexpected network error while fetching clients.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function updateClient(client: ClientRow, updates: Partial<ClientRow>) {
    setError(null);
    setNotice(null);
    setPendingIds((prev) => new Set(prev).add(client.ClientID));

    const nextClient: ClientRow = { ...client, ...updates };
    setClients((prev) =>
      prev.map((item) => (item.ClientID === client.ClientID ? nextClient : item)),
    );

    try {
      const response = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.ClientID,
          closeToExpiryDays: nextClient.CloseToExpiryDays,
          isStockPullAllowed: nextClient.IsStockPullAllowed,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        client?: ClientRow;
      };

      if (!response.ok) {
        setError(result.message ?? "Failed to update client.");
        setClients((prev) =>
          prev.map((item) => (item.ClientID === client.ClientID ? client : item)),
        );
        return;
      }

      if (result.client) {
        setClients((prev) =>
          prev.map((item) =>
            item.ClientID === result.client?.ClientID ? result.client : item,
          ),
        );
      }
      setNotice(result.message ?? "Client saved.");
    } catch {
      setError("Unexpected network error while updating client.");
      setClients((prev) =>
        prev.map((item) => (item.ClientID === client.ClientID ? client : item)),
      );
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(client.ClientID);
        return next;
      });
    }
  }

  const thBase =
    "sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-2.5 text-left backdrop-blur-sm";
  const thBtn =
    "flex cursor-pointer select-none items-center gap-0.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase transition-colors hover:text-foreground";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      <p className="shrink-0 text-sm text-muted-foreground">Search and edit party defaults inline.</p>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Search by client name..."
          className="h-11 min-w-[240px] flex-1 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-foreground/30 focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={refreshClients}
          disabled={isRefreshing}
          className="h-11 shrink-0 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">{notice}</p>
      ) : null}

      <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("OverallRank")}>
                    Rank
                    <SortArrow field="OverallRank" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("PartyName")}>
                    Client Name
                    <SortArrow field="PartyName" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("PartyCode")}>
                    Party Code
                    <SortArrow field="PartyCode" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("OverallScore")}>
                    Total Sale Amount
                    <SortArrow field="OverallScore" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("CloseToExpiryDays")}>
                    Expiry Days
                    <SortArrow field="CloseToExpiryDays" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
                <th className={thBase}>
                  <button type="button" className={thBtn} onClick={() => onSort("IsStockPullAllowed")}>
                    Stock Pull
                    <SortArrow field="IsStockPullAllowed" sortField={sortField} sortDir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="bg-card">
              {pageClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No clients found.
                  </td>
                </tr>
              ) : (
                pageClients.map((client) => {
                  const isPending = pendingIds.has(client.ClientID);
                  return (
                    <tr key={client.ClientID} className="transition-colors hover:bg-secondary/60">
                      <td className="border-b border-border px-3 py-2.5">
                        {client.OverallRank != null ? (
                          <span className="inline-flex items-center justify-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
                            #{client.OverallRank}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 font-medium text-foreground">
                        {client.PartyName}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 text-muted-foreground">
                        {client.PartyCode ?? "—"}
                      </td>
                      <td className="border-b border-border px-3 py-2.5 tabular-nums text-foreground">
                        {client.OverallScore != null ? formatScore(client.OverallScore) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="border-b border-border px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={client.CloseToExpiryDays}
                          onChange={(event) =>
                            setClients((prev) =>
                              prev.map((item) =>
                                item.ClientID === client.ClientID
                                  ? { ...item, CloseToExpiryDays: Number(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          onBlur={(event) =>
                            updateClient(client, { CloseToExpiryDays: Number(event.target.value) })
                          }
                          disabled={isPending}
                          className="h-9 w-24 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                      <td className="border-b border-border px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateClient(client, { IsStockPullAllowed: !client.IsStockPullAllowed })
                          }
                          disabled={isPending}
                          className={`h-9 cursor-pointer rounded-lg border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 ${
                            client.IsStockPullAllowed
                              ? "border-emerald-200/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/90 focus-visible:ring-emerald-400/50"
                              : "border-border bg-secondary text-foreground hover:bg-secondary focus-visible:ring-ring/20"
                          }`}
                        >
                          {client.IsStockPullAllowed ? "Yes" : "No"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-border bg-secondary/90 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {visibleClients.length === 0
              ? "No clients"
              : `Showing ${startRow}–${endRow} of ${visibleClients.length} client${visibleClients.length === 1 ? "" : "s"}`}
          </p>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap font-medium">Page size</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(0);
                }}
                className="h-8 cursor-pointer rounded-lg border border-border bg-card px-2 text-xs font-medium text-foreground outline-none focus:ring-2 focus:ring-ring/20/50"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">Jump to</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={jumpDraft}
                onChange={(e) => setJumpDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyJump();
                }}
                className="h-8 w-14 rounded-lg border border-border bg-card px-1.5 text-center text-xs tabular-nums text-foreground outline-none focus:ring-2 focus:ring-ring/20/50"
                aria-label="Jump to page number"
              />
              <span className="text-xs text-muted-foreground">/ {totalPages}</span>
              <button
                type="button"
                onClick={applyJump}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              >
                Go
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="min-w-[72px] text-center text-xs text-muted-foreground">
                Page {safePage + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
