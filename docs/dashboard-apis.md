# Dashboard APIs

Reference for dashboard chart data: what exists, what was added, and what remains static or incomplete.

**Auth:** All `/api/dashboard/*` routes require `dashboard.view` or `replenishment.view`.

**UI:** `components/dashboard/DashboardPage.tsx` loads data via `useDashboardData()` and passes it into `Bento.tsx` widgets.

---

## APIs used (pre-existing)

| Endpoint | Widget(s) | Notes |
|----------|-----------|--------|
| `GET /api/dashboard/metrics?period=week\|month\|year` | KpiBubbles, RevenueClay (trend) | **Extended** — now includes profit, margin, memo counts |
| `GET /api/dashboard/monthly-sales?mode=current_year\|last_12_months` | RevenueClay | **Extended** — each row includes computed `forecast` (3-month trailing avg) |
| `GET /api/dashboard/top-clients?period=month\|last_3_months\|all_time&limit=` | TopClientsClay | **Sales** by period (tabs); optional `OverallRank` in subtitle |
| `GET /api/dashboard/top-styles?period=year\|all_time&limit=` | TopSellingStyles | **YTD** or **all-time** (tabs); stock join for labels |
| `GET /api/dashboard/expiring-memos` | *(not wired in Bento yet)* | List + counts; memo pie uses `memo-status` instead |

---

## APIs created (this pass)

| Endpoint | Widget | Data source |
|----------|--------|-------------|
| `GET /api/dashboard/category-composition?mode=&top=` | CategoryComposition | `sales` by `ProductType` per month (top N + Other) |
| `GET /api/dashboard/sales-by-category?period=` | SalesVsForecast | `sales` grouped by `ProductType`; “forecast” arm = **prior period** (normalized) |
| `GET /api/dashboard/memo-status` | MemoStatus | `memo_stock` (active/returned) + `memo` (expiring/overdue) |
| `GET /api/dashboard/restock-watchlist?limit=` | RestockClay | `getStockReplenishmentReport()` — same logic as `/api/stock/replenishment` |
| `GET /api/dashboard/activity-today` | ActivitySummary | `replenishments`, `replenishment_items`, memos, critical stock count |
| `GET /api/dashboard/recent-activity?limit=` | LivePulse | Union: status log, pullbacks, excel imports, new clients |

**Shared helper:** `lib/dashboard-route.ts` → `requireDashboardApi()`

**Query logic:** `lib/dashboard.ts`

---

## Widget status

| Widget | Status | API |
|--------|--------|-----|
| RevenueClay | **Live** — actuals + computed forecast | `monthly-sales`, `metrics` |
| KpiBubbles | **Live** | `metrics` |
| CategoryComposition | **Live** — real `ProductType` (not Bridal/Diamond/Gold) | `category-composition` |
| TopClientsClay | **Live** — sales tabs: month / last 3 mo / overall | `top-clients?period=` (own hook) |
| RestockClay | **Live** | `restock-watchlist` |
| SalesVsForecast | **Live** — prior period vs current (not stored forecast) | `sales-by-category` |
| TopSellingStyles | **Live** — tabs: This year (YTD), All time | `top-styles?period=year\|all_time` (lazy, own hook) |
| MemoStatus | **Live** | `memo-status` |
| ActivitySummary | **Live** — replenishment counts (not dollar pipeline) | `activity-today`, `metrics` |
| LivePulse | **Live** | `recent-activity` |

---

## Pending / static / incomplete

| Item | Why |
|------|-----|
| **Stored revenue forecast** | No table for expected monthly sales; UI uses 3-month trailing average only |
| **Bridal / Diamond / Gold labels** | Not in DB; chart uses `ProductType` (+ Other). Add `system_config` mapping to relabel if needed |
| **Radar “true” forecast** | Second series is prior-period sales, not a forecast model |
| **ActivitySummary dollar hero** | No replenishment $ in DB; card shows **count** of replenishments today |
| **TopClients “Maison · Paris” tier** | No tier field on `clients`; shows rank or line count |
| **Range pills (Last month)** | Decorative — data loads with fixed `period=month` / `current_year` |
| **“View all” / “All products” buttons** | No navigation wired |
| **`expiring-memos` in UI** | API exists; list widget not on dashboard (counts folded into memo-status + activity risk) |
| **Empty state** | Upload sales, stock, and/or memos to populate charts |

---

## Response shapes (quick)

### `GET /api/dashboard/metrics?period=month`

```json
{
  "totalSalesYear": 0,
  "totalSalesPeriod": 0,
  "totalSalesWeek": 0,
  "netProfitYear": 0,
  "netProfitPeriod": 0,
  "marginPercentYear": null,
  "marginPercentPeriod": null,
  "activeMemoLines": 0,
  "overdueMemos": 0,
  "expiringSoonMemos": 0,
  "trendYoY": null,
  "trendPeriod": null,
  "trendWeek": null,
  "trendProfitYoY": null,
  "trendProfitPeriod": null
}
```

### `GET /api/dashboard/memo-status`

```json
{
  "slices": [
    { "name": "Active", "value": 0 },
    { "name": "Returning", "value": 0 },
    { "name": "Expiring", "value": 0 },
    { "name": "Overdue", "value": 0 }
  ],
  "total": 0
}
```

### `GET /api/dashboard/restock-watchlist?limit=5`

```json
{
  "items": [
    {
      "styleNo": "",
      "productDescription": "",
      "currentStock": 0,
      "minThreshold": 0,
      "severity": "critical",
      "status": "Critical"
    }
  ],
  "totalAlerts": 0,
  "criticalCount": 0
}
```

---

## Related (non-dashboard path)

| Endpoint | Use |
|----------|-----|
| `GET /api/stock/replenishment` | Full stock replenishment report (same engine as watchlist) |

---

## Definitions (for SQL alignment)

| Term | Rule in code |
|------|----------------|
| Net profit | `SUM(SaleValue - CRAmount)` on `sales` |
| Active memo lines | `memo_stock` where `Status = 'active'` |
| Overdue memos | `memo` where `IsActive` and `MemoEndDate < today` |
| Expiring memos | `memo` where `IsActive` and `MemoEndDate` within 30 days |
| Forecast (revenue chart) | Trailing 3-month average of prior actuals (computed) |
| Radar “forecast” | Prior period `ProductType` totals, normalized to 0–100 |
