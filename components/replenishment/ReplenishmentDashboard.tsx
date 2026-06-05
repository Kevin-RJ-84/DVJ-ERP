"use client";

import { BarChart3, Package } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FilterBar } from "@/components/replenishment/FilterBar";
import { MetricCard } from "@/components/replenishment/MetricCard";
import { StockDrawer } from "@/components/replenishment/StockDrawer";
import type { UploadImportStatusPayload } from "@/lib/import-upload";
import { formatImportSnapshot } from "@/lib/import-upload";
import type { ReplenishmentFilters } from "@/lib/replenishment";

type CalculationResult = {
  metrics: {
    inStockCount: number;
    pullbackCount: number;
    factoryOrderCount: number;
    requiredQty: number;
  };
  lists: {
    inStockItems: Array<{
      StockNo: string;
      StockType: string | null;
      Location: string | null;
    }>;
    pullbackItems: Array<{
      StockNo: string;
      PartyName: string | null;
      MemoNo: string;
      MemoEndDate: string;
    }>;
  };
};

export function ReplenishmentDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<ReplenishmentFilters>(() => {
    if (typeof window === "undefined") {
      return {};
    }
    const params = new URLSearchParams(window.location.search);
    return {
      styleNo: params.get("styleNo") || undefined,
      stoneShape: params.get("stoneShape") || undefined,
      metal: params.get("metal") || undefined,
      metalType: params.get("metalType") || undefined,
      productType: params.get("productType") || undefined,
      productStyle: params.get("productStyle") || undefined,
    };
  });
  const [requiredQty, setRequiredQty] = useState<number | "">(() => {
    if (typeof window === "undefined") {
      return "";
    }
    const raw = new URLSearchParams(window.location.search).get("requiredQty");
    const numeric = raw ? Number(raw) : NaN;
    return Number.isFinite(numeric) && numeric > 0 ? numeric : "";
  });
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [drawerMode, setDrawerMode] = useState<"inStock" | "pullback" | null>(null);
  const [importStatus, setImportStatus] = useState<UploadImportStatusPayload | null>(null);

  function persistQueryParams(nextRequiredQty: number, nextFilters: ReplenishmentFilters) {
    const params = new URLSearchParams();
    params.set("requiredQty", String(nextRequiredQty));
    if (nextFilters.styleNo?.trim()) params.set("styleNo", nextFilters.styleNo.trim());
    if (nextFilters.stoneShape?.trim()) params.set("stoneShape", nextFilters.stoneShape.trim());
    if (nextFilters.metal?.trim()) params.set("metal", nextFilters.metal.trim());
    if (nextFilters.metalType?.trim()) params.set("metalType", nextFilters.metalType.trim());
    if (nextFilters.productType?.trim()) params.set("productType", nextFilters.productType.trim());
    if (nextFilters.productStyle?.trim()) params.set("productStyle", nextFilters.productStyle.trim());
    const base = pathname || "/replenishment-v1";
    router.replace(`${base}?${params.toString()}`);
  }

  const handleSearch = useCallback(async () => {
    if (!requiredQty || requiredQty < 1) {
      setError("Required quantity must be at least 1.");
      return;
    }

    setSearching(true);
    setError(null);
    try {
      const response = await fetch("/api/replenishment/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requiredQty,
          filters,
        }),
      });
      const payload = (await response.json()) as CalculationResult & { message?: string };

      if (!response.ok) {
        setError(payload.message ?? "Failed to calculate replenishment.");
        return;
      }

      setResult(payload);
      persistQueryParams(requiredQty, filters);
    } catch {
      setError("Unexpected network error while calculating.");
    } finally {
      setSearching(false);
    }
  }, [filters, pathname, requiredQty, router]);

  const handleSearchRef = useRef(handleSearch);
  handleSearchRef.current = handleSearch;

  async function refreshImportStatus() {
    try {
      const response = await fetch("/api/upload");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as UploadImportStatusPayload;
      setImportStatus(payload);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void refreshImportStatus();
  }, []);

  useEffect(() => {
    const onDataImported = () => {
      void refreshImportStatus();
      const run = handleSearchRef.current;
      if (!run) {
        return;
      }
      const qty = requiredQty;
      if (result !== null && typeof qty === "number" && qty >= 1) {
        void run();
      }
    };
    window.addEventListener("dvj:data-imported", onDataImported);
    return () => window.removeEventListener("dvj:data-imported", onDataImported);
  }, [requiredQty, result]);

  return (
    <>
      {importStatus ? (
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-100/50 bg-[#fffdf9]/78 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-sm">
            <Package className="size-3.5 text-rose-700" aria-hidden />
            {formatImportSnapshot("Stock import", importStatus.stock)}
          </span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-amber-100/50 bg-[#fffdf9]/78 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-sm">
            <BarChart3 className="size-3.5 text-stone-600" aria-hidden />
            {formatImportSnapshot("Sales import", importStatus.sales)}
          </span>
        </div>
      ) : null}

      <FilterBar
        value={filters}
        requiredQty={requiredQty}
        onChange={setFilters}
        onRequiredQtyChange={setRequiredQty}
        onSearch={handleSearch}
        searching={searching}
      />

      {error ? (
        <p className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      {searching ? (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard
            title="In Stock"
            value={0}
            loading
            tone="inStock"
            hint="Matching pieces in warehouse and ready."
          />
          <MetricCard
            title="Available via Pullback"
            value={0}
            loading
            tone="pullback"
            hint="Pieces expected to return from memo."
          />
          <MetricCard
            title="Needs Factory Order"
            value={0}
            loading
            tone="factory"
            hint="Remaining quantity to place as factory order."
          />
        </section>
      ) : result ? (
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard
            title="In Stock"
            value={result.metrics.inStockCount}
            hint="Matching pieces in warehouse and ready."
            canViewDetails
            tone="inStock"
            onViewDetails={() => setDrawerMode("inStock")}
          />
          <MetricCard
            title="Available via Pullback"
            value={result.metrics.pullbackCount}
            hint="Pieces expected to return from memo."
            canViewDetails
            tone="pullback"
            onViewDetails={() => setDrawerMode("pullback")}
          />
          <MetricCard
            title="Needs Factory Order"
            value={result.metrics.factoryOrderCount}
            hint="Remaining quantity to place as factory order."
            tone="factory"
          />
        </section>
      ) : null}

      <StockDrawer
        open={drawerMode === "inStock"}
        title="In Stock Pieces"
        onClose={() => setDrawerMode(null)}
        mode="inStock"
        inStockItems={result?.lists.inStockItems}
      />
      <StockDrawer
        open={drawerMode === "pullback"}
        title="Pullback Available Pieces"
        onClose={() => setDrawerMode(null)}
        mode="pullback"
        pullbackItems={result?.lists.pullbackItems}
      />
    </>
  );
}
