"use client";

import { useMemo, useState } from "react";
import type {
  DashboardDataState,
  DashboardSliceKey,
} from "@/components/dashboard/useDashboardData";
import { isSliceLoading } from "@/components/dashboard/useDashboardData";
import { useTopClients } from "@/components/dashboard/useTopClients";
import { useTopStyles } from "@/components/dashboard/useTopStyles";
import { formatCompactUsd, formatRelativeTime, formatTrend } from "@/components/dashboard/dashboard-format";
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Package,
  UserPlus,
  RefreshCw,
  ShoppingBag,
  RotateCcw,
  MoreHorizontal,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CHART_TOOLTIP = {
  borderRadius: 12,
  border: "1px solid #ECEAE4",
  background: "white",
  boxShadow: "0 8px 24px -12px rgba(20,20,18,0.12)",
  fontSize: 12,
  fontWeight: 500,
} as const;

type DashboardCardProps = {
  className?: string;
  dashboard?: DashboardDataState;
};

const CHART_COLORS = ["#0a0a0a", "#16a34a", "#d4d4d0", "#a3a39b", "#f59e0b", "#3b82f6"] as const;

function ChartLoading({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[120px] items-center justify-center text-sm text-muted-foreground", className)}>
      Loading…
    </div>
  );
}

function ChartEmpty({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-[120px] items-center justify-center px-4 text-center text-sm text-muted-foreground", className)}>
      No data yet — upload sales, stock, or memos.
    </div>
  );
}

function ChartSliceBody({
  dashboard,
  slice,
  isEmpty,
  className,
  children,
}: {
  dashboard?: DashboardDataState;
  slice: DashboardSliceKey;
  isEmpty: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const err = dashboard?.sliceErrors[slice];
  if (isSliceLoading(dashboard, slice)) {
    return <ChartLoading className={className} />;
  }
  if (err) {
    return (
      <div className={cn("flex min-h-[120px] items-center justify-center px-4 text-center text-sm text-red-600", className)}>
        {err}
      </div>
    );
  }
  if (isEmpty) return <ChartEmpty className={className} />;
  return <>{children}</>;
}

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("surface-card overflow-hidden p-4 lg:p-5", className)}>{children}</div>
);

const SectionLabel = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="mb-4 flex items-center justify-between">
    <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{children}</h3>
    {action}
  </div>
);

const RangePill = ({ label = "Last month" }: { label?: string }) => (
  <button
    type="button"
    className="inline-flex h-7 items-center gap-1.5 rounded-full bg-secondary px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
  >
    {label}
    <ChevronDown className="size-3" />
  </button>
);

export const Delta = ({ value, positive }: { value: string; positive: boolean }) => (
  <span
    className={cn(
      "inline-flex items-center gap-0.5 text-[11px] font-semibold",
      positive ? "text-emerald-600" : "text-red-500",
    )}
  >
    {positive ? (
      <ArrowUpRight className="size-3" strokeWidth={2.5} />
    ) : (
      <ArrowDownRight className="size-3" strokeWidth={2.5} />
    )}
    {value}
  </span>
);

export function KpiBubbles({ className, dashboard }: DashboardCardProps = {}) {
  const m = dashboard?.metrics;
  const yoy = formatTrend(m?.trendYoY ?? null);
  const period = formatTrend(m?.trendPeriod ?? null);
  const profitTrend = formatTrend(m?.trendProfitPeriod ?? null);
  const margin =
    m?.marginPercentPeriod != null ? `${m.marginPercentPeriod.toFixed(1)}% margin` : "Margin n/a";

  const kpis = m
    ? [
        {
          label: "Total Sales",
          value: formatCompactUsd(m.totalSalesYear),
          delta: yoy.text,
          sub: "YTD vs prior year",
          positive: yoy.positive,
          icon: TrendingUp,
        },
        {
          label: "Net Profit",
          value: formatCompactUsd(m.netProfitYear),
          delta: profitTrend.text,
          sub: margin,
          positive: profitTrend.positive,
          icon: TrendingUp,
        },
        {
          label: "This Month",
          value: formatCompactUsd(m.totalSalesPeriod),
          delta: period.text,
          sub: period.positive ? "Above prior month" : "Below prior month",
          positive: period.positive,
          icon: period.positive ? TrendingUp : TrendingDown,
        },
        {
          label: "Active Memos",
          value: String(m.activeMemoLines),
          delta: m.expiringSoonMemos > 0 ? `+${m.expiringSoonMemos}` : "—",
          sub: `${m.overdueMemos} overdue`,
          positive: m.overdueMemos === 0,
          icon: Package,
        },
      ]
    : [];

  return (
    <Card className={className}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Overview</h3>
        <RangePill label="This month" />
      </div>
      <ChartSliceBody dashboard={dashboard} slice="metrics" isEmpty={!m}>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div
                key={k.label}
                className="animate-float-up rounded-2xl bg-secondary/45 p-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <Icon className="size-3.5" strokeWidth={2.2} />
                    <span className="truncate">{k.label}</span>
                  </div>
                  <Delta value={k.delta} positive={k.positive} />
                </div>
                <div className="text-[24px] leading-none font-bold tracking-tight tabular-nums text-foreground">
                  {k.value}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{k.sub}</div>
              </div>
            );
          })}
        </div>
      </ChartSliceBody>
    </Card>
  );
}

function linePoints(
  data: Array<{ actual: number; forecast: number | null }>,
  key: "actual" | "forecast",
): string {
  if (data.length < 2) return "";
  const values = data.map((d) => (key === "actual" ? d.actual : d.forecast ?? 0));
  const min = Math.min(...values) * 0.9;
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  return data
    .map((d, i) => {
      const x = 18 + (i / (data.length - 1)) * 784;
      const v = key === "actual" ? d.actual : d.forecast ?? 0;
      const y = 160 - ((v - min) / span) * 122;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function RevenueClay({ className, dashboard }: DashboardCardProps = {}) {
  const [range, setRange] = useState<"12M" | "6M" | "3M">("12M");
  const salesData = useMemo(() => {
    const rows = dashboard?.monthlySales ?? [];
    return rows.map((r) => ({
      m: r.month,
      actual: r.value,
      forecast: r.forecast,
    }));
  }, [dashboard?.monthlySales]);

  const sliced =
    range === "12M" ? salesData : range === "6M" ? salesData.slice(-6) : salesData.slice(-3);
  const heroPoints = linePoints(sliced, "actual");
  const heroForecastPoints = linePoints(sliced, "forecast");
  const heroFill = heroPoints ? `18,170 ${heroPoints} 802,170` : "";
  const peak =
    sliced.length > 0
      ? sliced.reduce((a, b) => (b.actual > a.actual ? b : a), sliced[0])
      : { m: "—", actual: 0 };
  const totalActual = sliced.reduce((s, d) => s + d.actual, 0);
  const trend = formatTrend(
    isSliceLoading(dashboard, "metrics") ? null : (dashboard?.metrics?.trendPeriod ?? null),
  );

  return (
    <Card className={cn("flex min-h-[280px] min-w-0 flex-col", className)}>
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            Product view
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[42px] leading-none font-bold tracking-tight tabular-nums text-foreground">
              {formatCompactUsd(totalActual)}
            </span>
            <Delta value={trend.text} positive={trend.positive} />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Actual sales vs trailing 3-month average (computed forecast).
          </p>
        </div>
        <div className="flex gap-0.5 rounded-full bg-secondary p-0.5">
          {(["3M", "6M", "12M"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                "h-7 rounded-full px-3 text-[11px] font-semibold transition-all",
                range === r
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-1 mt-3 min-h-[280px] min-w-0 flex-1 overflow-hidden">
        <ChartSliceBody
          dashboard={dashboard}
          slice="monthlySales"
          isEmpty={sliced.length < 2}
          className="min-h-[280px]"
        >
        <svg
          viewBox="0 0 820 190"
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Revenue trend chart"
        >
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[44, 86, 128, 170].map((y) => (
            <line
              key={y}
              x1="18"
              x2="802"
              y1={y}
              y2={y}
              stroke="#ECEAE4"
              strokeWidth="1"
              strokeDasharray="4 5"
            />
          ))}
          <polygon
            points={heroFill}
            fill="url(#actualGrad)"
            className="animate-fade-rise"
            style={{ animationDelay: "300ms" }}
          />
          <polyline
            points={heroForecastPoints}
            fill="none"
            stroke="#a3a39b"
            strokeWidth="2"
            strokeDasharray="5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-fade-rise"
            style={{ animationDelay: "200ms" }}
          />
          <polyline
            points={heroPoints}
            fill="none"
            stroke="#16a34a"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="animate-draw"
          />
          {sliced.map((d, i) => {
            const values = sliced.map((x) => x.actual);
            const min = Math.min(...values) * 0.9;
            const max = Math.max(...values, 1);
            const span = max - min || 1;
            const x = 18 + (i / (sliced.length - 1)) * 784;
            const y = 160 - ((d.actual - min) / span) * 122;
            return (
              <circle
                key={d.m}
                cx={x}
                cy={y}
                r={i === sliced.length - 1 ? 5 : 3.5}
                fill="#16a34a"
                stroke="white"
                strokeWidth="2"
                className="animate-pop-in"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            );
          })}
          {sliced.map(
            (d, i) =>
              i % 2 === 0 && (
                <text
                  key={d.m}
                  x={18 + (i / (sliced.length - 1)) * 784}
                  y="188"
                  textAnchor="middle"
                  fill="#8f8c84"
                  fontSize="11"
                  fontWeight="600"
                >
                  {d.m}
                </text>
              ),
          )}
        </svg>
        </ChartSliceBody>
      </div>

      <div className="mt-3 flex items-center gap-5 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-600" /> Actual
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-neutral-400" /> Forecast (3-mo avg)
        </span>
        <span className="ml-auto tabular-nums">
          Peak · {peak.m} · {formatCompactUsd(peak.actual)}
        </span>
      </div>
    </Card>
  );
}

export function CategoryComposition({ className, dashboard }: DashboardCardProps = {}) {
  const [mode, setMode] = useState<"stack" | "group">("stack");
  const comp = dashboard?.categoryComposition;
  const categories = comp?.categories ?? [];
  const composition =
    comp?.rows.map((r) => ({
      m: r.month,
      ...Object.fromEntries(categories.map((c) => [c, Number(r[c]) || 0])),
    })) ?? [];

  return (
    <Card className={cn("min-w-0", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
          Product type mix · 12 months
        </h3>
        <div className="flex gap-0.5 rounded-full bg-secondary p-0.5">
          {(["stack", "group"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setMode(r)}
              className={cn(
                "h-7 rounded-full px-3 text-[11px] font-semibold capitalize transition-all",
                mode === r
                  ? "bg-card text-foreground shadow-card"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-2 h-[240px] min-w-0 overflow-hidden">
        <ChartSliceBody
          dashboard={dashboard}
          slice="categoryComposition"
          isEmpty={composition.length === 0}
          className="h-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={composition}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              barCategoryGap={mode === "stack" ? "22%" : "14%"}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#ECEAE4" vertical={false} />
              <XAxis
                dataKey="m"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9a9a93", fontWeight: 500 }}
                dy={8}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "#9a9a93" }}
                width={36}
              />
              <Tooltip cursor={{ fill: "#F5F4F0", radius: 8 }} contentStyle={CHART_TOOLTIP} />
              {categories.map((cat, i) => (
                <Bar
                  key={cat}
                  isAnimationActive
                  animationDuration={700}
                  animationBegin={i * 150}
                  animationEasing="ease-out"
                  dataKey={cat}
                  stackId={mode === "stack" ? "a" : undefined}
                  fill={CHART_COLORS[i % CHART_COLORS.length]}
                  radius={i === categories.length - 1 && mode === "stack" ? [6, 6, 0, 0] : [6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartSliceBody>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-5 text-[11px] font-medium text-muted-foreground">
        {categories.map((cat, i) => (
          <span key={cat} className="inline-flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            {cat}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function SalesVsForecast({ className, dashboard }: DashboardCardProps = {}) {
  const radarData = useMemo(() => {
    const rows = dashboard?.salesByCategory ?? [];
    const max = Math.max(...rows.map((r) => r.actual), 1);
    return rows.map((r) => ({
      cat: r.category,
      actual: Math.round((r.actual / max) * 100),
      forecast: r.forecast != null ? Math.round((r.forecast / max) * 100) : 0,
    }));
  }, [dashboard?.salesByCategory]);

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel>Sales vs prior period</SectionLabel>
      <div className="-mx-2 h-[240px] min-w-0 overflow-hidden">
        <ChartSliceBody
          dashboard={dashboard}
          slice="salesByCategory"
          isEmpty={radarData.length === 0}
          className="h-full"
        >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="78%">
            <PolarGrid stroke="#ECEAE4" />
            <PolarAngleAxis
              dataKey="cat"
              tick={{ fontSize: 10, fill: "#52524a", fontWeight: 600 }}
            />
            <Tooltip contentStyle={CHART_TOOLTIP} />
            <Radar
              name="Prior period"
              dataKey="forecast"
              stroke="#a3a39b"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              fill="#a3a39b"
              fillOpacity={0.08}
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-out"
            />
            <Radar
              name="Actual"
              dataKey="actual"
              stroke="#16a34a"
              strokeWidth={2}
              fill="#16a34a"
              fillOpacity={0.18}
              isAnimationActive
              animationDuration={800}
              animationEasing="ease-out"
            />
          </RadarChart>
        </ResponsiveContainer>
        </ChartSliceBody>
      </div>
      <div className="flex items-center gap-4 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-600" /> This period
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-neutral-400" /> Prior period
        </span>
      </div>
    </Card>
  );
}

const MEMO_COLORS: Record<string, string> = {
  Active: "#0a0a0a",
  Returning: "#16a34a",
  Expiring: "#f59e0b",
  Overdue: "#ef4444",
};

export function MemoStatus({ className, dashboard }: DashboardCardProps = {}) {
  const memoData =
    dashboard?.memoStatus?.slices.map((s) => ({
      name: s.name,
      value: s.value,
      fill: MEMO_COLORS[s.name] ?? "#a3a39b",
    })) ?? [];
  const total = dashboard?.memoStatus?.total ?? 0;

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel>Memo status</SectionLabel>
      <ChartSliceBody
        dashboard={dashboard}
        slice="memoStatus"
        isEmpty={memoData.length === 0 || total === 0}
      >
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-[160px] w-[160px] shrink-0 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={memoData}
                dataKey="value"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={3}
                cornerRadius={4}
                stroke="none"
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {memoData.map((m, i) => (
                  <Cell key={i} fill={m.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[24px] leading-none font-bold tabular-nums text-foreground">{total}</span>
            <span className="mt-1 text-[10px] tracking-wider text-muted-foreground uppercase">
              Total
            </span>
          </div>
        </div>

        <div className="w-full space-y-1">
          {memoData.map((m) => (
            <div
              key={m.name}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-secondary"
            >
              <span className="size-2 rounded-full" style={{ background: m.fill }} />
              <span className="flex-1 truncate text-[12px] font-medium text-foreground">{m.name}</span>
              <span className="text-[12px] font-semibold tabular-nums text-foreground">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
      </ChartSliceBody>
    </Card>
  );
}

export function TopClientsClay({ className }: DashboardCardProps = {}) {
  const { tab, setTab, rows, isLoading, error } = useTopClients(6);
  const maxRev = Math.max(...rows.map((c) => c.saleValue), 1);

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel
        action={
          <div className="flex gap-0.5 rounded-full bg-secondary p-0.5">
            {(
              [
                { id: "month" as const, label: "This month" },
                { id: "last_3_months" as const, label: "Last 3 mo" },
                { id: "all_time" as const, label: "Overall" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setTab(r.id)}
                className={cn(
                  "h-7 rounded-full px-2.5 text-[10px] font-semibold transition-all sm:px-3 sm:text-[11px]",
                  tab === r.id
                    ? "bg-card text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        Top clients
      </SectionLabel>
      {isLoading ? (
        <ChartLoading />
      ) : error ? (
        <div className="flex min-h-[120px] items-center justify-center px-4 text-center text-sm text-red-600">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <ChartEmpty />
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {rows.map((c, i) => {
            const w = (c.saleValue / maxRev) * 100;
            const growth = formatTrend(c.growthPercent);
            const initials = c.partyName
              .split(" ")
              .filter((s) => s[0] && /[A-Z]/.test(s[0]))
              .slice(0, 2)
              .map((s) => s[0])
              .join("");
            const tier =
              c.overallRank != null
                ? `Rank #${c.overallRank} · ${c.quantity} lines`
                : `${c.quantity} line${c.quantity === 1 ? "" : "s"}`;
            return (
              <div
                key={`${tab}-${c.partyName}`}
                className="group flex cursor-pointer items-center gap-3 rounded-xl p-2 transition hover:bg-secondary"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                  {initials || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-foreground">{c.partyName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{tier}</div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full animate-grow-width rounded-full bg-foreground"
                      style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-foreground">
                    {formatCompactUsd(c.saleValue)}
                  </div>
                  {c.growthPercent != null ? (
                    <Delta value={growth.text} positive={growth.positive} />
                  ) : (
                    <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">All time</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

const STYLE_TONES = ["bg-foreground", "bg-amber-500", "bg-emerald-600", "bg-neutral-400", "bg-red-500"];

export function TopSellingStyles({ className }: DashboardCardProps = {}) {
  const { tab, setTab, rows, isLoading, error } = useTopStyles(5);

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel
        action={
          <div className="flex gap-0.5 rounded-full bg-secondary p-0.5">
            {(
              [
                { id: "year" as const, label: "This year" },
                { id: "all_time" as const, label: "All time" },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setTab(r.id)}
                className={cn(
                  "h-7 rounded-full px-3 text-[11px] font-semibold transition-all",
                  tab === r.id
                    ? "bg-card text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        Top styles
      </SectionLabel>
      {isLoading ? (
        <ChartLoading />
      ) : error ? (
        <div className="flex min-h-[120px] items-center justify-center px-4 text-center text-sm text-red-600">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <ChartEmpty />
      ) : (
      <div className="space-y-1">
        {rows.map((s, i) => {
          const active = s.inStock;
          const subtitle = [s.productType, s.metal].filter(Boolean).join(" · ") || s.styleNo;
          const label = s.productDescription?.trim() || s.styleNo;
          return (
            <div
              key={s.styleNo}
              className="group flex cursor-pointer items-center gap-3 rounded-xl p-2 transition hover:bg-secondary"
            >
              <div className="size-11 shrink-0 rounded-full bg-secondary p-1.5">
                <div className={cn("h-full w-full rounded-full opacity-90", STYLE_TONES[i % STYLE_TONES.length])} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-foreground">{label}</div>
                <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-semibold tabular-nums text-foreground">
                  {formatCompactUsd(s.saleValue)}
                </div>
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium",
                    active ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      active ? "bg-emerald-500" : "bg-neutral-400",
                    )}
                  />
                  {active ? "In stock" : "No stock"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      )}
      <button
        type="button"
        className="mt-3 h-9 w-full rounded-full border border-border text-[12px] font-semibold text-foreground transition-colors hover:bg-secondary"
      >
        All products
      </button>
    </Card>
  );
}

export function RestockClay({ className, dashboard }: DashboardCardProps = {}) {
  const restock = dashboard?.restock?.items ?? [];
  const totalAlerts = dashboard?.restock?.totalAlerts ?? 0;

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel
        action={
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
            <span className="size-1.5 rounded-full bg-red-500" />
            {totalAlerts} items
          </span>
        }
      >
        Restock watchlist
      </SectionLabel>
      <ChartSliceBody dashboard={dashboard} slice="restock" isEmpty={restock.length === 0}>
      <div className="space-y-1">
        {restock.map((r) => {
          const ratio = r.minThreshold > 0 ? r.currentStock / r.minThreshold : 0;
          const tone =
            r.severity === "critical"
              ? { dot: "bg-red-500", text: "text-red-600", bar: "bg-red-500" }
              : { dot: "bg-amber-500", text: "text-amber-600", bar: "bg-amber-500" };
          return (
            <div
              key={r.styleNo}
              className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition hover:bg-secondary"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Package className="size-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-semibold text-foreground">
                    {r.productDescription}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{r.styleNo}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn("h-full animate-grow-width rounded-full", tone.bar)}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              </div>
              <div className="w-16 shrink-0 text-right">
                <div className="text-[13px] font-semibold tabular-nums text-foreground">
                  {r.currentStock}
                  <span className="text-muted-foreground">/{r.minThreshold}</span>
                </div>
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold",
                    tone.text,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", tone.dot)} />
                  {r.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      </ChartSliceBody>
    </Card>
  );
}

const ACTIVITY_ICONS: Record<string, typeof Package> = {
  Replenishment: ShoppingBag,
  Pullback: RotateCcw,
  Sync: RefreshCw,
  Client: UserPlus,
};

export function ActivitySummary({ className, dashboard }: DashboardCardProps = {}) {
  const a = dashboard?.activityToday;
  const trend = formatTrend(
    isSliceLoading(dashboard, "metrics") ? null : (dashboard?.metrics?.trendPeriod ?? null),
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.25rem] border border-primary bg-primary p-5 text-primary-foreground shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold tracking-wider text-primary-foreground/60 uppercase">
            Today
          </div>
          <div className="mt-2 text-[34px] leading-none font-bold tracking-tight tabular-nums">
            {isSliceLoading(dashboard, "activityToday") ? "…" : (a?.replenishmentCount ?? 0)}
          </div>
          <div className="mt-2 text-[12px] text-primary-foreground/60">
            Confirmed replenishments today
          </div>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-primary-foreground px-3 text-[11px] font-bold text-primary">
          {trend.text}
        </span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          ["Replenish", String(a?.replenishmentCount ?? 0)],
          ["Items", String(a?.itemCount ?? 0)],
          ["Risk", String(a?.riskCount ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-primary-foreground/10 px-3 py-2">
            <div className="text-[18px] font-bold tabular-nums">
              {isSliceLoading(dashboard, "activityToday") ? "—" : value}
            </div>
            <div className="text-[10px] font-semibold tracking-wider text-primary-foreground/55 uppercase">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LivePulse({ className, dashboard }: DashboardCardProps = {}) {
  const events = dashboard?.recentActivity ?? [];

  return (
    <Card className={cn("min-w-0", className)}>
      <SectionLabel
        action={
          <button type="button" className="text-muted-foreground hover:text-foreground">
            <MoreHorizontal className="size-4" />
          </button>
        }
      >
        Activity
      </SectionLabel>
      <ChartSliceBody dashboard={dashboard} slice="recentActivity" isEmpty={events.length === 0}>
      <div className="space-y-1">
        {events.map((p) => {
          const Icon = ACTIVITY_ICONS[p.tag] ?? Package;
          return (
            <div
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl p-2 transition hover:bg-secondary"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Icon className="size-4" strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-foreground">{p.tag}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelativeTime(p.at)} ago
                  </span>
                </div>
                <div className="text-[12px] leading-snug text-muted-foreground">{p.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      </ChartSliceBody>
    </Card>
  );
}
