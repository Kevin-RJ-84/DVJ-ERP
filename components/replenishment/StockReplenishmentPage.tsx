"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exportStockReplenishmentExcel,
  exportStockReplenishmentPdf,
} from "@/lib/stock-replenishment-export";
import type {
  StockClass,
  StockReplenishmentHealthyRow,
  StockReplenishmentItem,
  StockReplenishmentReport,
} from "@/lib/stock-replenishment";

type PillFilter = "all" | "critical" | "warning" | "healthy";
type SortKey = "severity" | "styleNo" | "shortage";

const PAGE_SIZE = 25;

const STOCK_CLASS_BADGE: Record<
  StockClass,
  { label: string; className: string }
> = {
  S: { label: "S", className: "bg-secondary text-foreground" },
  A: { label: "A", className: "bg-emerald-100 text-emerald-800" },
  B: { label: "B", className: "bg-secondary text-foreground" },
  C: { label: "C", className: "bg-muted text-muted-foreground" },
};

function StockClassBadge({ stockClass }: { stockClass: StockClass }) {
  const badge = STOCK_CLASS_BADGE[stockClass];
  return (
    <span
      className={`inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function severityRank(s: StockReplenishmentItem["severity"]): number {
  return s === "critical" ? 0 : 1;
}

function modeDescription(r: StockReplenishmentReport): string {
  const parts: string[] = [];
  if (r.mode === "manual") parts.push("Manual");
  if (r.mode === "velocity") {
    parts.push("Velocity");
    if (r.config.method1Weight != null) parts.push(`M1 ${r.config.method1Weight}%`);
    if (r.config.yearsBack != null) parts.push(`${r.config.yearsBack}yr history`);
  }
  if (r.mode === "global") {
    parts.push("Same for all");
    if (r.config.globalValue != null) parts.push(`min ${r.config.globalValue}`);
  }
  return parts.join(" · ");
}

export function StockReplenishmentPage({ canExport }: { canExport: boolean }) {
  const [report, setReport] = useState<StockReplenishmentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pillFilter, setPillFilter] = useState<PillFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/replenishment");
      if (res.status === 403) {
        setError("You do not have permission to view stock replenishment.");
        setReport(null);
        return;
      }
      if (!res.ok) {
        setError("Failed to load stock replenishment data.");
        setReport(null);
        return;
      }
      const data = (await res.json()) as StockReplenishmentReport;
      setReport(data);
      setPage(0);
    } catch {
      setError("Network error.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const alertRows = useMemo(() => {
    if (!report) return [];
    if (pillFilter === "all") return report.items;
    if (pillFilter === "critical") return report.items.filter((i) => i.severity === "critical");
    if (pillFilter === "warning") return report.items.filter((i) => i.severity === "warning");
    return [];
  }, [report, pillFilter]);

  const healthyRows = useMemo(() => {
    if (!report || pillFilter !== "healthy") return [];
    const rows: StockReplenishmentHealthyRow[] = [...report.healthySample];
    rows.sort((a, b) => a.styleNo.localeCompare(b.styleNo));
    return rows;
  }, [report, pillFilter]);

  const sortedAlertRows = useMemo(() => {
    const rows = [...alertRows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "severity") cmp = severityRank(a.severity) - severityRank(b.severity);
      else if (sortKey === "styleNo") cmp = a.styleNo.localeCompare(b.styleNo);
      else cmp = a.shortage - b.shortage;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [alertRows, sortKey, sortDir]);

  const searchTrim = searchQuery.trim();
  const filteredSortedAlertRows = useMemo(() => {
    if (!searchTrim) return sortedAlertRows;
    const q = searchTrim.toLowerCase();
    return sortedAlertRows.filter(
      (r) =>
        r.styleNo.toLowerCase().includes(q) ||
        (r.productDescription ?? "").toLowerCase().includes(q),
    );
  }, [sortedAlertRows, searchTrim]);

  const filteredHealthyRows = useMemo(() => {
    if (!searchTrim) return healthyRows;
    const q = searchTrim.toLowerCase();
    return healthyRows.filter(
      (r) =>
        r.styleNo.toLowerCase().includes(q) ||
        (r.productDescription ?? "").toLowerCase().includes(q),
    );
  }, [healthyRows, searchTrim]);

  const tableRows = pillFilter === "healthy" ? filteredHealthyRows : filteredSortedAlertRows;
  const totalPages = Math.max(1, Math.ceil(tableRows.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const pageSlice =
    pillFilter === "healthy"
      ? (filteredHealthyRows as StockReplenishmentHealthyRow[]).slice(
          pageSafe * PAGE_SIZE,
          pageSafe * PAGE_SIZE + PAGE_SIZE,
        )
      : filteredSortedAlertRows.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    setPage(0);
  }, [searchTrim]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "styleNo" ? "asc" : key === "shortage" ? "desc" : "asc");
    }
  }

  if (loading && !report) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        Loading stock replenishment…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200/70 bg-rose-50/70 px-5 py-4 text-sm text-rose-800">
        {error}
      </div>
    );
  }

  if (!report) return null;

  const showEmptySuccess = report.totalAlerts === 0 && pillFilter === "all";

  const pillCls = (active: boolean) =>
    [
      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors",
      active
        ? "border-border bg-card text-foreground shadow-card"
        : "border-border bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
    ].join(" ");

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={pillCls(pillFilter === "critical")}
            onClick={() => {
              setPillFilter("critical");
              setPage(0);
            }}
          >
            <span className="text-red-600" aria-hidden>
              ●
            </span>
            {report.criticalCount} Critical
          </button>
          <button
            type="button"
            className={pillCls(pillFilter === "warning")}
            onClick={() => {
              setPillFilter("warning");
              setPage(0);
            }}
          >
            <span className="text-amber-500" aria-hidden>
              ●
            </span>
            {report.warningCount} Warning
          </button>
          <button
            type="button"
            className={pillCls(pillFilter === "healthy")}
            onClick={() => {
              setPillFilter("healthy");
              setPage(0);
            }}
          >
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
            {report.healthyCount} Healthy
          </button>
          <button
            type="button"
            className={pillCls(pillFilter === "all")}
            onClick={() => {
              setPillFilter("all");
              setPage(0);
            }}
          >
            All alerts ({report.totalAlerts})
          </button>
          <span className="hidden text-sm text-muted-foreground sm:inline">Mode: {modeDescription(report)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          {canExport ? (
            <>
              <button
                type="button"
                disabled={report.items.length === 0}
                onClick={() => exportStockReplenishmentPdf(report)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="size-4" aria-hidden />
                Export PDF
              </button>
              <button
                type="button"
                disabled={report.items.length === 0}
                onClick={() => void exportStockReplenishmentExcel(report)}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet className="size-4" aria-hidden />
                Export Excel
              </button>
            </>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground sm:hidden">Mode: {modeDescription(report)}</p>

      {showEmptySuccess ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/50 px-6 py-16 text-center">
          <CheckCircle2 className="size-12 text-emerald-600" aria-hidden />
          <p className="text-base font-semibold text-emerald-900">All StyleNos are above minimum thresholds</p>
          <p className="text-sm text-emerald-800/90">
            Last checked: {new Date(report.checkedAt).toLocaleString()}
          </p>
        </div>
      ) : (
        <div className="surface-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative min-w-[12rem] max-w-md flex-1">
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Style No or Product Description..."
                className="h-9 w-full rounded-lg border border-border bg-secondary/80 pr-8 pl-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground/30 focus:ring-2 focus:ring-ring/20"
                aria-label="Filter by style or description"
              />
              {searchTrim ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sort</span>
            {(["severity", "styleNo", "shortage"] as SortKey[]).map((k) => (
              <button
                key={k}
                type="button"
                disabled={pillFilter === "healthy"}
                onClick={() => toggleSort(k)}
                className={[
                  "rounded-lg px-2 py-1 text-xs font-medium",
                  sortKey === k ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:bg-secondary",
                  pillFilter === "healthy" ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                {k === "severity" ? "Severity" : k === "styleNo" ? "Style No" : "Shortage"}
                {sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-secondary/95 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-sm">
                <tr>
                  <th className="border-b border-border px-3 py-2">Style No</th>
                  <th className="border-b border-border px-3 py-2">Class</th>
                  <th className="border-b border-border px-3 py-2">Product</th>
                  <th className="border-b border-border px-3 py-2 text-right">Current</th>
                  <th className="border-b border-border px-3 py-2 text-right">Min</th>
                  <th className="border-b border-border px-3 py-2 text-right">Shortage</th>
                  <th className="border-b border-border px-3 py-2">Severity</th>
                  <th className="border-b border-border px-3 py-2 min-w-[120px]">Level</th>
                </tr>
              </thead>
              <tbody>
                {pillFilter === "healthy"
                  ? (pageSlice as StockReplenishmentHealthyRow[]).map((row) => (
                      <tr key={row.styleNo} className="border-b border-border hover:bg-secondary/80">
                        <td className="px-3 py-2 font-mono text-[13px]">{row.styleNo}</td>
                        <td className="px-3 py-2">
                          <StockClassBadge stockClass={row.stockClass} />
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-stone-700">{row.productDescription}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700">{row.currentStock}</td>
                        <td className="px-3 py-2 text-right">{row.minThreshold}</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            OK
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{
                                width: `${row.minThreshold > 0 ? Math.min(100, Math.round((row.currentStock / row.minThreshold) * 100)) : 100}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  : (pageSlice as StockReplenishmentItem[]).map((row) => (
                      <tr key={row.styleNo} className="border-b border-border hover:bg-secondary/80">
                        <td className="px-3 py-2 font-mono text-[13px]">{row.styleNo}</td>
                        <td className="px-3 py-2">
                          <StockClassBadge stockClass={row.stockClass} />
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2 text-stone-700">{row.productDescription}</td>
                        <td
                          className={[
                            "px-3 py-2 text-right font-medium",
                            row.currentStock < row.minThreshold ? "text-red-600" : "text-emerald-700",
                          ].join(" ")}
                        >
                          {row.currentStock}
                        </td>
                        <td className="px-3 py-2 text-right">{row.minThreshold}</td>
                        <td className="px-3 py-2 text-right font-bold text-red-600">{row.shortage}</td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase",
                              row.severity === "critical"
                                ? "bg-red-100 text-red-800"
                                : "bg-amber-100 text-amber-900",
                            ].join(" ")}
                          >
                            {row.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="h-2 w-full overflow-hidden rounded-full bg-red-100">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{
                                width: `${Math.min(100, row.percentageOfMin)}%`,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {pillFilter === "healthy" && report.healthyCount > report.healthySample.length && !searchTrim ? (
            <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Showing first {report.healthySample.length} of {report.healthyCount} healthy styles.
            </p>
          ) : null}

          {tableRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              {searchTrim ? (
                <>
                  <p className="text-sm font-medium text-stone-700">No results for &quot;{searchTrim}&quot;</p>
                  <p className="text-xs text-muted-foreground">Try a different style number or product phrase.</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="size-8 text-amber-400" aria-hidden />
                  <p className="text-sm">No rows for this filter.</p>
                </>
              )}
            </div>
          ) : null}

          {tableRows.length > PAGE_SIZE ? (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm text-muted-foreground">
              <span>
                Page {pageSafe + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pageSafe <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={pageSafe >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-border px-2 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {!showEmptySuccess && (
        <p className="text-xs text-muted-foreground">Last checked: {new Date(report.checkedAt).toLocaleString()}</p>
      )}
    </section>
  );
}
