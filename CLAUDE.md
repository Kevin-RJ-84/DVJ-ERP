# DVJ ERP — Project overview (code-accurate)

This document reflects **what exists in the repository today**, not roadmap items.

Also see root `AGENTS.md` (Next.js version notes).

## Product

Internal ERP for **DV Jewelry Corp**: replenishment planning from sales and stock, client (party) defaults, Excel import column mapping, RBAC-gated user administration, and system configuration.

## Tech stack

| Layer | Technology |
|--------|--------------|
| Framework | **Next.js** `16.x` (App Router) |
| UI | **React** `19.x`, **Tailwind CSS** `4.x` |
| Database | **PostgreSQL** via **Prisma** `7.x` |
| DB driver | **`@prisma/adapter-pg`** + **`pg`** pool (`lib/db.ts`) |
| Auth | **JWT** (`jose`), **bcryptjs** password hashing |
| Email | **`sendEmail()`** in `lib/email.ts`: **Resend** SDK if `RESEND_API_KEY` + `RESEND_FROM`; else **nodemailer** SMTP if `SMTP_*` set; else logs warning and skips |
| PDF export | **jspdf** + **jspdf-autotable** (replenishment export) |
| Excel | **exceljs**, **csv-parse** |
| 3D (login only) | **three**, **@react-three/fiber**, **framer-motion** (optional lazy scene) |

## Environment variables (observed in code)

- **Required for DB:** `DATABASE_URL`
- **Auth:** `JWT_SECRET`
- **Email (pick one path):** Resend (`RESEND_API_KEY`, `RESEND_FROM`) or SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)
- **Optional:** `ALLOWED_EMAIL_DOMAIN` (used in user invite validation), seed vars for admin (`SEED_ADMIN_*` referenced in repo docs)

## Folder structure (high level)

```
app/
├── (auth)/
│   ├── change-password/page.tsx
│   ├── forgot-password/
│   │   ├── otp/page.tsx
│   │   └── reset/page.tsx
│   └── login/page.tsx
├── (dashboard)/
│   ├── page.tsx                  ← redirect → `/dashboard`
│   ├── dashboard/page.tsx
│   ├── clients/page.tsx
│   ├── excel-config/page.tsx
│   ├── replenishment/
│   │   ├── client/page.tsx       ← Replenishment V2 (+ History tab; **By Style** upload mode)
│   │   └── stock/page.tsx        ← Stock replenishment
│   ├── stock-review/page.tsx
│   ├── admin/
│   │   ├── users/page.tsx
│   │   └── roles/page.tsx
│   ├── settings/
│   │   ├── page.tsx              ← SystemSettingsPage hub (admin, 4 tabs)
│   │   └── profile/page.tsx      ← Profile / change password
│   ├── layout.tsx                ← reads JWT, passes RBAC fields into dashboard shell
│   └── …
├── api/
│   ├── auth/{login,logout,forgot-password,reset-password,verify-otp,change-password}/
│   ├── clients/
│   ├── dashboard/{metrics,monthly-sales,top-clients,top-styles,expiring-memos}/
│   ├── excel-config/
│   ├── permissions/
│   ├── rankings/recalculate/
│   ├── replenishment/{v2,calculate,confirm,undo,history,history/replenishers,options,style-upload}/
│   ├── roles/
│   ├── settings/
│   ├── stock/
│   │   ├── replenishment/        ← GET report; thresholds/ GET+POST (settings-gated)
│   │   └── review/               ← list missing; count/; resolve/
│   ├── upload/
│   └── users/
components/
├── auth/           ← Login, forgot-password, reset forms + optional 3D scene
├── clients/        ← ClientManagement.tsx
├── excel-config/   ← ExcelConfigManager.tsx
├── layout/         ← DashboardShell, DashboardSidebar, TopNavBar, PageHeader
├── replenishment/  ← ReplenishmentV2Page, ReplenishmentHistoryPage, StockPillGroup, etc.
├── roles/          ← RolesManagement.tsx
├── settings/       ← SystemSettingsPage.tsx, ProfileSettingsLayout.tsx
└── users/          ← UserManagement.tsx
lib/
├── auth.ts            ← JWT sign/verify; AppJwtPayload includes permissions[]
├── auth-server.ts     ← requireAuth() for API route guards
├── auth-session.ts    ← signAuthTokenForUser() — loads permissions and signs JWT
├── config.ts          ← getConfig/getConfigBool/Int/Decimal; 60s cache on globalThis
├── db.ts              ← Prisma + pg pool singleton
├── email.ts           ← sendEmail(); Resend → SMTP → warn
├── excel.ts           ← xlsxCellToScalar, workbook parsing helpers
├── excel-config.ts    ← load/save excel_mappings helpers
├── import-upload.ts   ← shared upload processing logic
├── nav-permissions.ts ← sessionHasPermission(session, key) for client-side nav checks
├── password.ts        ← bcrypt helpers
├── rankings.ts        ← recalculateRankings(); SQL CTEs with RANK() window functions
├── rbac.ts            ← getUserPermissions, hasPermission, requirePermission; 60s cache
├── replenishment.ts   ← V1 helpers
├── replenishment-v2.ts← types + group-key definitions for replenishment V2
└── users.ts           ← user lookup helpers
prisma/
├── schema.prisma      ← 12 models (see docs/SCHEMA.md)
├── seed.ts            ← permissions, default roles, system_config defaults
└── migrations/
```

## RBAC system

The app uses a full role-based access control system backed by the `roles`, `permissions`, and `role_permissions` tables.

**Auth flow:**
1. On login (`POST /api/auth/login`), `signAuthTokenForUser()` in `lib/auth-session.ts` calls `getUserPermissions(userId)` and embeds the result as `permissions: string[]` in the JWT.
2. `AppJwtPayload` (`lib/auth.ts`) carries `userId`, `username`, `roleId`, `roleName`, `permissions[]`.
3. API routes enforce permissions server-side via `requirePermission(userId, key)` in `lib/rbac.ts` (DB-backed, 60s cache). Never trust client-side checks for enforcement.
4. The dashboard sidebar (`components/layout/DashboardSidebar.tsx`) hides nav items client-side via `sessionHasPermission(session, key)` in `lib/nav-permissions.ts`.

**Default roles (seeded, `IsSystem = true` cannot be deleted):**

| Role | IsSystem | Permission set |
|------|----------|----------------|
| `super_admin` | true | All permissions |
| `admin` | true | All except `settings.edit`, `roles.delete`, `replenishment.undo` |
| `member` | false | `replenishment.*`, `replenishment_history.view`, `upload.*`, `clients.view` |
| `viewer` | false | `replenishment.view`, `replenishment_history.view`, `clients.view` |

**Permission keys (grouped by module):**
- `users.*` — `view`, `invite`, `edit_role`, `deactivate`
- `roles.*` — `view`, `create`, `edit`, `delete`, `assign_permissions`
- `replenishment.*` — `view`, `search`, `override_qty`, `toggle_stock`, `confirm`, `export_pdf`, `undo`
- `replenishment_history.*` — `view`, `filter`
- `upload.*` — `stock`, `sales`
- `excel_config.*` — `view`, `edit`
- `clients.*` — `view`, `edit_expiry`, `edit_pullback`
- `settings.*` — `view`, `edit`
- `rankings.*` — `view`, `recalculate`

## Key routes (UI)

Defined in `components/layout/DashboardSidebar.tsx` with permission gating:

| Path | Purpose | Permission required |
|------|---------|---------------------|
| `/` | Redirect → `/dashboard` | (n/a) |
| `/dashboard` | Metrics hub + quick actions | `dashboard.view` or `replenishment.view` (see layout) |
| `/replenishment/client` | Replenishment V2 (primary); **History** tab in-page; **By Style** upload mode | `replenishment.view` / `replenishment_history.view` (see sidebar) |
| `/replenishment/stock` | Stock replenishment report | `stock_replenishment.view` or `replenishment.view` |
| `/clients` | Client directory / party defaults | `clients.view` |
| `/excel-config` | Excel column → DB field mapping | `excel_config.view` |
| `/settings` | System settings hub (4 tabs) | `settings.view` |
| `/settings/profile` | Profile / change password | always shown |
| `/admin/users` | User management | `users.view` |
| `/admin/roles` | Roles & permissions management | `roles.view` |

**Canonical URLs (renamed):** `/replenishment/client` (was `/client-replenishment`), `/replenishment/stock` (was `/stock-replenishment`), `/admin/users` (was `/users`), `/admin/roles` (was `/roles`). **`next.config.ts`** defines permanent redirects from the old paths.

**Removed as standalone pages:** flat `/replenishment`, `/replenishment-v1`, `/replenishment-history` (history lives in the **History** tab on `/replenishment/client`).

## Key API surface (`app/api/`)

| Route | Methods | Permission(s) |
|-------|---------|---------------|
| `api/auth/login`, `logout`, `forgot-password`, `reset-password`, `verify-otp`, `change-password` | POST | public / auth-only |
| `api/users` | GET, POST, PATCH | `users.view`, `users.invite`, `users.edit_role` |
| `api/roles` | GET, POST, PATCH, DELETE | `roles.view`, `roles.create`, `roles.edit`, `roles.assign_permissions`, `roles.delete` |
| `api/permissions` | GET | `roles.view` |
| `api/clients` | GET, PATCH | `clients.view`, `clients.edit_*` |
| `api/excel-config` | GET, POST | `excel_config.view`, `excel_config.edit` |
| `api/upload` | GET, POST | `upload.stock`, `upload.sales` |
| `api/settings` | GET, PATCH | `settings.view`, `settings.edit` |
| `api/replenishment/v2` | GET | `replenishment.view` |
| `api/replenishment/style-upload` | POST | `replenishment.view`, `replenishment.search` |
| `api/replenishment/calculate` | POST | `replenishment.view` |
| `api/replenishment/confirm` | POST | `replenishment.confirm` |
| `api/replenishment/undo` | POST | `replenishment.undo` |
| `api/replenishment/history` | GET | `replenishment_history.view` |
| `api/replenishment/history/replenishers` | GET | `replenishment_history.view` |
| `api/replenishment/options` | GET | `replenishment.view` |
| `api/stock/replenishment` | GET | `stock_replenishment.view` or `replenishment.view` |
| `api/stock/replenishment/thresholds` | GET, POST | `settings.view` / `settings.edit` |
| `api/stock/review` | GET | `stock_review.view` |
| `api/stock/review/count` | GET | `replenishment.view` |
| `api/stock/review/resolve` | PATCH | `stock_review.resolve` |
| `api/rankings/recalculate` | POST | `rankings.recalculate` |

## Core business logic (where it lives)

1. **Replenishment V2**
   - UI: `components/replenishment/ReplenishmentV2Page.tsx`
   - Types/group keys: `lib/replenishment-v2.ts`
   - Server: `app/api/replenishment/v2/route.ts` (and related routes)
   - Client + date search, **Group By** (`StyleNo`, `ProductType`, `StoneShape`, `Metal`, `MetalType`, `ProductStyle`), regroup from API `raw`, override qty, **StockPillGroup** (inline warehouse pill buttons — green = selected, grey = deselected).
   - **Replenished-item exclusion:** reads `partial_replenishment_visibility` from `system_config`; excludes already-confirmed (not undone) combinations from sold items.
   - **MetalType filter:** warehouse and pullback lists match sold-line `MetalType` in the group (`normalizeMetalType` + `matchesSoldMetalType` in `ReplenishmentV2Page.tsx`).
   - **Pullback ranking sort:** pullback items sorted by `OverallRank ASC NULLS LAST`, `StyleRank ASC NULLS LAST` from `customer_rankings`.
   - **Confirm flow:** Confirm Replenishment button POSTs to `/api/replenishment/confirm`; saves one `replenishments` row per (invoiceNo × stockNo). Export PDF enabled only after confirm.

2. **Style upload (By Style mode on `/replenishment/client`)**
   - UI: **By Style** search mode in `components/replenishment/ReplenishmentV2Page.tsx` (same page as client/invoice search; not a separate route).
   - API: `POST /api/replenishment/style-upload` — accepts Excel/CSV (`StyleNo` required; `MetalType` optional — empty matches any metal; `Qty` optional, default 1) + optional `clientId` form field.
   - Optional **Client / Company** autocomplete (`/api/clients?q=…`, min 3 chars) — when set, hold items for that client are allocated first.
   - Sample template download: `DVJ-style-upload-template.xlsx` (client-side via exceljs).
   - **Hold priority** (when client selected): stock with `HoldDate` set and `HoldCompany` matching client `PartyName` (case-insensitive) → memo → warehouse → pullback → factory order.
   - **Stock fields (ERP):** `HoldCompany` ← ERP `HOLD_REMARK`; `MemoPrice` ← ERP `MEMO_PRICE` (see `lib/erp-sync.ts`).
   - Hold items show **On Hold** badge (pink) and pink stock pills in results; confirm replenishment is not available in By Style mode (planning only).

3. **Replenishment History**
   - UI: `components/replenishment/ReplenishmentHistoryTab.tsx` (embedded **History** tab on `/replenishment/client`) and `ReplenishmentHistoryPage.tsx` (same data surface where reused)
   - API: `app/api/replenishment/history/route.ts` + `history/replenishers/route.ts`
   - Paginated view of past replenishments with per-row undo capability (permission-gated).

4. **Customer Rankings**
   - Logic: `lib/rankings.ts` — `recalculateRankings()` uses SQL CTEs with `RANK()` window functions.
   - Table: `customer_rankings` with `OverallRank` (global client rank) and `StyleRank` (per-style rank across clients). Overall rows have `StyleNo = NULL`; style rows have `StyleRank` set and `OverallRank` duplicated for debug.
   - Triggered after every sales upload and on demand via `POST /api/rankings/recalculate`.
   - Config-driven: `ranking_value_metric` (SaleValue | Profit), `ranking_value_weight`, `ranking_period` (all_time | yearly | monthly) from `system_config`.

5. **System config**
   - Lib: `lib/config.ts` — `getConfig`, `getConfigBool`, `getConfigInt`, `getConfigDecimal`; 60s in-memory cache on `globalThis`.
   - Admin UI: `components/settings/SystemSettingsPage.tsx` — 4 tabs (Replenishment, Ranking, Permissions, System) with 1s debounced auto-save.
   - API: `app/api/settings/route.ts` — PATCH invalidates config cache; triggers ranking recalc if a ranking key changed.

6. **Roles Management**
   - UI: `components/roles/RolesManagement.tsx`
   - Page: `app/(dashboard)/admin/roles/page.tsx`
   - Two-panel: role list (name, user count, `IsSystem` badge, inline Create Role form) + permission checkboxes grouped by module with Save / Delete.
   - System roles (`IsSystem: true`) are read-only and cannot be deleted.

7. **Clients** — `components/clients/ClientManagement.tsx`, `app/(dashboard)/clients/page.tsx`, `app/api/clients/route.ts`.

8. **Excel map config** — `components/excel-config/ExcelConfigManager.tsx`, `app/(dashboard)/excel-config/page.tsx`, `lib/excel-config.ts`, `app/api/excel-config/route.ts`, table `excel_mappings`.

9. **Users & invitations** — `app/(dashboard)/admin/users/page.tsx`, `app/api/users/route.ts` (`sendEmail` after create). Role assignment dropdown pulls from `roles` table.

10. **Auth** — `lib/auth.ts`, `lib/auth-server.ts`, `lib/auth-session.ts`, routes under `app/api/auth/`.

## Coding rules (practical)

- Follow **Next.js 16** App Router / Route Handlers (`AGENTS.md`).
- Use **Prisma** via `lib/db.ts` singleton.
- Validate API input (e.g. **zod** in `api/users`).
- Tailwind utility-first; feature components under `components/<area>/`.
- All API routes enforce permissions server-side via `requirePermission(userId, key)` from `lib/rbac.ts`.
- Never trust client-side permission checks for enforcement; sidebar/nav checks are UI-only.
- Do not commit secrets; use env for Resend/SMTP/JWT/DB.

## Related docs in this folder

- `docs/PROGRESS.md` — completed features and file pointers
- `docs/SCHEMA.md` — tables from `prisma/schema.prisma`
