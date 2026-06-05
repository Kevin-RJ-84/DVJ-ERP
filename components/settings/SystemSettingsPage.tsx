"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart2, Boxes, RefreshCw, Settings, Shield, Sliders } from "lucide-react";
import type { ManualThresholdEditorRow } from "@/lib/stock-replenishment";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigMap = Record<string, string>;
type Role = { roleId: string; roleName: string };
type Tab =
  | "replenishment"
  | "ranking"
  | "permissions"
  | "stock_replenishment"
  | "system"
  | "erp_sync";

type ErpSyncStatus = {
  lastStockSync: string | null;
  syncEnabled: boolean;
  intervalMinutes: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: Tab[] = [
  "replenishment",
  "ranking",
  "permissions",
  "stock_replenishment",
  "system",
  "erp_sync",
];

const TAB_LABELS: Record<Tab, string> = {
  replenishment: "Replenishment",
  ranking: "Ranking",
  permissions: "Permissions",
  stock_replenishment: "Stock Rep.",
  system: "System",
  erp_sync: "ERP Sync",
};

const TAB_ICONS: Record<Tab, React.ComponentType<{ className?: string }>> = {
  replenishment: Sliders,
  ranking: BarChart2,
  permissions: Shield,
  stock_replenishment: Boxes,
  system: Settings,
  erp_sync: RefreshCw,
};

const STOCK_THRESHOLD_MODE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "velocity", label: "Velocity" },
  { value: "global", label: "Same for all" },
];

const GROUP_BY_OPTIONS = [
  { value: "StyleNo", label: "Style No." },
  { value: "ProductType", label: "Product Type" },
  { value: "StoneShape", label: "Stone Shape" },
  { value: "Metal", label: "Metal" },
  { value: "MetalType", label: "Metal Type" },
  { value: "ProductStyle", label: "Product Style" },
];

const RANDOM_PICK_OPTIONS = [
  { value: "random", label: "Random" },
  { value: "fifo", label: "FIFO (first in, first out)" },
  { value: "oldest_memo", label: "Oldest memo first" },
];

const VALUE_METRIC_OPTIONS = [
  { value: "SaleValue", label: "Sale Value" },
  { value: "Profit", label: "Profit" },
];

const RANKING_PERIOD_OPTIONS = [
  { value: "all_time", label: "All time" },
  { value: "yearly", label: "Current year" },
  { value: "monthly", label: "Current month" },
];

const PERMISSION_ROWS = [
  {
    key: "perm_undo_replenishment",
    label: "Undo replenishment",
    description: "Minimum role required to reverse a confirmed replenishment.",
  },
  {
    key: "perm_export_pdf",
    label: "Export PDF",
    description: "Minimum role required to export the replenishment PDF.",
  },
  {
    key: "perm_upload_excel",
    label: "Upload Excel",
    description: "Minimum role required to upload stock or sales Excel files.",
  },
  {
    key: "perm_manage_clients",
    label: "Manage clients",
    description: "Minimum role required to edit client settings.",
  },
];

const FALLBACK_ROLES = ["viewer", "member", "admin", "super_admin"];

const ERP_SYNC_INTERVAL_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "60 minutes" },
  { value: "120", label: "120 minutes" },
];

function formatLastStockSync(iso: string | null | undefined): string {
  if (!iso) return "Never synced";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Never synced";
  return date.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-stone-200/70 px-5 py-3 sm:px-7">
      <h2 className="font-serif text-base font-semibold text-stone-900">{title}</h2>
      {description && <p className="mt-0.5 max-w-4xl text-xs leading-snug text-stone-500">{description}</p>}
    </div>
  );
}

function FieldRow({
  label,
  description,
  saved,
  children,
}: {
  label: string;
  description?: string;
  saved: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-stone-100/80 px-5 py-3 last:border-b-0 sm:px-7 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] lg:items-center lg:gap-x-10 lg:gap-y-1">
      <div className="min-w-0 lg:max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-stone-800">{label}</p>
          {saved && <span className="text-[11px] font-semibold text-emerald-600">Saved ✓</span>}
        </div>
        {description && <p className="mt-0.5 text-xs leading-snug text-stone-500">{description}</p>}
      </div>
      <div className="flex shrink-0 justify-start lg:justify-end">{children}</div>
    </div>
  );
}

const selectCls =
  "min-w-[11rem] rounded-lg border border-stone-200/80 bg-white/90 px-3 py-1.5 text-sm text-stone-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:cursor-not-allowed disabled:opacity-50";

const numberInputCls =
  "w-24 rounded-lg border border-stone-200/80 bg-white/90 px-3 py-1.5 text-sm text-stone-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:cursor-not-allowed disabled:opacity-50";

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-violet-600" : "bg-stone-300",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

function ConfigPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-stone-100/80 px-5 py-4 sm:px-7">
      <p className="text-xs font-bold uppercase tracking-wide text-violet-800">{title}</p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function ConfigInlineRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-800">{label}</p>
        {description ? <p className="mt-0.5 text-xs text-stone-500">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SystemSettingsPage() {
  const [config, setConfig] = useState<ConfigMap | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("replenishment");
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [recalculating, setRecalculating] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [manualRows, setManualRows] = useState<ManualThresholdEditorRow[] | null>(null);
  const [manualSearch, setManualSearch] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [savingStyle, setSavingStyle] = useState<string | null>(null);
  const [draftMins, setDraftMins] = useState<Record<string, string>>({});
  const [erpSyncStatus, setErpSyncStatus] = useState<ErpSyncStatus | null>(null);
  const [erpSyncStatusLoading, setErpSyncStatusLoading] = useState(false);
  const [erpManualSyncing, setErpManualSyncing] = useState(false);
  const [erpManualSyncError, setErpManualSyncError] = useState<string | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{
    updated: number;
    inserted: number;
    errors: string[];
  } | null>(null);
  const [thresholdRecalculating, setThresholdRecalculating] = useState(false);
  const [thresholdRecalcAt, setThresholdRecalcAt] = useState<string | null>(null);
  const [thresholdRecalcError, setThresholdRecalcError] = useState<string | null>(null);

  const debounceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    loadConfig();
    loadRoles();
    return () => {
      debounceTimers.current.forEach(clearTimeout);
      savedTimers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab !== "stock_replenishment") return;
    const mode = config?.stock_threshold_mode;
    if (!config || mode !== "manual") {
      setManualRows(null);
      setDraftMins({});
      return;
    }
    setManualLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/stock/replenishment/thresholds");
        if (res.ok) {
          const data = (await res.json()) as { rows: ManualThresholdEditorRow[] };
          setManualRows(data.rows);
          setDraftMins(
            Object.fromEntries(data.rows.map((r) => [r.styleNo, String(r.minQuantity)])),
          );
        } else {
          setManualRows([]);
        }
      } catch {
        setManualRows([]);
      } finally {
        setManualLoading(false);
      }
    })();
  }, [activeTab, config?.stock_threshold_mode, config]);

  useEffect(() => {
    if (activeTab !== "erp_sync") return;
    setErpSyncStatusLoading(true);
    void fetch("/api/erp/sync/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ErpSyncStatus | null) => {
        if (data) setErpSyncStatus(data);
      })
      .catch(() => {})
      .finally(() => setErpSyncStatusLoading(false));
  }, [activeTab]);

  async function saveManualThreshold(styleNo: string, minQuantity: number) {
    setSavingStyle(styleNo);
    try {
      const res = await fetch("/api/stock/replenishment/thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleNo, minQuantity }),
      });
      if (res.ok) {
        setManualRows((prev) =>
          prev
            ? prev.map((r) => (r.styleNo === styleNo ? { ...r, minQuantity } : r))
            : prev,
        );
        setDraftMins((prev) => ({ ...prev, [styleNo]: String(minQuantity) }));
      }
    } finally {
      setSavingStyle(null);
    }
  }

  async function handleRecalculateThresholds() {
    setThresholdRecalculating(true);
    setThresholdRecalcError(null);
    try {
      const res = await fetch("/api/stock/replenishment");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setThresholdRecalcError((data as { message?: string }).message ?? "Recalculation failed.");
        return;
      }
      const data = (await res.json()) as { checkedAt: string };
      setThresholdRecalcAt(data.checkedAt);
    } catch {
      setThresholdRecalcError("Network error — please try again.");
    } finally {
      setThresholdRecalculating(false);
    }
  }

  async function handleManualStockSync() {
    setErpManualSyncing(true);
    setErpManualSyncError(null);
    try {
      const res = await fetch("/api/erp/sync/stock", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const syncedAt = new Date().toISOString();
        setLastSyncResult({
          updated: data.updated ?? 0,
          inserted: data.inserted ?? 0,
          errors: Array.isArray(data.errors) ? data.errors : [],
        });
        setErpSyncStatus((prev) =>
          prev
            ? { ...prev, lastStockSync: syncedAt }
            : { lastStockSync: syncedAt, syncEnabled: true, intervalMinutes: 30 },
        );
        setConfig((prev) => (prev ? { ...prev, erp_last_stock_sync: syncedAt } : prev));
      } else {
        setErpManualSyncError(data.error ?? "Sync failed.");
      }
    } catch {
      setErpManualSyncError("Network error — please try again.");
    } finally {
      setErpManualSyncing(false);
    }
  }

  async function loadConfig() {
    const res = await fetch("/api/settings");
    if (res.status === 403) {
      setLoadError("You don't have permission to view system settings.");
      return;
    }
    if (!res.ok) {
      setLoadError("Failed to load settings.");
      return;
    }
    const data = (await res.json()) as {
      config: Record<string, Array<{ ConfigKey: string; ConfigValue: string }>>;
    };
    const flat: ConfigMap = {};
    for (const rows of Object.values(data.config)) {
      for (const row of rows) {
        flat[row.ConfigKey] = row.ConfigValue;
      }
    }
    setConfig(flat);
  }

  async function loadRoles() {
    const res = await fetch("/api/roles");
    if (!res.ok) return;
    const data = (await res.json()) as { roles: Role[] };
    setRoles(data.roles);
  }

  function markSaved(key: string) {
    setSavedKeys((prev) => new Set([...prev, key]));
    const existing = savedTimers.current.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      setSavedKeys((prev) => {
        const s = new Set(prev);
        s.delete(key);
        return s;
      });
      savedTimers.current.delete(key);
    }, 3000);
    savedTimers.current.set(key, t);
  }

  async function doSave(key: string, value: string) {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.status === 403) {
      setCanEdit(false);
      return;
    }
    if (res.ok) markSaved(key);
  }

  function schedSave(key: string, value: string, immediate = false) {
    const existing = debounceTimers.current.get(key);
    if (existing) clearTimeout(existing);
    if (immediate) {
      doSave(key, value);
      return;
    }
    const t = setTimeout(() => {
      doSave(key, value);
      debounceTimers.current.delete(key);
    }, 1000);
    debounceTimers.current.set(key, t);
  }

  function handleChange(key: string, value: string, immediate = false) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    schedSave(key, value, immediate);
  }

  function handleValueWeightChange(value: string) {
    const num = parseFloat(value);
    const volWeight = Number.isNaN(num) ? "" : Math.max(0, Math.min(1, 1 - num)).toFixed(2);
    setConfig((prev) =>
      prev ? { ...prev, ranking_value_weight: value, ranking_volume_weight: volWeight } : prev,
    );
    schedSave("ranking_value_weight", value);
    if (volWeight !== "") schedSave("ranking_volume_weight", volWeight);
  }

  async function handleRecalculate() {
    setRecalculating(true);
    setRecalcError(null);
    try {
      const res = await fetch("/api/rankings/recalculate", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRecalcError((data as { message?: string }).message ?? "Recalculation failed.");
      } else {
        await loadConfig();
      }
    } catch {
      setRecalcError("Network error — please try again.");
    } finally {
      setRecalculating(false);
    }
  }

  // Shorthand helpers
  const s = (key: string) => savedKeys.has(key);
  const v = (key: string) => config?.[key] ?? "";

  const velocityValidation = useMemo(() => {
    if (!config) {
      return { errors: [] as string[], cClassPct: 50, m2Weight: 50, otherMonthWeight: 16.7 };
    }
    const val = (key: string) => config[key] ?? "";
    const errors: string[] = [];
    const abcA = parseInt(val("abc_a_class_pct") || "20", 10);
    const abcB = parseInt(val("abc_b_class_pct") || "30", 10);
    const cClassPct = Math.max(0, 100 - abcA - abcB);
    if (abcA + abcB > 99) errors.push("A + B cannot exceed 99%.");

    const bufA = parseFloat(val("buffer_a_multiplier") || "1.2");
    const bufB = parseFloat(val("buffer_b_multiplier") || "1.15");
    const bufC = parseFloat(val("buffer_c_multiplier") || "1.05");
    if (bufA <= 0 || bufB <= 0 || bufC <= 0) {
      errors.push("Buffer multipliers must be greater than 0.");
    }

    const yearsBack = parseInt(val("stock_velocity_years_back") || "3", 10);
    if (yearsBack < 1 || yearsBack > 10) {
      errors.push("Years back must be between 1 and 10.");
    }

    const windowSize = parseInt(val("stock_window_size") || "4", 10);
    if (windowSize < 1 || windowSize > 6) {
      errors.push("Window size must be between 1 and 6.");
    }

    const cvTrust = parseFloat(val("stock_cv_trust_threshold") || "0.3");
    const cvDampen = parseFloat(val("stock_cv_dampen_threshold") || "0.7");
    if (cvTrust >= cvDampen) {
      errors.push("CV trust threshold must be less than dampen threshold.");
    }

    const m1Weight = parseInt(val("stock_method1_weight") || "50", 10);
    const m2Weight = 100 - m1Weight;
    if (m1Weight < 1 || m1Weight > 99) {
      errors.push("Method 1 weight must be between 1 and 99.");
    }

    let manualWeightSum = 100;
    if (val("stock_window_weight_mode") === "manual") {
      try {
        const parsed = JSON.parse(val("stock_window_weights_manual") || "{}") as Record<string, number>;
        manualWeightSum = Object.values(parsed).reduce((a, b) => a + b, 0);
      } catch {
        manualWeightSum = 0;
      }
      if (manualWeightSum !== 100) {
        errors.push("Manual window weights must sum to 100%.");
      }
    }

    const weightCurrent = parseInt(val("stock_window_weight_current") || "50", 10);
    const otherMonthWeight =
      windowSize > 1 ? (100 - weightCurrent) / (windowSize - 1) : 0;

    return { errors, cClassPct, m2Weight, otherMonthWeight, abcA, abcB, m1Weight };
  }, [config]);

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="mt-6 rounded-2xl border border-rose-200/60 bg-rose-50/60 px-5 py-4 text-sm font-medium text-rose-700">
        {loadError}
      </div>
    );
  }

  if (!config) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-stone-500">
        <RefreshCw className="size-4 animate-spin" aria-hidden />
        Loading settings…
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mt-6 flex w-full min-w-0 flex-col gap-4">
      {/* Tab bar */}
      <div className="flex w-full gap-1 rounded-2xl border border-white/60 bg-white/70 p-1.5 shadow-sm backdrop-blur-xl">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={[
                "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors duration-150",
                active ? "bg-white shadow-sm text-violet-800" : "text-stone-500 hover:text-stone-800",
              ].join(" ")}
            >
              <Icon
                className={`size-4 shrink-0 ${active ? "text-violet-600" : "text-stone-400"}`}
                aria-hidden
              />
              <span className="hidden sm:inline">{TAB_LABELS[tab]}</span>
            </button>
          );
        })}
      </div>

      {/* Tab panel */}
      <div className="w-full min-h-[min(520px,calc(100vh-13rem))] overflow-hidden rounded-2xl border border-white/60 bg-white/75 shadow-[0_22px_55px_-22px_rgba(15,15,15,0.14)] backdrop-blur-xl ring-1 ring-stone-900/[0.03]">
        {/* ── Tab 1: Replenishment ── */}
        {activeTab === "replenishment" && (
          <>
            <SectionHeader
              title="Replenishment"
              description="Defaults for the replenishment planning page."
            />
            <FieldRow
              label="Partial replenishment visibility"
              description="Show results per line-item even when some are already replenished."
              saved={s("partial_replenishment_visibility")}
            >
              <button
                type="button"
                role="switch"
                aria-checked={v("partial_replenishment_visibility") === "true"}
                disabled={!canEdit}
                onClick={() =>
                  handleChange(
                    "partial_replenishment_visibility",
                    v("partial_replenishment_visibility") === "true" ? "false" : "true",
                    true,
                  )
                }
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
                  v("partial_replenishment_visibility") === "true" ? "bg-violet-600" : "bg-stone-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200",
                    v("partial_replenishment_visibility") === "true" ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </FieldRow>

            <FieldRow
              label="Default group by"
              description="The group-by field selected by default on the replenishment page."
              saved={s("default_group_by")}
            >
              <select
                value={v("default_group_by")}
                disabled={!canEdit}
                onChange={(e) => handleChange("default_group_by", e.target.value, true)}
                className={selectCls}
              >
                {GROUP_BY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <FieldRow
              label="Random pick method"
              description="Algorithm used to auto-select stock pills."
              saved={s("random_pick_method")}
            >
              <select
                value={v("random_pick_method")}
                disabled={!canEdit}
                onChange={(e) => handleChange("random_pick_method", e.target.value, true)}
                className={selectCls}
              >
                {RANDOM_PICK_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldRow>
          </>
        )}

        {/* ── Tab 2: Ranking ── */}
        {activeTab === "ranking" && (
          <>
            <SectionHeader
              title="Customer Rankings"
              description="Configure how client rankings are scored and calculated."
            />

            {/* Combined score toggle */}
            <FieldRow
              label="Use combined score"
              description={
                v("use_combined_score") === "true"
                  ? "Ranks clients by weighted combination of value and volume (pieces sold)."
                  : "Ranks clients purely by the selected value metric — no volume weighting."
              }
              saved={s("use_combined_score")}
            >
              <button
                type="button"
                role="switch"
                aria-checked={v("use_combined_score") === "true"}
                disabled={!canEdit}
                onClick={() =>
                  handleChange(
                    "use_combined_score",
                    v("use_combined_score") === "true" ? "false" : "true",
                    true,
                  )
                }
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
                  v("use_combined_score") === "true" ? "bg-violet-600" : "bg-stone-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200",
                    v("use_combined_score") === "true" ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </FieldRow>

            <FieldRow
              label="Value metric"
              description="The sales field used as the value dimension in the ranking score."
              saved={s("ranking_value_metric")}
            >
              <select
                value={v("ranking_value_metric")}
                disabled={!canEdit}
                onChange={(e) => handleChange("ranking_value_metric", e.target.value, true)}
                className={selectCls}
              >
                {VALUE_METRIC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            {/* Weight section — only relevant when combined score is ON */}
            <div className={v("use_combined_score") !== "true" ? "opacity-50 pointer-events-none" : ""}>
              <FieldRow
                label="Value weight"
                description={
                  v("use_combined_score") !== "true"
                    ? "Enable combined score to configure weights."
                    : "Weight applied to the value metric (0.0 – 1.0). Volume weight is computed automatically."
                }
                saved={s("ranking_value_weight")}
              >
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={v("ranking_value_weight")}
                  disabled={!canEdit || v("use_combined_score") !== "true"}
                  onChange={(e) => handleValueWeightChange(e.target.value)}
                  className={numberInputCls}
                />
              </FieldRow>

              <FieldRow
                label="Volume weight"
                description="Automatically computed as 1 − value weight. Read-only."
                saved={false}
              >
                <input
                  type="number"
                  value={v("ranking_volume_weight")}
                  disabled
                  readOnly
                  className={`${numberInputCls} bg-stone-50/80`}
                />
              </FieldRow>
            </div>

            <FieldRow
              label="Ranking period"
              description="The time period over which sales are aggregated for ranking."
              saved={s("ranking_period")}
            >
              <select
                value={v("ranking_period")}
                disabled={!canEdit}
                onChange={(e) => handleChange("ranking_period", e.target.value, true)}
                className={selectCls}
              >
                {RANKING_PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
              <div>
                <p className="text-sm font-semibold text-stone-800">Recalculate rankings</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  {v("ranking_last_calculated")
                    ? `Last calculated: ${new Date(v("ranking_last_calculated")).toLocaleString()}`
                    : "Rankings have not been calculated yet."}
                </p>
                {recalcError && <p className="mt-1 text-xs text-rose-600">{recalcError}</p>}
              </div>
              <button
                type="button"
                disabled={recalculating}
                onClick={handleRecalculate}
                className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`size-4 ${recalculating ? "animate-spin" : ""}`} aria-hidden />
                {recalculating ? "Calculating…" : "Recalculate Now"}
              </button>
            </div>
          </>
        )}

        {/* ── Tab 3: Permissions ── */}
        {activeTab === "permissions" && (
          <>
            <SectionHeader
              title="Minimum Role Requirements"
              description="The minimum role a user must hold to perform each sensitive action."
            />
            {PERMISSION_ROWS.map(({ key, label, description }) => (
              <FieldRow key={key} label={label} description={description} saved={s(key)}>
                <select
                  value={v(key)}
                  disabled={!canEdit}
                  onChange={(e) => handleChange(key, e.target.value, true)}
                  className={selectCls}
                >
                  {v(key) === "" && (
                    <option value="" disabled>
                      Select a role…
                    </option>
                  )}
                  {(roles.length > 0 ? roles.map((r) => r.roleName) : FALLBACK_ROLES).map(
                    (roleName) => (
                      <option key={roleName} value={roleName}>
                        {roleName}
                      </option>
                    ),
                  )}
                </select>
              </FieldRow>
            ))}
          </>
        )}

        {/* ── Stock replenishment ── */}
        {activeTab === "stock_replenishment" && (
          <>
            <SectionHeader
              title="Stock replenishment"
              description="Threshold mode and minimum stock rules for warehouse inventory."
            />
            <FieldRow
              label="Threshold mode"
              description="Manual uses per-style minima; Velocity derives minimums from sales; Same for all uses one global number."
              saved={s("stock_threshold_mode")}
            >
              <select
                value={v("stock_threshold_mode") || "manual"}
                disabled={!canEdit}
                onChange={(e) => {
                  handleChange("stock_threshold_mode", e.target.value, true);
                  if (e.target.value !== "manual") {
                    setManualRows(null);
                    setDraftMins({});
                  }
                }}
                className={selectCls}
              >
                {STOCK_THRESHOLD_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </FieldRow>

            {v("stock_threshold_mode") === "velocity" ? (
              <>
                {velocityValidation.errors.length > 0 ? (
                  <div className="border-b border-rose-100 bg-rose-50/60 px-5 py-3 sm:px-7">
                    {velocityValidation.errors.map((err) => (
                      <p key={err} className="text-xs font-medium text-rose-700">
                        {err}
                      </p>
                    ))}
                  </div>
                ) : null}

                <ConfigPanel title="S-Class">
                  <ConfigInlineRow
                    label="Min revenue per piece"
                    description="Styles with avg sale value above this are S-class."
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-stone-500">$</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={v("sclass_min_revenue_per_piece") || "500"}
                        disabled={!canEdit}
                        onChange={(e) => handleChange("sclass_min_revenue_per_piece", e.target.value)}
                        className={numberInputCls}
                      />
                    </div>
                  </ConfigInlineRow>
                  <ConfigInlineRow
                    label="Fixed minimum stock"
                    description="S-class styles always keep at least this many pieces. Trend calculation skipped."
                  >
                    <input
                      type="number"
                      min={0}
                      value={v("sclass_fixed_min_stock") || "1"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("sclass_fixed_min_stock", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                </ConfigPanel>

                <ConfigPanel title="ABC Distribution">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ConfigInlineRow label="A-class">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={v("abc_a_class_pct") || "20"}
                          disabled={!canEdit}
                          onChange={(e) => handleChange("abc_a_class_pct", e.target.value)}
                          className={numberInputCls}
                        />
                        <span className="text-xs text-stone-500">%</span>
                      </div>
                    </ConfigInlineRow>
                    <ConfigInlineRow label="B-class">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={99}
                          value={v("abc_b_class_pct") || "30"}
                          disabled={!canEdit}
                          onChange={(e) => handleChange("abc_b_class_pct", e.target.value)}
                          className={numberInputCls}
                        />
                        <span className="text-xs text-stone-500">%</span>
                      </div>
                    </ConfigInlineRow>
                    <ConfigInlineRow label="C-class (auto)">
                      <span className="text-sm font-semibold text-stone-700">
                        {velocityValidation.cClassPct}%
                      </span>
                    </ConfigInlineRow>
                  </div>
                  <p className="text-xs text-stone-500">C = 100 − A − B (auto). A + B cannot exceed 99%.</p>
                </ConfigPanel>

                <ConfigPanel title="Buffers">
                  <ConfigInlineRow label="Use buffers globally">
                    <ToggleSwitch
                      checked={v("buffer_enabled") === "true"}
                      disabled={!canEdit}
                      onChange={() =>
                        handleChange(
                          "buffer_enabled",
                          v("buffer_enabled") === "true" ? "false" : "true",
                          true,
                        )
                      }
                    />
                  </ConfigInlineRow>
                  {(["a", "b", "c"] as const).map((cls) => (
                    <ConfigInlineRow key={cls} label={`${cls.toUpperCase()}-class buffer`}>
                      <div className="flex items-center gap-2">
                        <ToggleSwitch
                          checked={v(`buffer_${cls}_enabled`) === "true"}
                          disabled={!canEdit || v("buffer_enabled") !== "true"}
                          onChange={() =>
                            handleChange(
                              `buffer_${cls}_enabled`,
                              v(`buffer_${cls}_enabled`) === "true" ? "false" : "true",
                              true,
                            )
                          }
                        />
                        <input
                          type="number"
                          min={0.01}
                          step={0.05}
                          value={v(`buffer_${cls}_multiplier`) || (cls === "a" ? "1.2" : cls === "b" ? "1.15" : "1.05")}
                          disabled={!canEdit || v("buffer_enabled") !== "true"}
                          onChange={(e) => handleChange(`buffer_${cls}_multiplier`, e.target.value)}
                          className={numberInputCls}
                        />
                        <span className="text-xs text-stone-500">×</span>
                      </div>
                    </ConfigInlineRow>
                  ))}
                </ConfigPanel>

                <ConfigPanel title="Method 1 — Historical Same Month">
                  <ConfigInlineRow
                    label="Years back"
                    description="Look at same month in past X years. Only years with sales data included."
                  >
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={v("stock_velocity_years_back") || "3"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("stock_velocity_years_back", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                </ConfigPanel>

                <ConfigPanel title="Method 2 — Seasonal Arc">
                  <ConfigInlineRow label="Use seasonal arc">
                    <ToggleSwitch
                      checked={v("stock_window_enabled") === "true"}
                      disabled={!canEdit}
                      onChange={() =>
                        handleChange(
                          "stock_window_enabled",
                          v("stock_window_enabled") === "true" ? "false" : "true",
                          true,
                        )
                      }
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Window size (months)">
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={v("stock_window_size") || "4"}
                      disabled={!canEdit || v("stock_window_enabled") !== "true"}
                      onChange={(e) => handleChange("stock_window_size", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Direction">
                    <select
                      value={v("stock_window_direction") || "backward"}
                      disabled={!canEdit || v("stock_window_enabled") !== "true"}
                      onChange={(e) => handleChange("stock_window_direction", e.target.value, true)}
                      className={selectCls}
                    >
                      <option value="backward">Backward</option>
                      <option value="forward">Forward</option>
                    </select>
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Use weighted months">
                    <ToggleSwitch
                      checked={v("stock_window_weight_enabled") === "true"}
                      disabled={!canEdit || v("stock_window_enabled") !== "true"}
                      onChange={() =>
                        handleChange(
                          "stock_window_weight_enabled",
                          v("stock_window_weight_enabled") === "true" ? "false" : "true",
                          true,
                        )
                      }
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Weight mode">
                    <select
                      value={v("stock_window_weight_mode") || "auto"}
                      disabled={
                        !canEdit ||
                        v("stock_window_enabled") !== "true" ||
                        v("stock_window_weight_enabled") !== "true"
                      }
                      onChange={(e) => handleChange("stock_window_weight_mode", e.target.value, true)}
                      className={selectCls}
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </ConfigInlineRow>
                  {v("stock_window_weight_mode") !== "manual" ? (
                    <ConfigInlineRow
                      label="Current month weight"
                      description={`Other months: ${velocityValidation.otherMonthWeight.toFixed(1)}% each (auto split)`}
                    >
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={v("stock_window_weight_current") || "50"}
                          disabled={
                            !canEdit ||
                            v("stock_window_enabled") !== "true" ||
                            v("stock_window_weight_enabled") !== "true"
                          }
                          onChange={(e) => handleChange("stock_window_weight_current", e.target.value)}
                          className={numberInputCls}
                        />
                        <span className="text-xs text-stone-500">%</span>
                      </div>
                    </ConfigInlineRow>
                  ) : (
                    <div className="space-y-2">
                      {Array.from({ length: parseInt(v("stock_window_size") || "4", 10) }, (_, i) => {
                        const dir = v("stock_window_direction") === "forward" ? 1 : -1;
                        const offset = i * dir;
                        let parsed: Record<string, number> = {};
                        try {
                          parsed = JSON.parse(v("stock_window_weights_manual") || "{}") as Record<
                            string,
                            number
                          >;
                        } catch {
                          parsed = {};
                        }
                        const label =
                          offset === 0
                            ? "Current month (0)"
                            : `${offset > 0 ? "+" : ""}${offset} month`;
                        return (
                          <ConfigInlineRow key={offset} label={label}>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={parsed[String(offset)] ?? ""}
                                disabled={
                                  !canEdit ||
                                  v("stock_window_enabled") !== "true" ||
                                  v("stock_window_weight_enabled") !== "true"
                                }
                                onChange={(e) => {
                                  const next = { ...parsed, [String(offset)]: Number(e.target.value) };
                                  handleChange("stock_window_weights_manual", JSON.stringify(next));
                                }}
                                className={numberInputCls}
                              />
                              <span className="text-xs text-stone-500">%</span>
                            </div>
                          </ConfigInlineRow>
                        );
                      })}
                      <p className="text-xs text-stone-500">Manual weights must sum to 100%.</p>
                    </div>
                  )}
                </ConfigPanel>

                <ConfigPanel title="Blending">
                  <ConfigInlineRow label="Method 1 weight">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={v("stock_method1_weight") || "50"}
                        disabled={!canEdit}
                        onChange={(e) => handleChange("stock_method1_weight", e.target.value)}
                        className={numberInputCls}
                      />
                      <span className="text-xs text-stone-500">%</span>
                    </div>
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Method 2 weight (auto)">
                    <span className="text-sm font-semibold text-stone-700">
                      {velocityValidation.m2Weight}%
                    </span>
                  </ConfigInlineRow>
                  <ConfigInlineRow
                    label="Gap warning"
                    description="If Method 1 and Method 2 differ by more than this % — flag for manual review."
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={v("stock_confidence_gap_warning") || "30"}
                        disabled={!canEdit}
                        onChange={(e) => handleChange("stock_confidence_gap_warning", e.target.value)}
                        className={numberInputCls}
                      />
                      <span className="text-xs text-stone-500">%</span>
                    </div>
                  </ConfigInlineRow>
                </ConfigPanel>

                <ConfigPanel title="CV Noise Filter">
                  <ConfigInlineRow
                    label="Trust threshold"
                    description="Below this = consistent data = trust growth fully."
                  >
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={v("stock_cv_trust_threshold") || "0.3"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("stock_cv_trust_threshold", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow
                    label="Dampen threshold"
                    description="Between trust and this = dampen growth 50%. Above = ignore growth."
                  >
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.05}
                      value={v("stock_cv_dampen_threshold") || "0.7"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("stock_cv_dampen_threshold", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                </ConfigPanel>

                <ConfigPanel title="Safety">
                  <ConfigInlineRow
                    label="Global minimum"
                    description="Absolute floor — no style ever goes below this."
                  >
                    <input
                      type="number"
                      min={0}
                      value={v("stock_global_minimum") || "1"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("stock_global_minimum", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                </ConfigPanel>

                <ConfigPanel title="Formula Preview">
                  <div className="space-y-1 text-xs text-stone-600">
                    <p>
                      S-class: Fixed minimum = {v("sclass_fixed_min_stock") || "1"} piece
                      {Number(v("sclass_fixed_min_stock") || "1") !== 1 ? "s" : ""}
                    </p>
                    <p>
                      A-class: Blend(M1 × {velocityValidation.m1Weight}%, M2 × {velocityValidation.m2Weight}%) ×{" "}
                      {v("buffer_a_multiplier") || "1.2"}
                    </p>
                    <p>
                      B-class: Blend(M1 × {velocityValidation.m1Weight}%, M2 × {velocityValidation.m2Weight}%) ×{" "}
                      {v("buffer_b_multiplier") || "1.15"}
                    </p>
                    <p>
                      C-class: Blend(M1 × {velocityValidation.m1Weight}%, M2 × {velocityValidation.m2Weight}%) ×{" "}
                      {v("buffer_c_multiplier") || "1.05"}
                    </p>
                    <p>Floor: MAX(result, {v("stock_global_minimum") || "1"} piece)</p>
                  </div>
                </ConfigPanel>

                <ConfigPanel title="Feedback Loop (Phase 2)">
                  <ConfigInlineRow
                    label="Track forecast accuracy"
                    description="Turn ON after 6+ months of data."
                  >
                    <ToggleSwitch
                      checked={v("stock_feedback_enabled") === "true"}
                      disabled={!canEdit}
                      onChange={() =>
                        handleChange(
                          "stock_feedback_enabled",
                          v("stock_feedback_enabled") === "true" ? "false" : "true",
                          true,
                        )
                      }
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Apply bias correction">
                    <ToggleSwitch
                      checked={v("stock_bias_correction_enabled") === "true"}
                      disabled={!canEdit}
                      onChange={() =>
                        handleChange(
                          "stock_bias_correction_enabled",
                          v("stock_bias_correction_enabled") === "true" ? "false" : "true",
                          true,
                        )
                      }
                    />
                  </ConfigInlineRow>
                  <ConfigInlineRow label="Bias window (months)">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={v("stock_bias_window_months") || "6"}
                      disabled={!canEdit}
                      onChange={(e) => handleChange("stock_bias_window_months", e.target.value)}
                      className={numberInputCls}
                    />
                  </ConfigInlineRow>
                  <p className="text-xs text-stone-500">
                    System will learn from its own prediction errors when enabled.
                  </p>
                </ConfigPanel>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-7">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">Recalculate all thresholds</p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {thresholdRecalcAt
                        ? `Last calculated: ${new Date(thresholdRecalcAt).toLocaleString()}`
                        : "Thresholds are computed when the stock replenishment report is loaded."}
                    </p>
                    {thresholdRecalcError ? (
                      <p className="mt-1 text-xs text-rose-600">{thresholdRecalcError}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={thresholdRecalculating}
                    onClick={() => void handleRecalculateThresholds()}
                    className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`size-4 ${thresholdRecalculating ? "animate-spin" : ""}`}
                      aria-hidden
                    />
                    {thresholdRecalculating ? "Calculating…" : "Recalculate All Thresholds"}
                  </button>
                </div>
              </>
            ) : null}

            {v("stock_threshold_mode") === "global" ? (
              <FieldRow
                label="Global minimum (pieces)"
                description="Applies to every evaluated style when mode is Same for all."
                saved={s("stock_threshold_global_value")}
              >
                <input
                  type="number"
                  min={0}
                  value={v("stock_threshold_global_value") || "5"}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("stock_threshold_global_value", e.target.value)}
                  className={numberInputCls}
                />
              </FieldRow>
            ) : null}

            {v("stock_threshold_mode") === "manual" ? (
              <div className="flex flex-col gap-3 border-b border-stone-100/80 px-5 py-3 sm:px-7">
                <div>
                  <p className="text-sm font-semibold text-stone-800">Per-style thresholds</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Current stock counts available pieces only (not sold, not on active memo).
                  </p>
                </div>
                <input
                  type="search"
                  placeholder="Search StyleNo…"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  className="max-w-md rounded-lg border border-stone-200/80 bg-white/90 px-3 py-1.5 text-sm text-stone-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40"
                />
                {manualLoading ? (
                  <p className="flex items-center gap-2 text-sm text-stone-500">
                    <RefreshCw className="size-4 animate-spin" aria-hidden />
                    Loading styles…
                  </p>
                ) : (
                  <div className="max-h-[min(420px,50vh)] overflow-auto rounded-xl border border-stone-200/80">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="sticky top-0 z-[1] bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        <tr>
                          <th className="border-b border-stone-200 px-3 py-2">Style No</th>
                          <th className="border-b border-stone-200 px-3 py-2 text-right">Current</th>
                          <th className="border-b border-stone-200 px-3 py-2 text-right">Min</th>
                          <th className="border-b border-stone-200 px-3 py-2 w-24"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(manualRows ?? [])
                          .filter((r) =>
                            r.styleNo.toLowerCase().includes(manualSearch.trim().toLowerCase()),
                          )
                          .map((r) => (
                            <tr key={r.styleNo} className="border-b border-stone-100">
                              <td className="px-3 py-2 font-mono text-[13px]">{r.styleNo}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{r.currentStock}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  value={draftMins[r.styleNo] ?? ""}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    setDraftMins((prev) => ({
                                      ...prev,
                                      [r.styleNo]: e.target.value,
                                    }))
                                  }
                                  className="w-20 rounded border border-stone-200 px-2 py-1 text-right text-sm"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  disabled={
                                    !canEdit ||
                                    savingStyle === r.styleNo ||
                                    Number.isNaN(parseInt(draftMins[r.styleNo] ?? "0", 10))
                                  }
                                  onClick={() => {
                                    const raw = draftMins[r.styleNo] ?? "0";
                                    void saveManualThreshold(
                                      r.styleNo,
                                      Math.max(0, parseInt(raw, 10) || 0),
                                    );
                                  }}
                                  className="rounded-lg bg-violet-600 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingStyle === r.styleNo ? "…" : "Save"}
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* ── Tab: System ── */}
        {activeTab === "system" && (
          <>
            <SectionHeader title="System" description="Core system behaviour settings." />
            <FieldRow
              label="OTP expiry"
              description="How long (in minutes) a one-time password remains valid."
              saved={s("otp_expiry_minutes")}
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={v("otp_expiry_minutes")}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("otp_expiry_minutes", e.target.value)}
                  className={numberInputCls}
                />
                <span className="text-xs text-stone-500">minutes</span>
              </div>
            </FieldRow>

            <FieldRow
              label="Close-to-expiry days"
              description="Default days before a memo end date to flag a client as close to expiry."
              saved={s("close_to_expiry_default_days")}
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={v("close_to_expiry_default_days")}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("close_to_expiry_default_days", e.target.value)}
                  className={numberInputCls}
                />
                <span className="text-xs text-stone-500">days</span>
              </div>
            </FieldRow>

            <FieldRow
              label="Temp password length"
              description="Length of auto-generated temporary passwords sent to new users."
              saved={s("temp_password_length")}
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={8}
                  max={32}
                  value={v("temp_password_length")}
                  disabled={!canEdit}
                  onChange={(e) => handleChange("temp_password_length", e.target.value)}
                  className={numberInputCls}
                />
                <span className="text-xs text-stone-500">chars</span>
              </div>
            </FieldRow>
          </>
        )}

        {/* ── Tab: ERP Sync ── */}
        {activeTab === "erp_sync" && (
          <>
            <SectionHeader
              title="ERP Sync"
              description="Configure automatic stock synchronization from the external ERP system."
            />
            <FieldRow
              label="Auto Sync"
              description="Automatically sync stock data from ERP system"
              saved={s("erp_sync_enabled")}
            >
              <button
                type="button"
                role="switch"
                aria-checked={v("erp_sync_enabled") === "true"}
                disabled={!canEdit}
                onClick={() =>
                  handleChange(
                    "erp_sync_enabled",
                    v("erp_sync_enabled") === "true" ? "false" : "true",
                    true,
                  )
                }
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 disabled:cursor-not-allowed disabled:opacity-50",
                  v("erp_sync_enabled") === "true" ? "bg-violet-600" : "bg-stone-300",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-block size-4 transform rounded-full bg-white shadow transition-transform duration-200",
                    v("erp_sync_enabled") === "true" ? "translate-x-6" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
            </FieldRow>

            {v("erp_sync_enabled") === "true" ? (
              <FieldRow
                label="Sync interval"
                description="How often to pull stock data from ERP when auto sync is enabled."
                saved={s("erp_sync_interval_minutes")}
              >
                <select
                  value={v("erp_sync_interval_minutes") || "30"}
                  disabled={!canEdit}
                  onChange={(e) =>
                    handleChange("erp_sync_interval_minutes", e.target.value, true)
                  }
                  className={selectCls}
                >
                  {ERP_SYNC_INTERVAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
            ) : null}

            <div className="border-b border-stone-100/80 px-5 py-3 sm:px-7">
              <p className="text-sm font-semibold text-stone-800">Last Stock Sync</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {erpSyncStatusLoading
                  ? "Loading sync status…"
                  : `Last Stock Sync: ${formatLastStockSync(erpSyncStatus?.lastStockSync)}`}
              </p>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100/80 px-5 py-3 sm:px-7">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-800">Manual sync</p>
                <p className="mt-0.5 text-xs text-stone-500">
                  Pull the latest stock data from ERP immediately.
                </p>
                {lastSyncResult ? (
                  <p className="mt-2 text-xs font-medium text-stone-700">
                    Last sync: {lastSyncResult.updated} updated, {lastSyncResult.inserted} new,{" "}
                    {lastSyncResult.errors.length} errors
                  </p>
                ) : null}
                {erpManualSyncError ? (
                  <p className="mt-1 text-xs text-rose-600">{erpManualSyncError}</p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={erpManualSyncing}
                onClick={() => void handleManualStockSync()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw
                  className={`size-4 ${erpManualSyncing ? "animate-spin" : ""}`}
                  aria-hidden
                />
                {erpManualSyncing ? "Syncing…" : "Sync Stock Now"}
              </button>
            </div>

            <div className="px-5 py-3 sm:px-7">
              <p className="text-xs italic text-stone-500">
                Sales sync — coming soon (awaiting PARTY_CODE field from API team)
              </p>
            </div>
          </>
        )}
      </div>

      {!canEdit && (
        <p className="text-sm font-medium text-amber-700">
          You have view-only access — settings cannot be modified.
        </p>
      )}
    </div>
  );
}
