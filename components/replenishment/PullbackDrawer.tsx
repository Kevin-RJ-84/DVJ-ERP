"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { btnPrimary, btnSecondary, modalCloseBtn, modalOverlay, modalPanel } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

/** Same shape as row pullback lines from replenishment API. */
export type PullbackDrawerPullbackItem = {
  StockNo: string;
  ProductDescription: string | null;
  PartyName: string | null;
  MemoNo: string;
  MemoEndDate: string;
  CloseToExpiryDays: number;
  OverallRank: number | null;
  StyleRank: number | null;
  StyleNo: string | null;
  StoneShape: string | null;
  Metal: string | null;
  MetalType: string | null;
  ProductType: string | null;
  ProductStyle: string | null;
};

export function pullbackRowKey(row: PullbackDrawerPullbackItem): string {
  return `${row.StockNo}__${row.MemoNo}`;
}

export function memoDaysRemainingUtc(memoEndIso: string): number {
  const end = new Date(memoEndIso);
  const n = new Date();
  const startOfTodayUtc = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  return Math.floor((end.getTime() - startOfTodayUtc.getTime()) / 86400000);
}

/** Overall rank DESC (higher rank # first); null ranks last. Style rank DESC as tiebreaker. */
export function sortPullbackCandidatesByOverallRankDesc(
  items: PullbackDrawerPullbackItem[],
): PullbackDrawerPullbackItem[] {
  return [...items].sort((a, b) => {
    const aOverall = a.OverallRank ?? -Infinity;
    const bOverall = b.OverallRank ?? -Infinity;
    if (aOverall !== bOverall) return bOverall - aOverall;
    return (b.StyleRank ?? -Infinity) - (a.StyleRank ?? -Infinity);
  });
}

export type PullbackDrawerContactLogLite = {
  response: string;
  loggedAt: Date;
};

function getPullbackDotState(
  item: PullbackDrawerPullbackItem,
  isSelected: boolean,
  contactLogs: PullbackDrawerContactLogLite[],
): { color: string; tooltip: string } | null {
  if (!isSelected) return null;
  if (contactLogs.length === 0) {
    return {
      color: "#EAB308",
      tooltip: "Selected — not contacted yet",
    };
  }
  const sorted = [...contactLogs].sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());
  const lastLog = sorted[0]!;
  const rk = lastLog.response.trim().toLowerCase().replace(/\s+/g, "_");
  if (rk === "accepted") {
    return {
      color: "#16A34A",
      tooltip: "Accepted — client agreed to return",
    };
  }
  if (rk === "rejected") {
    return {
      color: "#DC2626",
      tooltip: "Rejected — client declined",
    };
  }
  return {
    color: "#2563EB",
    tooltip: "Contacted — awaiting response",
  };
}

type PullbackDrawerProps = {
  open: boolean;
  titleCount: number;
  candidates: PullbackDrawerPullbackItem[];
  maxSelectable: number;
  getContactLogsForStock?: (stockNo: string) => PullbackDrawerContactLogLite[];
  onSwapRejected?: (item: PullbackDrawerPullbackItem) => void;
  onClose: () => void;
  onConfirm: (selected: PullbackDrawerPullbackItem[]) => void;
};

export function PullbackDrawer({
  open,
  titleCount,
  candidates,
  maxSelectable,
  getContactLogsForStock,
  onSwapRejected,
  onClose,
  onConfirm,
}: PullbackDrawerProps) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const cap = Math.max(0, maxSelectable);

  useEffect(() => {
    if (!open) return;
    setSelectedKeys(new Set());
  }, [open, candidates, cap]);

  const sortedCandidates = useMemo(
    () => sortPullbackCandidatesByOverallRankDesc(candidates),
    [candidates],
  );

  const selectedCount = useMemo(() => selectedKeys.size, [selectedKeys]);
  const atCap = cap > 0 && selectedCount >= cap;

  const toggle = useCallback(
    (row: PullbackDrawerPullbackItem) => {
      const key = pullbackRowKey(row);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          if (cap > 0 && next.size >= cap) {
            return prev;
          }
          next.add(key);
        }
        return next;
      });
    },
    [cap],
  );

  const handleConfirmClick = () => {
    const selected = sortedCandidates.filter((c) => selectedKeys.has(pullbackRowKey(c)));
    onConfirm(selected);
  };

  if (!open) {
    return null;
  }

  return (
    <div className={cn(modalOverlay, "z-[200]")}>
      <div className={cn(modalPanel, "flex max-h-[90vh] max-w-5xl flex-col p-0")}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
              <span>Pullback Candidates</span>
              <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2.5 py-0.5 text-sm font-semibold text-foreground">
                {titleCount}
              </span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select up to {cap} item{cap === 1 ? "" : "s"} for external pullback allocation.
            </p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseBtn} aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-card/95 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur-sm">
              <tr>
                <th className="border-b border-border px-2 py-2.5"> </th>
                <th className="border-b border-border px-3 py-2.5">Stock No</th>
                <th className="border-b border-border px-3 py-2.5">Client Name</th>
                <th className="border-b border-border px-3 py-2.5">Overall Rank</th>
                <th className="border-b border-border px-3 py-2.5">Style Rank</th>
                <th className="border-b border-border px-3 py-2.5">Memo Expiry</th>
                <th className="border-b border-border px-3 py-2.5">Days Left</th>
              </tr>
            </thead>
            <tbody>
              {sortedCandidates.map((item) => {
                const key = pullbackRowKey(item);
                const checked = selectedKeys.has(key);
                const disabledUnchecked = !checked && atCap && cap > 0;
                const daysLeft = memoDaysRemainingUtc(item.MemoEndDate);
                const badgeTone =
                  daysLeft <= 0
                    ? "bg-red-100 text-red-800"
                    : daysLeft <= 7
                      ? "bg-amber-100 text-amber-900"
                      : "bg-emerald-100 text-emerald-800";
                const contactLogs = getContactLogsForStock?.(item.StockNo) ?? [];
                const dot = getPullbackDotState(item, checked, contactLogs);
                return (
                  <tr key={key} className="border-b border-border/60 transition-colors hover:bg-secondary/50">
                    <td className="px-2 py-2.5 align-middle">
                      <input
                        type="checkbox"
                        className="size-4 rounded border-border text-foreground focus:ring-ring/20"
                        checked={checked}
                        disabled={disabledUnchecked}
                        onChange={() => toggle(item)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs font-medium text-foreground">{item.StockNo}</td>
                    <td className="max-w-[14rem] px-3 py-2.5 text-foreground">
                      <div className="flex min-w-0 items-center gap-2">
                        {dot ? (
                          <span
                            className="inline-block size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: dot.color }}
                            title={dot.tooltip}
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate" title={item.PartyName ?? ""}>
                          {item.PartyName ?? "—"}
                        </span>
                        {dot?.color === "#DC2626" && onSwapRejected ? (
                          <button
                            type="button"
                            className="ml-auto shrink-0 text-xs font-medium text-foreground underline hover:no-underline"
                            onClick={() => onSwapRejected(item)}
                          >
                            Swap
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {item.OverallRank != null ? `#${item.OverallRank}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                      {item.StyleRank != null ? `#${item.StyleRank}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(item.MemoEndDate).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", badgeTone)}>
                        {daysLeft}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-6 py-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{selectedCount}</span> of{" "}
            <span className="font-semibold text-foreground">{cap}</span> selected
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            disabled={selectedCount < 1}
            onClick={handleConfirmClick}
            className={btnPrimary}
          >
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
