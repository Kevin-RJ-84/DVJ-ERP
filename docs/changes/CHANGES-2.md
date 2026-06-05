# CHANGES-2.md — RBAC + Rankings + Config + Replenishment Storage + Smart Pick

This file describes everything to build on top of the existing codebase.
Read CLAUDE.md first for full project context.
Read docs/SCHEMA.md for existing table definitions.
Do not modify anything not mentioned in this file.

---

## 0. Sales Table — Add Missing Columns

Add to existing `sales` model in `prisma/schema.prisma`:

```prisma
SaleValue   Decimal?  @db.Decimal(12, 2)   // What client paid
CRAmount    Decimal?  @db.Decimal(12, 2)   // Our cost of making
```

Run migration after adding:
```bash
npx prisma migrate dev --name add_sales_value_columns
```

Update `excel_mappings` — when mapping Sales Report, expose these two new fields:
- `SaleValue`
- `CRAmount`

---

## 1. New DB Tables (Add to Prisma Schema)

### 1A. roles
```prisma
model roles {
  RoleID       String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  RoleName     String             @unique @db.VarChar
  Description  String?            @db.VarChar
  IsSystem     Boolean            @default(false)   // TRUE = cannot be deleted
  CreatedAt    DateTime           @default(now()) @db.Timestamp(6)
  CreatedByID  String?            @db.Uuid
  Users        users[]
  Permissions  role_permissions[]

  @@map("roles")
}
```

### 1B. permissions
```prisma
model permissions {
  PermissionID  String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  PermissionKey String             @unique @db.VarChar   // e.g. 'replenishment.confirm'
  Description   String?            @db.VarChar
  Module        String             @db.VarChar           // e.g. 'replenishment', 'clients'
  Roles         role_permissions[]

  @@map("permissions")
}
```

### 1C. role_permissions (Junction)
```prisma
model role_permissions {
  RoleID        String      @db.Uuid
  PermissionID  String      @db.Uuid
  Role          roles       @relation(fields: [RoleID], references: [RoleID], onDelete: Cascade)
  Permission    permissions @relation(fields: [PermissionID], references: [PermissionID], onDelete: Cascade)

  @@id([RoleID, PermissionID])
  @@map("role_permissions")
}
```

### 1D. Update users model
Replace `Role String @db.VarChar` with:
```prisma
RoleID  String?  @db.Uuid
Role    roles?   @relation(fields: [RoleID], references: [RoleID], onDelete: SetNull)
```

### 1E. customer_rankings
```prisma
model customer_rankings {
  RankingID        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ClientID         String   @db.Uuid
  StyleNo          String?  @db.VarChar    // NULL = Overall ranking row
  TotalPiecesSold  Int      @default(0)
  TotalValueSold   Decimal  @default(0) @db.Decimal(14, 2)
  TotalProfit      Decimal  @default(0) @db.Decimal(14, 2)   // SaleValue - CRAmount
  CombinedScore    Decimal  @default(0) @db.Decimal(14, 4)
  Rank             Int      @default(0)
  LastCalculatedAt DateTime @default(now()) @db.Timestamp(6)
  Client           clients  @relation(fields: [ClientID], references: [ClientID], onDelete: Cascade)

  @@unique([ClientID, StyleNo])
  @@index([ClientID])
  @@index([StyleNo])
  @@index([Rank])
  @@map("customer_rankings")
}
```

### 1F. replenishments
```prisma
model replenishments {
  ReplenishmentID  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  InvoiceNo        String   @db.VarChar
  GroupField       String   @db.VarChar    // e.g. 'StyleNo'
  GroupValue       String   @db.VarChar    // e.g. '3333'
  StockNo          String   @db.VarChar
  Type             String   @db.VarChar    // 'warehouse' or 'pullback'
  ReplenishedBy    String   @db.Uuid
  ReplenishedAt    DateTime @default(now()) @db.Timestamp(6)
  IsUndone         Boolean  @default(false)
  UndoneBy         String?  @db.Uuid
  UndoneAt         DateTime? @db.Timestamp(6)
  User             users    @relation("ReplenishedByUser", fields: [ReplenishedBy], references: [UserID])

  @@index([InvoiceNo])
  @@index([GroupValue])
  @@index([StockNo])
  @@map("replenishments")
}
```

### 1G. system_config
```prisma
model system_config {
  ConfigID     String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ConfigKey    String   @unique @db.VarChar
  ConfigValue  String   @db.Text
  ConfigType   String   @db.VarChar      // 'boolean' | 'integer' | 'decimal' | 'enum' | 'string'
  Description  String?  @db.VarChar
  Module       String   @db.VarChar      // 'replenishment' | 'ranking' | 'permissions' | 'system'
  UpdatedAt    DateTime @default(now()) @db.Timestamp(6)
  UpdatedByID  String?  @db.Uuid

  @@map("system_config")
}
```

---

## 2. Seed Data (Run Once on First Setup)

### 2A. Seed Permissions
Insert all permission keys from `docs/PERMISSIONS.md` into `permissions` table on first run.

File: `prisma/seed.ts`

All permission keys to seed:
```
users.view, users.invite, users.edit_role, users.deactivate
roles.view, roles.create, roles.edit, roles.delete, roles.assign_permissions
replenishment.view, replenishment.search, replenishment.override_qty
replenishment.toggle_stock, replenishment.confirm, replenishment.export_pdf, replenishment.undo
replenishment_history.view, replenishment_history.filter
upload.stock, upload.sales
excel_config.view, excel_config.edit
clients.view, clients.edit_expiry, clients.edit_pullback
settings.view, settings.edit
rankings.view, rankings.recalculate
```

### 2B. Seed Default Roles
```
super_admin  → IsSystem: true  → ALL permissions
admin        → IsSystem: true  → All except: settings.edit, roles.delete, replenishment.undo
member       → IsSystem: false → replenishment.*, replenishment_history.view, upload.*, clients.view
viewer       → IsSystem: false → replenishment.view, replenishment_history.view, clients.view
```

### 2C. Seed System Config
```
// Replenishment
partial_replenishment_visibility  boolean  true     replenishment
default_group_by                  enum     StyleNo  replenishment
random_pick_method                enum     random   replenishment

// Ranking
ranking_value_metric    enum     SaleValue  ranking   // SaleValue | Profit
ranking_value_weight    decimal  0.6        ranking
ranking_volume_weight   decimal  0.4        ranking
ranking_period          enum     all_time   ranking   // all_time | yearly | monthly

// System
otp_expiry_minutes          integer  10  system
close_to_expiry_default_days integer  7  system
temp_password_length         integer  12  system
```

---

## 3. New Library Files

### 3A. lib/rbac.ts
```typescript
// Check if a user has a specific permission
export async function hasPermission(
  userId: string,
  permissionKey: string
): Promise<boolean>

// Get all permission keys for a user
export async function getUserPermissions(userId: string): Promise<string[]>

// Middleware helper — throws 403 if permission missing
export async function requirePermission(
  userId: string,
  permissionKey: string
): Promise<void>
```

Usage in every API route:
```typescript
await requirePermission(userId, 'replenishment.confirm')
```

### 3B. lib/config.ts
```typescript
// Get a single config value (typed)
export async function getConfig(key: string): Promise<string>
export async function getConfigBool(key: string): Promise<boolean>
export async function getConfigInt(key: string): Promise<number>
export async function getConfigDecimal(key: string): Promise<number>

// Cache config in memory for 60s to avoid DB hit on every request
// Invalidate cache when admin updates a config value
```

### 3C. lib/rankings.ts
```typescript
// Main function — call this after ANY sales data change
export async function recalculateRankings(): Promise<void>

// Internal steps:
// 1. Read ranking_value_metric from system_config (SaleValue or Profit)
// 2. Read ranking_value_weight + ranking_volume_weight from system_config
// 3. Read ranking_period from system_config (all_time | yearly | monthly)
// 4. Group sales by ClientID → calc TotalPiecesSold, TotalValueSold, TotalProfit
// 5. Calc CombinedScore = (ValueMetric × value_weight) + (TotalPiecesSold × volume_weight)
// 6. RANK() clients by CombinedScore DESC → store Overall rank (StyleNo = NULL)
// 7. Repeat grouped by ClientID + StyleNo → store StyleNo ranks
// 8. Upsert into customer_rankings (update if exists, insert if new)
```

**Trigger points — call `recalculateRankings()` from:**
- `app/api/upload/route.ts` → after Sales Excel UPSERT completes
- `app/api/sales/route.ts` → after any future real-time sale API (future)
- `app/api/rankings/recalculate/route.ts` → manual admin trigger

---

## 4. Updated Replenishment V2 Logic

### 4A. Exclude Already-Replenished Items

Update `app/api/replenishment/v2/route.ts`:

```
Read partial_replenishment_visibility from system_config

IF true (default):
  Fetch sales WHERE client + date range
  EXCLUDE rows where (InvoiceNo + GroupField + GroupValue) 
  already exists in replenishments table with IsUndone = false

IF false:
  Fetch sales WHERE client + date range
  EXCLUDE entire InvoiceNo if ANY row for that InvoiceNo 
  exists in replenishments with IsUndone = false
```

### 4B. Smart Random Stock Pick (Warehouse)

Replace warehouse eye-button popup with inline pill buttons.

**API change** — warehouse items in response should return:
- Randomly selected StockNos — count = OverrideQty
- All available StockNos (for re-picking when OverrideQty changes)

**UI change** — `components/replenishment/StockPillGroup.tsx`:
- Show randomly picked StockNos as pill buttons (not a drawer)
- Each pill = green by default (selected)
- Click pill → toggles to grey (deselected)
- Click grey pill → back to green (reselected)
- When OverrideQty changes → re-pick randomly from available pool
- FactoryOrder recalculates based on selected green pills count
- Only green (selected) pills exported in PDF

```typescript
// Random pick logic (client-side after API response)
function pickRandom(available: string[], count: number): string[] {
  const shuffled = [...available].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, available.length))
}
```

### 4C. Pullback List — Sorted by Client Rank

Update pullback list in API response — sort by:
1. Overall Rank ASC (least performing client first — they get pulled from first)
2. Then StyleNo Rank ASC for same group value
3. Clients with no rank → pushed to bottom

```sql
ORDER BY 
  cr_overall.Rank ASC NULLS LAST,
  cr_style.Rank ASC NULLS LAST
```

Show rank badge per client in pullback drawer:
```
[Client Name]  Overall: #4  |  Style Rank: #2  |  Expiry: 12 Jan 2026
```

### 4D. Confirm Replenishment Flow

Add "Confirm Replenishment" button (requires `replenishment.confirm` permission).

On click:
1. Validate at least one StockNo is selected (green pill) per row
2. POST to `/api/replenishment/confirm`
3. Save one row per selected StockNo to `replenishments` table:
   - InvoiceNo, GroupField, GroupValue, StockNo, Type (warehouse/pullback)
   - ReplenishedBy = current user
4. On success → show success toast → "Export PDF" button activates
5. Export PDF only exports confirmed (green selected) StockNos

Permission check: `replenishment.confirm`

---

## 5. New API Routes

### POST /api/replenishment/confirm
- Body: `{ rows: [{ invoiceNo, groupField, groupValue, stockNos: [{ stockNo, type }] }] }`
- Permission: `replenishment.confirm`
- Saves to `replenishments` table
- Returns: `{ success: true, replenishmentIds: [...] }`

### POST /api/replenishment/undo
- Body: `{ replenishmentIds: string[] }`
- Permission: `replenishment.undo` (role-gated via RBAC)
- Sets `IsUndone = true`, `UndoneBy`, `UndoneAt`
- Returns: `{ success: true }`

### GET /api/replenishment/history
- Query params: `clientId?`, `fromDate?`, `toDate?`, `replenishedBy?`, `groupValue?`, `page`, `limit`
- Permission: `replenishment_history.view`
- Returns paginated replenishment history with undo button (if user has `replenishment.undo`)

### GET/POST/PATCH /api/roles
- GET: list all roles with their permissions — requires `roles.view`
- POST: create new role — requires `roles.create`
- PATCH: update role name/description or assign permissions — requires `roles.edit` or `roles.assign_permissions`
- DELETE: delete role (IsSystem = false only) — requires `roles.delete`

### GET/PATCH /api/settings
- GET: all system_config rows grouped by module — requires `settings.view`
- PATCH: update a config value — requires `settings.edit`
- On update → invalidate config cache in `lib/config.ts`
- If ranking weight/metric/period changes → trigger `recalculateRankings()`

### POST /api/rankings/recalculate
- Permission: `rankings.recalculate`
- Calls `lib/rankings.ts → recalculateRankings()`
- Returns: `{ success: true, calculatedAt: timestamp }`

---

## 6. New Screens

### 6A. Roles Management Screen
**Route:** `/roles`
**Permission:** `roles.view`
**Sidebar:** Admin only

**Layout:**
- Left panel: list of all roles with role name, description, user count, IsSystem badge
- "Create Role" button (requires `roles.create`)
- Right panel: selected role's permissions — grouped by module
- Checkboxes per permission key — toggle to assign/remove (requires `roles.assign_permissions`)
- Cannot edit or delete IsSystem roles (super_admin, admin)
- Each role shows: how many users have this role

### 6B. Settings Screen (Master Config)
**Route:** `/settings`
**Permission:** `settings.view` to view, `settings.edit` to change
**Sidebar:** Admin only

**Layout — Tabbed by Module:**

**Tab 1 — Replenishment**
- Partial replenishment visibility (toggle)
- Default group by (dropdown: StyleNo / ProductType / StoneShape / Metal / MetalType / ProductStyle)
- Random pick method (dropdown: Random / FIFO / Oldest Memo First)

**Tab 2 — Ranking**
- Value metric (dropdown: SaleValue / Profit)
- Value weight (number input: 0.0 – 1.0)
- Volume weight (number input: 0.0 – 1.0, auto = 1 - value_weight)
- Ranking period (dropdown: All Time / Yearly / Monthly)
- "Recalculate Rankings Now" button (requires `rankings.recalculate`)
- Last calculated timestamp shown

**Tab 3 — Permissions**
- Which role can undo replenishment (role dropdown)
- Which role can export PDF (role dropdown)
- Which role can upload Excel (role dropdown)
- Which role can manage clients (role dropdown)

**Tab 4 — System**
- OTP expiry minutes (number input)
- Default close to expiry days (number input)
- Temp password length (number input)

All fields auto-save on change with a debounce of 1 second. Show "Saved" confirmation.

### 6C. Replenishment History Screen
**Route:** `/replenishment-history`
**Permission:** `replenishment_history.view`
**Sidebar:** Visible to all roles with permission

**Layout:**
- Filter bar: Client Name, From Date, To Date, Replenished By (user dropdown), Group Value search
- Results table:
  - InvoiceNo | Group Field | Group Value | StockNo | Type | Replenished By | Replenished At | Status
  - Status: Active (green) | Undone (red strikethrough)
- "Undo" button per row (visible only if user has `replenishment.undo` permission)
- Undo confirmation modal before action

---

## 7. Navigation Updates

Add to `components/layout/DashboardSidebar.tsx`:

| Route | Label | Permission Required |
|---|---|---|
| `/replenishment-history` | Replenishment History | `replenishment_history.view` |
| `/roles` | Roles & Permissions | `roles.view` |
| `/settings` | Settings | `settings.view` |

Hide nav items if user lacks the required permission — check on client side using permissions loaded at login and stored in JWT or session.

---

## 8. JWT Update

Include user permissions in JWT payload (or load on session init):
```typescript
{
  userId: string,
  username: string,
  roleId: string,
  roleName: string,
  permissions: string[]   // array of permission keys
}
```

This avoids a DB hit on every permission check for UI show/hide.
API routes still call `lib/rbac.ts` for server-side enforcement (never trust client).

---

## 9. Build Order for These Changes

1. Add `SaleValue` + `CRAmount` to sales schema → migrate → update excel mapping
2. Add RBAC tables (roles, permissions, role_permissions) → migrate
3. Update users table (RoleID FK) → migrate
4. Add replenishments + customer_rankings + system_config tables → migrate
5. Write `prisma/seed.ts` → seed permissions + default roles + system config
6. Write `lib/rbac.ts` → permission checking helpers
7. Write `lib/config.ts` → config reading with cache
8. Update all existing API routes → add `requirePermission()` checks
9. Write `lib/rankings.ts` → recalculation function
10. Trigger rankings recalculation from upload route (after sales upload)
11. Write `POST /api/rankings/recalculate` route
12. Write `GET/PATCH /api/settings` route
13. Write `GET/POST/PATCH /api/roles` route
14. Update replenishment V2 API → exclude replenished items + sort pullback by rank
15. Update replenishment V2 UI → smart random pick pills + toggle selection
16. Write `POST /api/replenishment/confirm` route
17. Write `POST /api/replenishment/undo` route
18. Write `GET /api/replenishment/history` route
19. Build Roles Management screen (`/roles`)
20. Build Settings screen (`/settings`)
21. Build Replenishment History screen (`/replenishment-history`)
22. Update JWT to include permissions
23. Update sidebar → permission-gated nav items
24. Update PROGRESS.md

---

## 10. What Does NOT Change

- All existing auth flows
- Excel upload flow (only adding 2 new mappable fields)
- Client Master screen
- User Management screen (only role assignment dropdown changes — now pulls from roles table)
- Existing replenishment V2 search + group by logic
- Database connection setup (lib/db.ts)
