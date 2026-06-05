# DVJ ERP — Database Schema

Extracted from `prisma/schema.prisma`. All tables use PostgreSQL via Prisma + `@prisma/adapter-pg`.

---

## Table index

| Model | Table | Purpose |
|-------|-------|---------|
| `users` | `users` | App users with JWT auth, role FK, OTP support |
| `roles` | `roles` | Named roles; system roles cannot be deleted |
| `permissions` | `permissions` | Permission keys grouped by module |
| `role_permissions` | `role_permissions` | Junction: which permissions a role has |
| `clients` | `clients` | Party (client) master with memo/ranking relations |
| `stock` | `stock` | Inventory items uploaded from Excel |
| `memo` | `memo` | Memo (consignment) headers |
| `memo_stock` | `memo_stock` | Junction: which stock lines belong to a memo |
| `sales` | `sales` | Invoice lines uploaded from sales Excel |
| `excel_mappings` | `excel_mappings` | Saved column → DB field mappings per report type |
| `replenishments` | `replenishments` | Confirmed replenishment records (one row per invoice × stock) |
| `customer_rankings` | `customer_rankings` | Pre-computed client ranking scores (overall + per-style) |
| `system_config` | `system_config` | Admin-editable key/value config with typed parsing |

---

## users

```prisma
model users {
  UserID       String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  Username     String    @unique @db.VarChar
  Email        String    @unique @db.VarChar
  PasswordHash String    @db.VarChar
  FirstName    String    @db.VarChar
  LastName     String    @db.VarChar
  Role         String    @db.VarChar          // legacy string role (kept alongside RoleID)
  RoleID       String?   @db.Uuid             // FK → roles.RoleID
  IsFirstLogin Boolean   @default(true)
  IsActive     Boolean   @default(true)
  OtpHash      String?   @db.VarChar
  OtpExpiresAt DateTime? @db.Timestamp(6)
  CreatedAt    DateTime  @default(now()) @db.Timestamp(6)
  ModifiedAt   DateTime  @default(now()) @db.Timestamp(6)
  ModifiedByID String?   @db.Uuid

  ModifiedByUser   users?           @relation("UserModifiedBy", fields: [ModifiedByID], references: [UserID], onDelete: SetNull)
  ModifiedUsers    users[]          @relation("UserModifiedBy")
  UserRole         roles?           @relation("UserRole", fields: [RoleID], references: [RoleID], onDelete: SetNull)
  ReplenishedItems replenishments[] @relation("ReplenishedByUser")
  UndoneItems      replenishments[] @relation("UndoneByUser")

  @@index([Role])
  @@index([RoleID])
  @@map("users")
}
```

---

## roles

```prisma
model roles {
  RoleID      String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  RoleName    String             @unique @db.VarChar
  Description String?            @db.VarChar
  IsSystem    Boolean            @default(false)   // true = cannot be deleted via API
  CreatedAt   DateTime           @default(now()) @db.Timestamp(6)
  CreatedByID String?            @db.Uuid

  Users       users[]            @relation("UserRole")
  Permissions role_permissions[]

  @@map("roles")
}
```

Seeded system roles: `super_admin`, `admin`, `member`, `viewer`.

---

## permissions

```prisma
model permissions {
  PermissionID  String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  PermissionKey String             @unique @db.VarChar   // e.g. 'replenishment.confirm'
  Description   String?            @db.VarChar
  Module        String             @db.VarChar           // e.g. 'replenishment', 'roles'

  Roles role_permissions[]

  @@map("permissions")
}
```

All 30 permission keys are seeded in `prisma/seed.ts`. Modules: `users`, `roles`, `replenishment`, `replenishment_history`, `upload`, `excel_config`, `clients`, `settings`, `rankings`.

---

## role_permissions

```prisma
model role_permissions {
  RoleID       String      @db.Uuid
  PermissionID String      @db.Uuid

  Role       roles       @relation(fields: [RoleID],       references: [RoleID],       onDelete: Cascade)
  Permission permissions @relation(fields: [PermissionID], references: [PermissionID], onDelete: Cascade)

  @@id([RoleID, PermissionID])
  @@map("role_permissions")
}
```

---

## clients

```prisma
model clients {
  ClientID           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  PartyCode          String?   @unique @db.VarChar
  PartyName          String    @db.VarChar
  CloseToExpiryDays  Int       @default(7)
  IsStockPullAllowed Boolean   @default(true)
  OverallRank        Int?                         // global rank among all clients; set by recalculateRankings()
  OverallScore       Decimal?  @db.Decimal(14, 4) // combined score used to derive OverallRank
  LastRankedAt       DateTime? @db.Timestamp(6)   // timestamp of the most recent ranking run
  CreatedAt          DateTime  @default(now()) @db.Timestamp(6)

  Memos    memo[]
  Rankings customer_rankings[]

  @@index([PartyName])
  @@index([OverallRank])
  @@map("clients")
}
```

---

## stock

```prisma
model stock {
  StockID            String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  StockNo            String       @unique @db.VarChar
  StockType          String?      @db.VarChar
  ProductDescription String?      @db.VarChar
  ProductType        String?      @db.VarChar
  ProductStyle       String?      @db.VarChar
  StoneShape         String?      @db.VarChar
  Metal              String?      @db.VarChar
  StonePCs           Decimal?     @db.Decimal(12, 3)
  StoneWT            Decimal?     @db.Decimal(12, 3)
  MetalType          String?      @db.VarChar
  MetalWT            Decimal?     @db.Decimal(12, 3)
  StyleNo            String?      @db.VarChar
  BoxCode            String?      @db.VarChar
  Location           String?      @db.VarChar
  HoldDate           DateTime?    @db.Date
  HoldLocation       String?      @db.VarChar
  HoldNarration      String?      @db.VarChar
  UploadedAt         DateTime     @default(now()) @db.Timestamp(6)

  MemoStockLinks memo_stock[]
  PrimaryMemo    memo?        @relation("MemoPerStock")
  Sales          sales[]

  @@index([StyleNo])
  @@index([StoneShape])
  @@index([Metal])
  @@index([MetalType])
  @@map("stock")
}
```

---

## memo

```prisma
model memo {
  MemoID        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  MemoNo        String       @unique @db.VarChar
  MemoDate      DateTime     @db.Date
  Terms         Int
  MemoEndDate   DateTime     @db.Date
  MemoNarration String?      @db.VarChar
  ClientID      String?      @db.Uuid
  // When set, this memo row is keyed 1:1 to a stock line (imports with no MemoNo in Excel).
  StockNo       String?      @unique @db.VarChar
  IsActive      Boolean      @default(true)
  CreatedAt     DateTime     @default(now()) @db.Timestamp(6)

  Client         clients?     @relation(fields: [ClientID], references: [ClientID], onDelete: SetNull)
  Stock          stock?       @relation("MemoPerStock", fields: [StockNo], references: [StockNo], onDelete: SetNull)
  MemoStockLinks memo_stock[]
  Sales          sales[]

  @@map("memo")
}
```

---

## memo_stock

```prisma
model memo_stock {
  MemoStockID String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  MemoID      String?  @db.Uuid
  StockNo     String?  @db.VarChar
  AddedAt     DateTime @default(now()) @db.Timestamp(6)

  Memo  memo?  @relation(fields: [MemoID],  references: [MemoID],  onDelete: Cascade)
  Stock stock? @relation(fields: [StockNo], references: [StockNo], onDelete: Cascade)

  @@index([MemoID])
  @@index([StockNo])
  @@map("memo_stock")
}
```

---

## sales

```prisma
model sales {
  SalesID       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  InvoiceNo     String   @db.VarChar
  InvoiceDate   DateTime @db.Date
  PartyCode     String?  @db.VarChar
  PartyName     String?  @db.VarChar
  Department    String?  @db.VarChar
  StockNo       String?  @db.VarChar
  // Denormalized from `stock` (or sales file mapping) for reporting without joins.
  StyleNo       String?  @db.VarChar
  STShapes      String?  @db.VarChar
  ProductType   String?  @db.VarChar
  Metal         String?  @db.VarChar
  StonePcs      Decimal? @db.Decimal(12, 3)
  StoneWT       Decimal? @db.Decimal(12, 3)
  MetalType     String?  @db.VarChar
  MetalWT       Decimal? @db.Decimal(12, 3)
  Size          String?  @db.VarChar
  Remarks       String?  @db.VarChar
  RestockNeeded Boolean  @default(false)
  RestockType   String?  @db.VarChar
  SaleValue     Decimal? @db.Decimal(12, 2)   // what the client paid
  CRAmount      Decimal? @db.Decimal(12, 2)   // cost of making (used for profit = SaleValue - CRAmount)
  MemoID        String?  @db.Uuid
  UploadedAt    DateTime @default(now()) @db.Timestamp(6)

  Memo  memo?  @relation(fields: [MemoID],  references: [MemoID],  onDelete: SetNull)
  Stock stock? @relation(fields: [StockNo], references: [StockNo], onDelete: SetNull)

  @@unique([InvoiceNo, StockNo])
  @@index([StockNo])
  @@index([PartyCode])
  @@index([StyleNo])
  @@map("sales")
}
```

---

## excel_mappings

```prisma
model excel_mappings {
  MappingID          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ReportType         String    @db.VarChar        // 'stock' | 'sales'
  Mapping            Json                         // { excelHeader: dbField, ... }
  UpdatedAt          DateTime  @default(now()) @db.Timestamp(6)
  LastImportAt       DateTime? @db.Timestamp(6)
  LastImportInserted Int?
  LastImportUpdated  Int?

  @@unique([ReportType])
  @@map("excel_mappings")
}
```

---

## replenishments

```prisma
model replenishments {
  ReplenishmentID String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  InvoiceNo       String    @db.VarChar
  GroupField      String    @db.VarChar    // e.g. 'StyleNo'
  GroupValue      String    @db.VarChar    // e.g. '3333'
  StockNo         String    @db.VarChar
  Type            String    @db.VarChar    // 'warehouse' | 'pullback'
  ReplenishedBy   String    @db.Uuid
  ReplenishedAt   DateTime  @default(now()) @db.Timestamp(6)
  IsUndone        Boolean   @default(false)
  UndoneBy        String?   @db.Uuid
  UndoneAt        DateTime? @db.Timestamp(6)

  ReplenishedByUser users  @relation("ReplenishedByUser", fields: [ReplenishedBy], references: [UserID])
  UndoneByUser      users? @relation("UndoneByUser",      fields: [UndoneBy],      references: [UserID])

  @@index([InvoiceNo])
  @@index([GroupValue])
  @@index([StockNo])
  @@map("replenishments")
}
```

One row saved per (InvoiceNo × StockNo) combination when a replenishment is confirmed. Undo sets `IsUndone = true` rather than deleting.

---

## customer_rankings

```prisma
model customer_rankings {
  RankingID        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ClientID         String   @db.Uuid
  // Every row has a non-null StyleNo. Overall rank now lives on clients.OverallRank.
  StyleNo          String   @db.VarChar
  TotalPiecesSold  Int      @default(0)
  TotalValueSold   Decimal  @default(0) @db.Decimal(14, 2)
  TotalProfit      Decimal  @default(0) @db.Decimal(14, 2)   // SaleValue - CRAmount
  CombinedScore    Decimal  @default(0) @db.Decimal(14, 4)
  // Rank among clients within this StyleNo; assigned by RANK() OVER (PARTITION BY StyleNo ORDER BY CombinedScore DESC).
  StyleRank        Int?
  LastCalculatedAt DateTime @default(now()) @db.Timestamp(6)

  Client clients @relation(fields: [ClientID], references: [ClientID], onDelete: Cascade)

  @@unique([ClientID, StyleNo])
  @@index([ClientID])
  @@index([StyleNo])
  @@index([StyleRank])
  @@map("customer_rankings")
}
```

Populated and refreshed by `lib/rankings.ts → recalculateRankings()` after every sales upload or manual trigger (`POST /api/rankings/recalculate`).

**Architecture (after migration `20260501000000_ranking_refactor_overall_to_clients`):**
- **Overall rank** (`OverallRank`, `OverallScore`, `LastRankedAt`) is a first-class attribute of each `clients` row. Updated in-place by `recalculateRankings()`.
- **Style rank** (`StyleRank`) is stored here, one row per `(ClientID, StyleNo)`. Clients ranked within each style by `RANK() OVER (PARTITION BY StyleNo ORDER BY CombinedScore DESC)`.
- No `NULL`-StyleNo rows exist in this table any more. The partial unique index `ON (ClientID) WHERE StyleNo IS NULL` is unused but harmless.
- Replenishment V2 reads `OverallRank` directly from the `clients` join (no extra query) and `StyleRank` from this table.

---

## system_config

```prisma
model system_config {
  ConfigID    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ConfigKey   String   @unique @db.VarChar
  ConfigValue String   @db.Text
  ConfigType  String   @db.VarChar    // 'boolean' | 'integer' | 'decimal' | 'enum' | 'string'
  Description String?  @db.VarChar
  Module      String   @db.VarChar    // 'replenishment' | 'ranking' | 'permissions' | 'system'
  UpdatedAt   DateTime @default(now()) @db.Timestamp(6)
  UpdatedByID String?  @db.Uuid

  @@map("system_config")
}
```

Read via `lib/config.ts` with 60s in-memory cache. Invalidated by `PATCH /api/settings`. Seeded defaults:

| ConfigKey | Type | Default | Module |
|-----------|------|---------|--------|
| `partial_replenishment_visibility` | boolean | `true` | replenishment |
| `default_group_by` | enum | `StyleNo` | replenishment |
| `random_pick_method` | enum | `random` | replenishment |
| `ranking_value_metric` | enum | `SaleValue` | ranking |
| `ranking_value_weight` | decimal | `0.6` | ranking |
| `ranking_volume_weight` | decimal | `0.4` | ranking |
| `ranking_period` | enum | `all_time` | ranking |
| `ranking_last_calculated` | string | `` | ranking |
| `perm_undo_replenishment` | string | _(role id)_ | permissions |
| `perm_export_pdf` | string | _(role id)_ | permissions |
| `perm_upload_excel` | string | _(role id)_ | permissions |
| `perm_manage_clients` | string | _(role id)_ | permissions |
| `otp_expiry_minutes` | integer | `10` | system |
| `close_to_expiry_default_days` | integer | `7` | system |
| `temp_password_length` | integer | `12` | system |
