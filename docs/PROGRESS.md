# CHANGES-2.md — Implementation Progress

Steps correspond to the build order in CHANGES-2.md §9.

## Completed Steps

### Step 1 — Sales columns + migration ✅
- Added `SaleValue Decimal? @db.Decimal(12,2)` and `CRAmount Decimal? @db.Decimal(12,2)` to `sales` model in `prisma/schema.prisma`
- Migration applied
- `lib/excel-config.ts`: both fields exposed in Sales Report mapping

### Step 2 — RBAC tables ✅
- Added `roles`, `permissions`, `role_permissions` models to `prisma/schema.prisma`
- Migration applied

### Step 3 — Users table FK ✅
- Added `RoleID String? @db.Uuid` FK → `roles.RoleID` on `users` model; legacy `Role String` column preserved alongside
- Relations: `UserRole roles?`, `ModifiedByUser`, `ReplenishedItems`, `UndoneItems`
- Migration applied

### Step 4 — Additional tables ✅
- Added `replenishments`, `customer_rankings`, `system_config` models to `prisma/schema.prisma`
- Migration applied

### Step 5 — Seed data ✅
- `prisma/seed.ts`: all 30 permission keys seeded into `permissions` table
- Default roles (`super_admin`, `admin`, `member`, `viewer`) with permission assignments
- System config defaults for modules: `replenishment`, `ranking`, `permissions`, `system`

### Step 6 — lib/rbac.ts ✅
- `lib/rbac.ts`: `getUserPermissions(userId)`, `hasPermission(userId, key)`, `requirePermission(userId, key)`, `ForbiddenError`, `invalidateUserPermissionCache(userId?)`
- 60s in-memory cache stored on `globalThis` for Next.js hot-reload survival

### Step 7 — lib/config.ts ✅
- `lib/config.ts`: `getConfig(key)`, `getConfigBool(key)`, `getConfigInt(key)`, `getConfigDecimal(key)`, `invalidateConfigCache()`
- 60s in-memory cache stored on `globalThis`

### Step 8 — requirePermission on all existing API routes ✅
- `app/api/users/route.ts`: `users.view`, `users.invite`, `users.edit_role`
- `app/api/clients/route.ts`: `clients.view`, `clients.edit_expiry`, `clients.edit_pullback`
- `app/api/excel-config/route.ts`: `excel_config.view`, `excel_config.edit`
- `app/api/upload/route.ts`: `upload.stock`, `upload.sales`
- `app/api/replenishment/v2/route.ts`: `replenishment.view`
- `app/api/replenishment/calculate/route.ts`: `replenishment.view`
- `app/api/replenishment/options/route.ts`: `replenishment.view`

### Step 9 — lib/rankings.ts ✅
- `lib/rankings.ts`: `recalculateRankings()` — reads `ranking_value_metric`, `ranking_value_weight`, `ranking_period` from `system_config`
- Computes overall rankings (`StyleNo = NULL`) per client and per-`StyleNo` rankings using SQL CTEs with `RANK()` window functions
- Upserts `customer_rankings` with `OverallRank` + `StyleRank` (see Step 27 for column rename)
- Updates `ranking_last_calculated` config key after every successful run

### Step 10 — Upload route rankings trigger ✅
- `app/api/upload/route.ts`: fire-and-forget `recalculateRankings()` called after sales UPSERT completes

### Step 11 — POST /api/rankings/recalculate ✅
- `app/api/rankings/recalculate/route.ts`: POST — requires `rankings.recalculate`; calls `recalculateRankings()`; returns `{ success: true, calculatedAt }`

### Step 12 — GET/PATCH /api/settings ✅
- `app/api/settings/route.ts`:
  - GET: requires `settings.view`; returns all `system_config` rows grouped by module
  - PATCH: requires `settings.edit`; updates config value; calls `invalidateConfigCache()`; triggers `recalculateRankings()` if a ranking key changed

### Step 13 — GET/POST/PATCH/DELETE /api/roles ✅
- `app/api/roles/route.ts`:
  - GET: requires `roles.view`; returns all roles with user count and assigned permissions
  - POST: requires `roles.create`; creates new role
  - PATCH action `update`: requires `roles.edit`; updates name/description
  - PATCH action `assign_permissions`: requires `roles.assign_permissions`; replaces permission set
  - DELETE: requires `roles.delete`; blocks deletion if `IsSystem = true`

### Step 14 — Replenishment V2 API: exclude replenished + rank pullback ✅
- `app/api/replenishment/v2/route.ts`:
  - Reads `partial_replenishment_visibility` from `system_config`
  - If true → excludes (InvoiceNo + GroupField + GroupValue) combos already in `replenishments` with `IsUndone = false`
  - If false → excludes entire InvoiceNo if any row for that InvoiceNo is confirmed
  - Pullback list: joins `customer_rankings` for `OverallRank` + `StyleRank`; sorts `OverallRank ASC NULLS LAST`, `StyleRank ASC NULLS LAST`
- `lib/replenishment-v2.ts`: added `overallRank`, `styleRank` to `ReplenishmentV2RawPullbackItem` and `ReplenishmentV2ApiPayload` pullback types

### Step 15 — Replenishment V2 UI: smart stock pick pills ✅
- `components/replenishment/StockPillGroup.tsx`: pill button component — green (selected) / grey (deselected), click toggles state
- `components/replenishment/ReplenishmentV2Page.tsx`:
  - Replaced warehouse eye-button drawer with inline `StockPillGroup` per row
  - `pickRandom(pool, n)`: Fisher-Yates shuffle, used on load and on override qty change
  - `onTogglePill(index, stockNo)`: toggles green ↔ grey; recalculates `factoryOrder` from green pill count
  - `onOverrideQtyChange`: re-picks random subset on qty change
  - **Confirm Replenishment** button: enabled when ≥1 green pill selected; POSTs to `/api/replenishment/confirm`; shows inline toast with 4-second auto-dismiss
  - **Export PDF** button: disabled until `confirmed === true`; resets on new search or group-by change

### Step 16 — POST /api/replenishment/confirm ✅
- `app/api/replenishment/confirm/route.ts`: requires `replenishment.confirm`
- Body: `{ groupField, rows: [{ groupValue, invoiceNos, stockNos: [{ stockNo, type }] }] }`
- Saves one `replenishments` row per (invoiceNo × stockNo) combination
- Returns `{ success: true, replenishmentIds: [...] }` via `createManyAndReturn`
- `lib/replenishment-v2.ts`: added `invoiceNo: string` to `ReplenishmentV2RawSoldItem`; added `invoiceNos: string[]` to row type in `ReplenishmentV2ApiPayload`

### Step 17 — POST /api/replenishment/undo ✅
- `app/api/replenishment/undo/route.ts`: requires `replenishment.undo`
- Body: `{ replenishmentIds: string[] }`
- `updateMany` where `IsUndone: false` — sets `IsUndone = true`, `UndoneBy`, `UndoneAt = now()`
- Returns `{ success: true, updatedCount }`

### Step 18 — GET /api/replenishment/history ✅
- `app/api/replenishment/history/route.ts`: requires `replenishment_history.view`
- Query params: `clientId?`, `fromDate?`, `toDate?` (filter `ReplenishedAt`), `replenishedBy?`, `groupValue?` (ILIKE), `page`, `limit` (max 100)
- `clientId` filter: fetches all InvoiceNos from sales for that client, filters replenishments by `InvoiceNo: { in: [...] }`
- Returns `{ total, page, limit, items }` — each item includes `canUndo: !IsUndone`, replenisher/undoer display names
- `app/api/replenishment/history/replenishers/route.ts`: GET distinct replenisher list for filter dropdown; requires `replenishment_history.view`

### Step 19 — Roles Management screen (/roles) ✅
- `app/(dashboard)/roles/page.tsx`: server component with `PageHeader` + `RolesManagement`
- `components/roles/RolesManagement.tsx`: two-panel layout
  - Left panel: role list with name, user count, `IsSystem` badge; inline Create Role form (+ button); auto-selects new role on create
  - Right panel: permissions grouped by module with checkboxes; Save Permissions button (dirty-flag gated); Delete Role with inline confirm (non-system only); system roles show read-only amber badge
  - Notice auto-dismisses after 4 s
- `app/api/permissions/route.ts`: GET all permissions ordered by module + key; requires `roles.view`
- `components/layout/DashboardSidebar.tsx`: added `ShieldCheck` import; `/roles` active state; "Roles & permissions" `SubNavRow` under Settings accordion (`roles.view` gated); Settings accordion auto-opens on `/roles`

### Step 20 — Settings screen (/settings) ✅
- `app/(dashboard)/settings/page.tsx`: now renders `SystemSettingsPage` (4-tab admin settings hub)
- `app/(dashboard)/settings/profile/page.tsx`: profile content moved here (server component, same as old `/settings`)
- `components/settings/SystemSettingsPage.tsx`:
- Tab 1 **Replenishment**: `partial_replenishment_visibility` (toggle), `default_group_by` (select), `random_pick_method` (select)
  - Tab 2 **Ranking**: `ranking_value_metric`, `ranking_value_weight` (auto-derives `ranking_volume_weight`), `ranking_period`, Recalculate Now button (`POST /api/rankings/recalculate`), last-calculated timestamp
- Tab 3 **Permissions**: role dropdowns for `perm_undo_replenishment`, `perm_export_pdf`, `perm_upload_excel`, `perm_manage_clients`
- Tab 4 **System**: `otp_expiry_minutes`, `close_to_expiry_default_days`, `temp_password_length`
  - All fields auto-save with 1s debounce (selects/toggles immediate); "Saved ✓" badge auto-dismisses after 3s
- 403 from GET → access-denied message; 403 from PATCH → sets view-only mode
- `prisma/seed.ts`: added 5 new `system_config` entries — `perm_undo_replenishment`, `perm_export_pdf`, `perm_upload_excel`, `perm_manage_clients` (permissions module), `ranking_last_calculated` (ranking module)
- `lib/rankings.ts`: upserts `ranking_last_calculated = now.toISOString()` after every successful recalculation
- `components/layout/DashboardSidebar.tsx`: "Profile" sub-nav → `/settings/profile`; new "System settings" sub-nav → `/settings` (`SlidersHorizontal` icon, `settings.view` gated)

### Step 21 — Replenishment History screen (/replenishment-history) ✅
- `app/(dashboard)/replenishment-history/page.tsx`: `hasPermission` gate on `replenishment_history.view`; passes `canUndo` from `replenishment.undo` check
- `components/replenishment/ReplenishmentHistoryPage.tsx`: filter bar (client name, from/to dates, replenished-by dropdown, group value search), paginated table (Active / Undone status with colour), undo confirmation modal → `POST /api/replenishment/undo`
- `components/layout/DashboardSidebar.tsx`: Replenishment History entry gated by `replenishment_history.view`

### Step 22 — JWT permissions ✅
- `lib/auth.ts`: `AppJwtPayload` adds `username`, `roleId`, `roleName`, `permissions: string[]`; `verifyAuthToken` normalizes legacy tokens (empty `permissions` array until re-login)
- `lib/auth-session.ts`: `signAuthTokenForUser()` loads `getUserPermissions(userId)`, signs JWT with role ID/name from `UserRole` relation
- `app/api/auth/login/route.ts`, `change-password/route.ts`: Prisma includes `UserRole`; mint JWT via `signAuthTokenForUser`
- `lib/auth-server.ts`: `requireAuth` returns `AppJwtPayload | null`
- `components/layout/dashboard-session.ts`: `DashboardSession` type includes `permissions`, `roleId`, `roleName`, `username`
- `app/(dashboard)/layout.tsx`: reads JWT/session and passes RBAC fields into dashboard shell for client-side nav checks

### Step 23 — Permission-gated navigation ✅
- `lib/nav-permissions.ts`: `sessionHasPermission(session, key)` for client-side nav checks
- `components/layout/DashboardSidebar.tsx`: all nav items hidden unless JWT `permissions` includes required key; Profile always shown when signed in
- `proxy.ts`: replaces `role === "admin"` checks with JWT `permissions.includes(...)` for API route matching (excel_config, users, roles, settings, replenishment history/confirm/undo APIs)

---

## Additional Steps (post-§9 improvements)

### Step 24 — Sales import: SaleValue / CRAmount on mapped rows ✅
- **Root cause:** valid sales rows built for `mappedRows.push(...)` omitted money fields even when Excel mappings existed.
- `app/api/upload/route.ts`: each pushed `SalesOkRow` now includes `SaleValue` + `CRAmount` via `asDecimalMoney()`; Prisma upsert writes both columns with `?? null` so updates can clear or set correctly
- `lib/excel.ts`: `xlsxCellToScalar` reads rich-text segments and hyperlink display text so formatted currency / hyperlink cells map reliably into scalars for parsing

### Step 25 — Replenishment V2 warehouse pills: count capped to stock pool ✅
- `components/replenishment/ReplenishmentV2Page.tsx`: `warehousePillStockNos` always uses `pillCount = Math.min(overrideQty, pool.length)` in both initial `regroup` and `onOverrideQtyChange` — avoids showing more pills than available warehouse stock

### Step 26 — Administration UI layout density ✅
- `app/(dashboard)/settings/page.tsx`, `users/page.tsx`, `roles/page.tsx`: wrapper `w-full min-w-0` so content uses full horizontal space
- `components/layout/PageHeader.tsx`: description uses `max-w-4xl` for readable line length
- `components/settings/SystemSettingsPage.tsx`, `components/users/UserManagement.tsx`, `components/roles/RolesManagement.tsx`: tightened layouts with `min-w-0` and constrained inner widths

### Step 27 — customer_rankings: OverallRank + StyleRank ✅
- `prisma/schema.prisma`: dropped ambiguous `Rank` column; added nullable `OverallRank Int?` (global client rank) and `StyleRank Int?` (rank within StyleNo across clients); indexes on both
- `prisma/migrations/20260430103000_rankings_overall_style_columns/migration.sql`: adds columns, backfills from `Rank`, copies overall rank onto style rows, drops `Rank` + old index, creates new indexes
- `lib/rankings.ts`: overall SQL CTE emits `OverallRank`; style SQL uses `overall_ranked` CTE + `RANK() OVER (PARTITION BY "StyleNo")` for `StyleRank`; `StyleRank` is null on overall rows
- `app/api/replenishment/v2/route.ts`: loads `OverallRank` / `StyleRank` from `customer_rankings`; nullable-safe maps for pullback ordering

---

## CHANGES-3.md — Part 1: Ranking Architecture Refactor

### Step 28 — OverallRank moved from customer_rankings to clients ✅

**Schema changes (`prisma/schema.prisma`):**
- `clients`: added `OverallRank Int?`, `OverallScore Decimal? @db.Decimal(14,4)`, `LastRankedAt DateTime? @db.Timestamp(6)`, `@@index([OverallRank])`
- `customer_rankings`: removed `OverallRank Int?` and its index; `StyleNo` is now `String` (non-nullable) — no NULL-StyleNo rows exist any more

**Migration (`prisma/migrations/20260501000000_ranking_refactor_overall_to_clients/migration.sql`):**
- `ALTER TABLE clients ADD COLUMN "OverallRank" INTEGER`
- `ALTER TABLE clients ADD COLUMN "OverallScore" DECIMAL(14,4)`
- `ALTER TABLE clients ADD COLUMN "LastRankedAt" TIMESTAMP(6)`
- `CREATE INDEX idx_clients_overall_rank ON clients("OverallRank")`
- `ALTER TABLE customer_rankings DROP COLUMN IF EXISTS "OverallRank"`
- `DROP INDEX IF EXISTS "customer_rankings_OverallRank_idx"`
- `DELETE FROM customer_rankings WHERE "StyleNo" IS NULL`

**`lib/rankings.ts` — recalculateRankings() rewrite:**
- Step 3 (new): `DELETE FROM customer_rankings WHERE "StyleNo" IS NULL` cleans up any stale overall rows on every run
- Step 4: overall SQL CTE unchanged; upsert changed from `INSERT INTO customer_rankings` to `UPDATE clients SET "OverallRank", "OverallScore", "LastRankedAt"`
- Step 5: style SQL CTE simplified — removed `overall_ranked` CTE and `OverallRank` join (no longer denormalized onto style rows); `StyleRawRow` type drops `OverallRank`
- Step 6: style upsert no longer writes `OverallRank` column

**`app/api/replenishment/v2/route.ts`:**
- `pullbackRows` Memo.Client select: added `OverallRank: true` (now on clients table)
- `overallRankByClientId` map: built from `pullbackRows` client data directly — no extra DB query
- `customer_rankings` query: only fetches `StyleRank` (no `OverallRank`, no null-StyleNo filter needed)
- `styleRankRows` replaces old `rankingRows`; null-StyleNo split-branch removed

**`docs/SCHEMA.md`:** updated `clients` and `customer_rankings` sections to reflect new architecture.

---

## Step 29 — CHANGES-3.md Part 2: Production-Grade Testing Suite ✅

**Status:** Complete. 233/233 tests passing across 20 test suites.

### Infrastructure

| File | Purpose |
|------|---------|
| `jest.config.ts` | Two projects (unit/node + components/jsdom); transformIgnorePatterns for jose ESM; ts-jest CommonJS |
| `playwright.config.ts` | Chromium, Firefox, mobile-chrome (Pixel 5); dev server webServer |
| `tests/setup.ts` | Clear globalThis caches (config + RBAC) before each test; JWT_SECRET + DATABASE_URL |
| `tests/__mocks__/next-server.ts` | NextResponse.json() + NextRequest (url, method, cookies, searchParams, json, text, formData) |
| `tests/__mocks__/next-navigation.ts` | useRouter, usePathname, useSearchParams, redirect |
| `tests/__mocks__/next-headers.ts` | cookies(), headers() |
| `tests/fixtures/seed-test-db.ts` | TEST_IDS (valid RFC 4122 v4 UUIDs), ALL_PERMISSION_KEYS, makeUser, makeClient, DEFAULT_SYSTEM_CONFIG, makeSale |

### Test files (233 tests, 20 suites)

**Unit (5 suites):**
- `tests/unit/config.test.ts` — getConfig, caching, invalidation, type coercion
- `tests/unit/rbac.test.ts` — getUserPermissions, hasPermission, requirePermission, cache
- `tests/unit/rankings.test.ts` — recalculateRankings with Prisma.sql inspection via `.strings`
- `tests/unit/replenishment-calc.test.ts` — pickRandom, calcFactoryOrder, pill capping
- `tests/unit/excel-import.test.ts` — xlsxCellToScalar, asDecimalMoney, dedup, categorization

**API (6 suites):**
- `tests/api/auth.test.ts` — JWT round-trip, tamper detection, password hash, domain validation
- `tests/api/rbac.test.ts` — permission boundaries (member/viewer/admin)
- `tests/api/replenishment.test.ts` — v2 GET, confirm POST, undo POST, history GET
- `tests/api/roles.test.ts` — GET, POST, DELETE (system role protection)
- `tests/api/settings.test.ts` — GET, PATCH, cache invalidation
- `tests/api/upload.test.ts` — auth check, file validation, recalculateRankings mockability

**Security (2 suites):**
- `tests/security/auth-security.test.ts` — JWT tamper, wrong secret, bcrypt, domain attacks, SQL injection strings
- `tests/security/data-security.test.ts` — PasswordHash never leaks, XSS contract, privilege escalation prevention

**Regression (3 suites):**
- `tests/regression/upload-dedup.test.ts` — stock/sales deduplication invariants
- `tests/regression/ranking-consistency.test.ts` — OverallRank-on-clients contract, style ranking isolation
- `tests/regression/replenishment-state.test.ts` — calcFactoryOrder, pill selection, confirm/undo payload invariants

**Performance (1 suite):**
- `tests/performance/db-query.test.ts` — JWT/bcrypt/groupBy performance budgets

**Components (3 suites, jsdom):**
- `tests/components/StockPillGroup.test.tsx` — render, selection state, click callback, accessibility titles
- `tests/components/ReplenishmentV2Page.test.tsx` — utility functions (toIsoDateLocal, normalizeMetalType, matchesSoldMetalType)
- `tests/components/RolesManagement.test.tsx` — fetch mock, render, error state

**E2E (5 specs, Playwright):**
- `tests/e2e/auth.spec.ts` — login form, wrong credentials, forgot-password link, redirect
- `tests/e2e/navigation.spec.ts` — protected route guards for all routes
- `tests/e2e/replenishment.spec.ts` — unauthenticated API boundary checks
- `tests/e2e/roles.spec.ts` — unauthenticated API boundary checks
- `tests/e2e/settings.spec.ts` — settings + users API boundary checks
- `tests/e2e/accessibility.spec.ts` — axe-playwright WCAG 2.0 AA on login + forgot-password

**Load:**
- `tests/load/artillery.yml` — warm-up → ramp-up → sustained (20 RPS); p95 < 500ms threshold

**CI:**
- `.github/workflows/test.yml` — unit+api+security+regression+performance, component, E2E jobs with Postgres service

### Key fixes made during implementation
- Zod v4 strict UUID validation: updated TEST_IDS to valid RFC 4122 v4 format
- jose v6 ESM-only: added `transformIgnorePatterns` + `allowJs: true` to jest.config.ts
- Prisma.sql returns `{strings, values}` not array: updated rankings tests to use `.strings`
- `db.$transaction` + `db.replenishments.count`: added to replenishment mock
- NextRequest missing `formData()`: added to next-server mock
- Roles GET response wraps array in `{roles: [...]}`: fixed test assertion
- Roles POST returns 201 not 200: fixed test assertion

---

## CHANGES-5.md — Dashboard + Stock Replenishment + Rename + Excel export

Steps follow the build order in CHANGES-5.md § Build Order (Strict). Part 0.2 scan / Part 0.3 deletions are intentionally gated on an explicit file list and user approval (not recorded here until that list exists).

### Part 0.1 — Client Replenishment route + home redirect ✅
- `app/(dashboard)/client-replenishment/page.tsx` — `ReplenishmentV2Page` under `GroupPageFrame`
- `app/(dashboard)/page.tsx` — redirects `/` → `/client-replenishment`
- Sidebar / nav: label and path **Client Replenishment** → `/client-replenishment` (see `components/layout/DashboardSidebar.tsx` and related layout chrome)

### Part 1 — Stock replenishment ✅
- **Config (seed):** `stock_threshold_mode`, `stock_threshold_global_value`, `stock_velocity_buffer_months`, `stock_velocity_history_months` in `prisma/seed.ts`
- **Schema:** `stock_thresholds` model in `prisma/schema.prisma`
- **API:** `GET /api/stock-replenishment`, `POST /api/stock-replenishment/thresholds` under `app/api/stock-replenishment/`
- **Settings:** Stock Replenishment tab in `components/settings/SystemSettingsPage.tsx` (mode manual / velocity / global + threshold UI)
- **UI:** `app/(dashboard)/stock-replenishment/page.tsx`, `components/replenishment/StockReplenishmentPage.tsx`
- **Exports:** `lib/stock-replenishment-export.ts` (and PDF via jspdf in page flow — see component)
- **Permissions (seed):** `stock_replenishment.view`, `stock_replenishment.export`, `stock_replenishment.configure` with role assignments per CHANGES-5 §1.8

### Part 2 — Dashboard ✅
- **UI:** `app/(dashboard)/dashboard/page.tsx`, `components/dashboard/DashboardPage.tsx` — metric cards, Recharts bar/line charts, expiring memos card, quick actions
- **API:** `app/api/dashboard/metrics`, `top-clients`, `top-styles`, `monthly-sales`, `expiring-memos`
- **Permission (seed):** `dashboard.view` — default for super_admin, admin, member, viewer per CHANGES-5 §2.3
- **Sidebar:** Dashboard + replenishment group ordering per CHANGES-5 §2.4

### Part 3 — Excel export for existing replenishment screens ✅
- **`lib/client-replenishment-export.ts`** — workbook: Summary + Results; filename `client-replenishment-{party}-{from}-{to}.xlsx`
- **`components/replenishment/ReplenishmentV2Page.tsx`** — **Export Excel** next to Export PDF; enabled after confirm (same gate as PDF); row set matches PDF/table with **Selected StockNos** column populated from pill selection
- **`lib/replenishment-history-export.ts`** — sheet **History**; filename `replenishment-history-{YYYY-MM-DD}.xlsx`
- **`app/api/replenishment/history/route.ts`** — query `exportAll=1` uses `skip=0` and `limit` up to **20,000** (normal requests still cap at 100)
- **`components/replenishment/ReplenishmentHistoryPage.tsx`** — **Export Excel** uses **applied** filters + `exportAll=1`; toast if response is truncated vs `total`

---

## Route cleanup (docs/AUDIT build order Steps 12–18) ✅ — May 2026

- **`CLAUDE.md`:** Folder tree and **Key routes (UI)** / API tables updated for `/replenishment/client`, `/replenishment/stock`, `/admin/users`, `/admin/roles`; home → `/dashboard`; history documented as in-app tab on client replenishment.
- **`lib/dashboard-navbar-title.ts`:** Titles for `/replenishment/client`, `/replenishment/stock`, `/admin/users`, `/admin/roles` (legacy path strings retained for redirects).
- **Deleted pages:** `app/(dashboard)/client-replenishment/`, `stock-replenishment/`, `replenishment/page.tsx` (flat legacy), `replenishment-v1/`, `replenishment-history/`, `users/`, `roles/`.
- **Deleted APIs:** `app/api/stock-replenishment/`, `app/api/stock-review/` — canonical handlers live under `app/api/stock/replenishment/` and `app/api/stock/review/`.
- **Tests:** `tests/__mocks__/next-navigation.ts`, `tests/e2e/replenishment.spec.ts`, `tests/e2e/navigation.spec.ts` — URLs updated to new routes; navigation list no longer duplicates `/replenishment-history` (same guard as `/replenishment/client`).
- **Build:** `npm run build` passes after doc/lib updates and again after deletions (legacy routes still served via `next.config.ts` redirects where applicable).

---

## CHANGES-7 — History API pullback logs + pullback status overhaul ✅ — May 2026

Source: `docs/changes/CHANGES-7.md`. All seven parts implemented; touched files only as listed in CHANGES-7 Notes.

### Part 1 — History API + History tab (pullback logs in UI) ✅
- **`app/api/replenishment/history/route.ts`** — Each history row includes **`items`** from `replenishment_items` with nested **`PullbackHistory`** / **`SelectionHistory`** (newest-first `orderBy`), `contactedByName` / `changedByName` from user first + last name.
- **`components/replenishment/ReplenishmentHistoryTab.tsx`** — Expanded rows: per-line **Item details** for non-pullback; for **`Status === pullback`**, communication + selection tables with **channel/response badges**, sorted newest-first; empty copy per CHANGES-7.

### Part 2 — New badge definitions ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`** — **`BADGE_CONFIG`** + **`STATUS_BADGE_WRAP`** replace prior allocation pill meta; memo, stock, pullback states, factory skippable/final (no borders on pills).

### Part 3 — `skippedPullback` + derivation helpers ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`** — **`TableRow.skippedPullback`** (default `false` in **`regroup`**; reset on **`overrideQty`** change); **`derivePullbackBadgeState`**, **`getFactoryOrderBadgeType`**, **`lastLogForStock`**, **`logResponseKey`**; **`computeAllocationBreakdown`** hoisted above badge helpers.

### Part 4 — Skip / restore pullback (inline warnings) ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`** — **`ReplenishmentStatusCell`**: inline amber panels for skip pullback and switch back to pullback; updates row state (clear confirmations / logs on skip; **`skippedPullback`** on restore).

### Part 5 — Pullback drawer eye button visibility ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`** — Eye **Pullback** control only when **`!row.skippedPullback`** and **`pullbackAvail > 0`** (`computeAllocationBreakdown`).

### Part 6 — Communication dots + Swap in drawer ✅
- **`components/replenishment/PullbackDrawer.tsx`** — Optional **`getContactLogsForStock`**, **`onSwapRejected`**; **`getPullbackDotState`**; per-row dot before client name + native **`title`**; **Swap** when last response is rejected.
- **`components/replenishment/ReplenishmentV2Page.tsx`** — Wires drawer props from `rows` / `pullbackDrawer`; **`swapRejectedModal`** + **`submitSwapRejectedReason`** (reason ≥10 chars, history append, remove item, reopen drawer **`startWithEmptySelection={false}`**).

### Part 7 — `ReplenishmentStatusCell` composition ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`** — **`StatusBadge`** + **`ReplenishmentStatusCell`**: builds memo/stock/pullback/factory badges from allocation + derived pullback state; compact mode when **`overrideQty <= soldQty`** and a single badge; passes **`setRows`** / **`finalizeRows`** for local-only transitions.

---

## CHANGES-9 — ERP API sync + stock replenishment overhaul ✅ — May 2026

Source: `docs/changes/CHANGES-9.md`. All ten parts implemented; build verified (`npm run build` — 51/51 static pages).

### Part 1 — New DB columns + config keys ✅
- **Migration:** `prisma/migrations/20260528120000_ch9_part1_stock_columns_forecast_accuracy/migration.sql` — adds `Size`, `StoneType`, `StockValue`, `MetalPurity`, `HoldSoldRemark`, `HoldSoldDate`, `LastSyncedAt`, `SyncSource` on `stock`; creates `stock_forecast_accuracy` table
- **`prisma/seed.ts`:** 28 new `system_config` keys (S-class, ABC thresholds, class buffers, seasonal methods, CV filter, feedback loop, ERP auto-sync)

### Part 2 — ERP API integration library ✅
- **`lib/erp-api.ts`:** `getErpToken()`, `fetchErpStock()`, `fetchErpSales()`, `parseMetalType()`; types `ErpStockRecord`, `ErpSaleRecord`

### Part 3 — Stock sync logic ✅
- **`lib/erp-sync.ts`:** `syncStockFromErp()`, `syncMemoFromErpRecord()`, `StockSyncResult`
- **`lib/stock-lifecycle.ts`:** extracted `applyStockUploadMemoLifecyclePasses()` from upload route for shared use
- **`app/api/upload/route.ts`:** imports memo lifecycle from shared lib (Excel upload fallback preserved)

### Part 4 — Sync API routes ✅
- **`POST /api/erp/sync/stock`** — requires `upload.stock`; manual ERP stock sync
- **`GET /api/erp/sync/status`** — requires `replenishment.view`; last sync timestamp + status

### Part 5 — Auto sync ✅
- **`lib/erp-auto-sync.ts`:** `triggerAutoSyncIfDue()` — non-blocking background sync when interval elapsed
- **`app/api/replenishment/v2/route.ts`:** auto-sync wired at top of GET; skips silently when ERP env vars unset

### Part 6 — Navbar ERP sync ✅
- **`components/layout/DashboardTopBar.tsx`:** sync status indicator, **Sync ERP** button (`upload.stock`), relative last-sync time, toast on manual sync

### Part 7 — Settings ERP Sync tab ✅
- **`components/settings/SystemSettingsPage.tsx`:** Tab 6 **ERP Sync** — auto-sync toggle, interval dropdown, last sync status, manual sync button

### Part 8 — Stock replenishment logic (ABC + S-Class + dual method) ✅
- **8A — `lib/stock-classification.ts`:** `classifyAllStyles()` → S / A / B / C from velocity + value
- **8B — `lib/stock-replenishment.ts`:** `calculateThreshold()` — Method 1 YoY + Method 2 seasonal arc, blend, CV filter, class buffers, feedback loop → `stock_forecast_accuracy`
- **8C — `getStockReplenishmentReport()`:** uses new threshold logic; rows include `stockClass`
- **8D — `components/replenishment/StockReplenishmentPage.tsx`:** Class badge column
- **8E — `SystemSettingsPage.tsx` Tab 5:** velocity settings redesign (S-class, ABC, buffers, methods, blending, CV, formula preview, feedback loop, validation)

### Part 9 — Style rank badge ✅
- **`lib/replenishment-v2.ts`:** `styleRank: number | null` on grouped rows and raw sold items
- **`app/api/replenishment/v2/route.ts`:** fetches `customer_rankings` when `groupBy === "StyleNo"` and client search; enriches rows + raw sold items
- **`components/replenishment/ReplenishmentV2Page.tsx`:** `#N` badge in Group Value column; `regroup()` preserves `styleRank`

### Part 10 — Environment variables ✅
- **`.env.example`:** ERP API Integration section — `ERP_API_BASE_URL`, `ERP_LOGIN_TYPE`, `ERP_USER_NAME`, `ERP_PASSWORD`, `ERP_USER_ID`, `ERP_REMOTE_ADDRESS`, `ERP_COMMAND_TYPE`

---

## CHANGES-10 — Replenishment status overhaul + factory orders + history ✅ — Jun 2026

Source: `docs/changes/CHANGES-10.md`. All parts implemented; build verified (`npm run build`); seed run (`npx prisma db seed` — 42 permissions).

### Part 1 — Schema ✅
- **`replenishment_status_log`** table; **`replenishment_items`** columns `PullbackCandidateCount`, `IsActive`, `FactoryOrderPlacedAt`, `FactoryOrderPlacedBy`
- Migration: `changes10_status_log_factory_orders`

### Part 2 — Status transition rules ✅
- **`lib/replenishment-item-status.ts`:** confirmed/factory status helpers; transition logging pattern documented in CHANGES-10

### Part 3 — Confirm API ✅
- **`app/api/replenishment/confirm/route.ts`:** `?force=true` bypass for `pb_in_progress`; status mapping (`pending_pullback`, `pullback`, etc.); `replenishment_status_log` on create; response counts (`confirmedCount`, `pendingPullbackCount`, `factoryOrderCount`, `pullbackUnactionedCount`)

### Part 4–6 — Replenishment V2 UI ✅
- **`components/replenishment/ReplenishmentV2Page.tsx`:** row UI states (disabled / locked selection / full recalc); show-completed toggle; status chips on disabled rows; confirm warning modal + `force=true`; pending-invoices badge + sortable drawer; dual export dropdowns via **`lib/replenishment-exports.ts`**

### Part 7–8 — Factory orders + pending pullbacks screens ✅
- **`/replenishment/factory-orders`** — `FactoryOrdersPage.tsx`, `GET/PATCH` factory-orders APIs, inline mark-ordered
- **`/replenishment/pending-pullbacks`** — `PendingPullbacksPage.tsx`, `GET /api/replenishment/pending-pullbacks`

### Part 9 — History tab ✅
- **`components/replenishment/ReplenishmentHistoryTab.tsx`:** global history (client + invoice filters only); grouped by invoice, collapsed by default; per-invoice export dropdowns; status chips per spec
- **`app/api/replenishment/history/route.ts`:** grouped response, no date range

### Part 10 — Dashboard ✅
- **`components/dashboard/DashboardPage.tsx`:** Pending Replenishments card (`GET /api/replenishment/pending-count`)

### Part 11 — Sidebar ✅
- **`components/layout/DashboardSidebar.tsx`:** Pending Pullbacks, Factory Orders under Replenishment

### Part 12 — APIs + permissions ✅
- **`GET /api/replenishment/pending-count`**, **`pending-invoices`**, **`pending-pullbacks`**, **`factory-orders`**, **`factory-orders/mark-ordered`**
- **`prisma/seed.ts`:** `replenishment.view_pending_pullbacks`, `view_factory_orders`, `mark_factory_ordered`, `export_confirmed`, `export_factory_orders` (member: all replenishment; viewer: view screens only)
