"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";

type MissingItem = {
  stockNo: string;
  styleNo: string | null;
  productDescription: string | null;
  uploadedAt: string;
  missingNote: string | null;
};

export function StockReviewPage({ canResolve }: { canResolve: boolean }) {
  const [items, setItems] = useState<MissingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/review", { credentials: "include" });
      const data = (await res.json()) as { items?: MissingItem[]; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? "Failed to load missing items.");
      }
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function markResolved(stockNo: string) {
    setResolving(stockNo);
    try {
      const res = await fetch("/api/stock/review/resolve", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockNo }),
      });
      const data = (await res.json()) as { message?: string; success?: boolean };
      if (!res.ok) {
        throw new Error(data.message ?? "Could not update stock.");
      }
      setToast({ type: "success", message: "Marked resolved." });
      await load();
    } catch (e) {
      setToast({ type: "error", message: e instanceof Error ? e.message : "Update failed." });
    } finally {
      setResolving(null);
    }
  }

  function formatUploaded(iso: string) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  const th =
    "sticky top-0 z-10 border-b border-stone-300 bg-white/95 px-3 py-3 text-left text-[12px] font-medium text-[#78716C] tracking-wide";
  const td = "border-b border-stone-200 px-3 py-3 align-top text-sm text-stone-800";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Stock review</h1>
          <p className="mt-1 text-sm text-stone-600">Items flagged as missing from stock uploads.</p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-violet-800 underline-offset-4 hover:text-violet-950 hover:underline"
        >
          ← Dashboard
        </Link>
      </div>

      {toast ? (
        <div
          className={[
            "rounded-lg border px-3 py-2 text-sm font-medium",
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
        >
          {toast.message}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-stone-500">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CheckCircle2 className="size-10 text-emerald-600" aria-hidden />
            <p className="font-medium text-stone-800">No missing items</p>
            <p className="text-sm text-stone-500">All stock lines are accounted for.</p>
          </div>
        ) : (
          <div className="max-h-[min(70vh,720px)] overflow-auto">
            <table className="w-full min-w-[800px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className={`${th} font-mono`}>Stock No</th>
                  <th className={`${th} font-mono`}>Style No</th>
                  <th className={th}>Product description</th>
                  <th className={th}>Last uploaded</th>
                  <th className={th}>Status note</th>
                  <th className={`${th} w-36`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.stockNo} className="hover:bg-stone-50/80">
                    <td className={`${td} font-mono text-xs`}>{row.stockNo}</td>
                    <td className={`${td} font-mono text-xs`}>{row.styleNo ?? "—"}</td>
                    <td className={`${td} max-w-xs truncate`} title={row.productDescription ?? ""}>
                      {row.productDescription ?? "—"}
                    </td>
                    <td className={`${td} text-stone-600`}>{formatUploaded(row.uploadedAt)}</td>
                    <td className={`${td} max-w-[200px] text-stone-600`}>{row.missingNote ?? "—"}</td>
                    <td className={td}>
                      {canResolve ? (
                        <button
                          type="button"
                          disabled={resolving === row.stockNo}
                          onClick={() => void markResolved(row.stockNo)}
                          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {resolving === row.stockNo ? "Saving…" : "Mark resolved"}
                        </button>
                      ) : (
                        <span className="text-xs text-stone-400">No permission</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
