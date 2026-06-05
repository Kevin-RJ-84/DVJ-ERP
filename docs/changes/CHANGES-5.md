# CHANGES-5.md — Dashboard + Stock Replenishment + Rename + Cleanup

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order: Part 0 → Part 1 → Part 2 → Part 3.
Do NOT touch any existing business logic, API routes, or lib files unless explicitly mentioned.

---

# PART 0 — Rename + File Cleanup

## 0.1 Rename Current Replenishment to Client Replenishment

Rename these files:
```
app/(dashboard)/page.tsx
→ app/(dashboard)/client-replenishment/page.tsx

app/(dashboard)/replenishment/page.tsx  
→ merge into client-replenishment if duplicate
```

Update sidebar nav:
- Label: "Replenishment" → "Client Replenishment"
- Route: /client-replenishment

Update all internal links, usePathname checks, and breadcrumbs referencing old route.

## 0.2 Codebase Scan — Identify Files to Remove

Scan entire codebase and identify:
1. Unused files — components, pages, lib files never imported anywhere
2. Duplicate functionality — two files doing the same thing
3. Files not following Next.js 16 App Router conventions
4. Leftover V1 replenishment files
5. Test files or mock files in wrong locations
6. Empty files or files with only comments
7. Files Wrongly Name or Wrongly Named Hirerachy

Output a complete list with:
- File path
- Reason for removal
- Safe to delete? (yes/no)

DO NOT delete anything yet — report only. Wait for confirmation before proceeding.

## 0.3 After Confirmation — Delete Approved Files

Only delete files explicitly approved after reviewing the report.
After deletion: verify build still passes with `npm run build`.

---

# PART 1 — Stock Replenishment

## 1.1 New System Config Keys

Add to `prisma/seed.ts` (upsert — safe to re-run):

```typescript
{ ConfigKey: 'stock_threshold_mode', ConfigValue: 'manual', ConfigType: 'enum', Description: 'manual | velocity | global', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_threshold_global_value', ConfigValue: '5', ConfigType: 'integer', Description: 'Global minimum stock for all StyleNos when mode=global', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_velocity_buffer_months', ConfigValue: '3', ConfigType: 'integer', Description: 'Buffer months for velocity calculation', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_velocity_history_months', ConfigValue: '6', ConfigType: 'integer', Description: 'Months of sales history window for velocity', Module: 'stock_replenishment' },
```

## 1.2 New DB Table — stock_thresholds

```prisma
model stock_thresholds {
  ThresholdID   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  StyleNo       String   @unique @db.VarChar
  MinQuantity   Int
  CreatedAt     DateTime @default(now()) @db.Timestamp(6)
  UpdatedAt     DateTime @default(now()) @db.Timestamp(6)
  UpdatedByID   String?  @db.Uuid

  @@map("stock_thresholds")
}
```

Run migration after adding.

## 1.3 Stock Replenishment Calculation Logic

```
ThresholdMode = system_config['stock_threshold_mode']

IF mode = 'manual':
  MinQty = stock_thresholds.MinQuantity WHERE StyleNo = X (0 if not set)

IF mode = 'global':
  MinQty = system_config['stock_threshold_global_value'] for ALL StyleNos

IF mode = 'velocity':
  HistoryMonths = system_config['stock_velocity_history_months']
  BufferMonths  = system_config['stock_velocity_buffer_months']
  AvgMonthlySales = COUNT(sales WHERE StyleNo = X AND InvoiceDate >= NOW() - HistoryMonths) / HistoryMonths
  MinQty = CEIL(AvgMonthlySales × BufferMonths)

CurrentStock =
  COUNT stock WHERE StyleNo = X
  AND HoldDate IS NULL
  AND StockNo NOT IN (SELECT StockNo FROM sales)
  AND StockNo NOT IN (SELECT StockNo FROM memo_stock JOIN memo ON IsActive = TRUE)

Alert = CurrentStock < MinQty
Shortage = MAX(0, MinQty - CurrentStock)
Severity = CurrentStock < (MinQty * 0.5) ? 'critical' : 'warning'
```

## 1.4 New API Routes

### GET /api/stock-replenishment
```typescript
// Permission: replenishment.view
// Returns all StyleNos with stock below threshold

Response: {
  mode: 'manual' | 'velocity' | 'global',
  config: { bufferMonths?, historyMonths?, globalValue? },
  items: [{
    styleNo: string,
    productDescription: string,
    currentStock: number,
    minThreshold: number,
    shortage: number,
    percentageOfMin: number,
    severity: 'critical' | 'warning',
    stockItems: [{ stockNo, productDescription, location, boxCode }]
  }],
  totalAlerts: number,
  criticalCount: number,
  warningCount: number
}
```

### POST /api/stock-replenishment/thresholds
```typescript
// Body: { styleNo: string, minQuantity: number }
// Permission: settings.edit
// Upserts into stock_thresholds table
```

## 1.5 Update Settings Screen — New Tab

Add Tab 5 "Stock Replenishment" to `SystemSettingsPage.tsx`:

```
Threshold Mode dropdown: Manual | Velocity | Same for all

── When Manual ──
  Table: StyleNo | Current Stock | Min Threshold (editable input) | Save button
  Search box to find StyleNo
  
── When Velocity ──
  Sales History Window: dropdown (3mo / 6mo / 12mo / 24mo)
  Buffer Months: dropdown (1mo / 2mo / 3mo / 6mo)
  Formula preview: "Min Stock = Avg monthly sales × buffer months"
  
── When Same for all ──
  Global Minimum: number input (pieces — applies to every StyleNo)
```

## 1.6 New Screen — /stock-replenishment

**Route:** `/stock-replenishment`
**Permission:** `replenishment.view`
**File:** `app/(dashboard)/stock-replenishment/page.tsx`
**Component:** `components/replenishment/StockReplenishmentPage.tsx`

### Layout

**Alert Summary Row:**
```
[🔴 X Critical]  [🟡 Y Warning]  [✅ Z Healthy]   Mode: Velocity · 6mo history · 3mo buffer
```
Clicking each pill filters table.

**Results Table columns:**
- Style No (JetBrains Mono)
- Product Description
- Current Stock (colored: red if below threshold, green if ok)
- Min Threshold
- Shortage (red text, bold)
- Severity badge (CRITICAL red / WARNING amber)
- Progress bar (currentStock / minThreshold — fills red)

**Table features:**
- Sort by: Severity (default), StyleNo, Shortage
- Filter by: Critical / Warning / All
- Pagination: 25 per page

**Export buttons (top right):**
- Export PDF
- Export Excel

**No alerts state:**
- Checkmark icon + "All StyleNos are above minimum thresholds" + last checked timestamp

## 1.7 Export — PDF + Excel

**PDF:**
- Title: "Stock Replenishment Report"
- Date + time generated
- Mode + config settings used
- Full table of items below threshold
- Summary row: total critical, total warning, total shortage pieces
- Use jspdf + jspdf-autotable

**Excel:**
- Filename: `stock-replenishment-{YYYY-MM-DD}.xlsx`
- Sheet 1: Summary (mode, config, counts)
- Sheet 2: Full data table
- Use exceljs

## 1.8 New Permission Keys

Add to seed:
```
stock_replenishment.view
stock_replenishment.export
stock_replenishment.configure
```

Default role assignments:
- super_admin + admin: all 3
- member: view + export
- viewer: view only

---

# PART 2 — Dashboard

## 2.1 New Screen — /dashboard

**Route:** `/dashboard`
**Permission:** `dashboard.view`
**File:** `app/(dashboard)/dashboard/page.tsx`
**Component:** `components/dashboard/DashboardPage.tsx`

### Header
- Title: "Dashboard"
- Right side: Period toggle — `This Week | This Month | This Year`
- Default: This Month
- Toggle affects: metric cards + top clients + top styles charts

---

### Section 1 — Metric Cards (3 cards, full width row)

All cards pull from `sales.SaleValue`.

**Card 1 — Total Sales This Year**
- Always current calendar year regardless of period toggle
- Value: SUM(SaleValue) WHERE InvoiceDate in current year
- Trend: % vs same period last year
- Format: $128,450 via toLocaleString()

**Card 2 — Total Sales (period)**
- Changes with period toggle
- Label changes: "This Week" / "This Month" / "This Year"
- Trend: % vs previous equivalent period

**Card 3 — Total Sales This Week**
- Always current week (Mon–Sun) regardless of toggle
- Trend: % vs last week

Trend display:
- Green arrow up + percentage if positive
- Red arrow down + percentage if negative
- Grey dash if no previous data

---

### Section 2 — Charts Row (two charts side by side)

**Left chart (60% width) — Top 5 Clients**
- Type: Horizontal BarChart (recharts)
- Y-axis: PartyName (truncate at 20 chars)
- X-axis: Sale Value ($) or Quantity (pieces)
- Toggle top-right of chart: "Sale Value | Quantity"
- Period: follows page toggle
- Bar color: #3B0764
- Bar hover: #4C0C82
- Tooltip: client name + exact value

**Right chart (40% width) — Top 5 StyleNos**
- Type: Horizontal BarChart (recharts)
- Y-axis: StyleNo (JetBrains Mono)
- X-axis: Sale Value or Quantity
- Same toggle as left chart (linked)
- Bar color: #0D9488 teal
- Tooltip: StyleNo + exact value

Both charts use `<ResponsiveContainer width="100%" height={280}>`

---

### Section 3 — Monthly Sales Trend (full width)

**Line Chart (recharts LineChart)**
- X-axis: Month labels — Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
- Y-axis: Sale Value ($) formatted with toLocaleString()
- Single line: color #3B0764, strokeWidth 2
- Dots: filled circle at each data point
- Hover tooltip: "March 2026 · $84,500"
- Toggle top-right: "Current Year | Last 12 Months"
  - Current Year: Jan–Dec of current calendar year (future months show 0 or null)
  - Last 12 Months: rolling 12 months from today
- Use ResponsiveContainer width="100%" height={300}
- Empty months show 0

---

### Section 4 — Bottom Row

**Left card (40% width) — Memos Expiring**
- Header: "Memos Expiring" + red badge with count
- Two count rows:
  - "X memos expiring within 7 days" (red text)
  - "Y memos expiring within 30 days" (amber text)
- Click on either row → inline dropdown expands showing list:
  - Columns: MemoNo | Client Name | Expiry Date | Days Left
  - Days Left badge: red (<7 days) / amber (7-30 days)
  - Sorted by days left ascending
  - Max 10 shown + "View all X" link → /clients
- If no expiring memos: green checkmark + "No memos expiring soon"

**Right card (60% width) — Quick Actions**
- Title: "Quick Actions"
- 2×2 grid of action buttons:
  - Upload Stock Excel → opens upload modal (stock type pre-selected)
  - Upload Sales Excel → opens upload modal (sales type pre-selected)
  - Client Replenishment → navigates to /client-replenishment
  - Stock Replenishment → navigates to /stock-replenishment
- Each button: icon + label, outlined style, hover #EDE9FE border #3B0764

---

## 2.2 New API Routes

### GET /api/dashboard/metrics
```typescript
// Query: period = 'week' | 'month' | 'year'
// Permission: dashboard.view
Response: {
  totalSalesYear: number,
  totalSalesPeriod: number,
  totalSalesWeek: number,
  trendYoY: number,       // % change year over year
  trendPeriod: number,    // % vs previous period
  trendWeek: number       // % vs last week
}
```

### GET /api/dashboard/top-clients
```typescript
// Query: period, metric = 'value' | 'quantity', limit = 5
// Permission: dashboard.view
Response: [{ partyName: string, saleValue: number, quantity: number }]
```

### GET /api/dashboard/top-styles
```typescript
// Query: period, metric = 'value' | 'quantity', limit = 5
// Permission: dashboard.view
Response: [{ styleNo: string, saleValue: number, quantity: number }]
```

### GET /api/dashboard/monthly-sales
```typescript
// Query: mode = 'current_year' | 'last_12_months'
// Permission: dashboard.view
Response: [{ month: string, year: number, value: number }]
// Example: [{ month: 'Jan', year: 2026, value: 84500 }]
```

### GET /api/dashboard/expiring-memos
```typescript
// Permission: dashboard.view
Response: {
  totalExpiring: number,
  within7Days: number,
  within30Days: number,
  memos: [{
    memoNo: string,
    clientName: string,
    itemCount: number,
    memoEndDate: string,
    daysLeft: number,
    severity: 'critical' | 'warning'
  }]
}
```

## 2.3 New Permission Key

Add to seed:
```
dashboard.view
```

Default roles:
- super_admin + admin + member + viewer: dashboard.view

## 2.4 Update Sidebar

```
Dashboard          → /dashboard        (active, no "soon" badge)

── REPLENISHMENT ──
Client Replenishment → /client-replenishment
History              → /replenishment-history  
Stock Replenishment  → /stock-replenishment   (active, no "soon" badge)

── MASTER DATA ──
Clients            → /clients
Excel Config       → /excel-config

── ADMINISTRATION ──
Settings           → /settings
Users              → /users
Roles              → /roles
```

---

# PART 3 — Excel Export for Existing Screens

## 3.1 Client Replenishment — Add Excel Export

Add "Export Excel" button alongside existing "Export PDF" button.

Excel file:
- Filename: `client-replenishment-{partyName}-{fromDate}-{toDate}.xlsx`
- Sheet 1 "Summary": client name, date range, group by field, generated at
- Sheet 2 "Results": all table rows with columns — Group Value, Sold Qty, Override Qty, In Warehouse count, Pullback count, Factory Order count, selected StockNos
- Use exceljs

Only export confirmed + selected rows (same logic as PDF).

## 3.2 Replenishment History — Add Excel Export

Add "Export Excel" button to history screen.

Excel file:
- Filename: `replenishment-history-{date}.xlsx`
- All visible rows based on current filters
- Columns: InvoiceNo, Group Field, Group Value, StockNo, Type, Replenished By, Replenished At, Status
- Use exceljs

---

# Build Order (Strict)

1. Part 0.1 — Rename replenishment → client-replenishment, update all references
2. Part 0.2 — Scan + report unused files (STOP — wait for confirmation)
3. [After confirmation] Part 0.3 — Delete approved files
4. Part 1.1 — Add stock replenishment config keys to seed, run seed
5. Part 1.2 — Add stock_thresholds table, run migration
6. Part 1.3-1.4 — Stock replenishment API routes
7. Part 1.5 — Settings screen new tab (Stock Replenishment)
8. Part 1.6 — Stock Replenishment screen + component
9. Part 1.7 — PDF + Excel exports for stock replenishment
10. Part 1.8 — Seed new permission keys
11. Part 2.1 — Dashboard screen + component (all 4 sections)
12. Part 2.2 — All 5 dashboard API routes
13. Part 2.3 — Seed dashboard.view permission
14. Part 2.4 — Update sidebar (remove all "soon" badges, add dashboard)
15. Part 3.1 — Excel export for client replenishment
16. Part 3.2 — Excel export for replenishment history
17. Run `npm run build` — must pass with zero errors
18. Update docs/PROGRESS.md with all completed items

---

# Critical Notes for Cursor

- recharts is available — use BarChart + LineChart + ResponsiveContainer
- jspdf + jspdf-autotable already installed — use for all PDF exports
- exceljs already installed — use for all Excel exports
- All API routes: validate JWT + requirePermission from lib/rbac.ts
- All monetary values: format with .toLocaleString('en-US', { style: 'currency', currency: 'USD' })
- All charts must handle empty data gracefully — show empty state, never crash
- Dashboard metric cards must handle null/undefined values — show $0 not error
- Chart colors: primary #3B0764, secondary #0D9488, success #16A34A, warning #D97706, error #DC2626
- Do one numbered step at a time — confirm before moving to next
- Never touch lib/rbac.ts, lib/auth.ts, lib/db.ts, or prisma/schema.prisma for non-schema changes