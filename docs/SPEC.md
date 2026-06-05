# Replenishment Decision Engine — Full Project Spec
        
## Overview

A standalone internal web tool for a jewelry business to automate the stock replenishment decision process. When a client's memo converts to an invoice and they request restocking, the team currently spends 15 minutes per case manually cross-referencing spreadsheets and ERP reports. This tool eliminates that by centralizing all data and calculating replenishment options automatically.

**Scale:** 10–15 cases/day now, growing to 60–70/day soon.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router) + TypeScript |
| Backend | Next.js API Routes + TypeScript |
| Database | PostgreSQL on NeonDB (free tier → migrate if data grows) |
| ORM | Prisma |
| Auth | JWT (jose or next-auth) |
| Email | Nodemailer (SMTP for dev) → Resend (production) |
| Excel Parsing | xlsx (SheetJS) |
| Styling | Tailwind CSS |

---

## Environment Variables

```env
DATABASE_URL=
JWT_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ALLOWED_EMAIL_DOMAIN=   # e.g. yourcompany.com
```

---

## Database Schema - Generate SQL File to create DB and These Tables

### Stock States (derived — never stored as a column)
A stock piece has one of 4 states, calculated at query time:
- **In Warehouse** → no active memo, HoldDate is NULL, not in sales
- **On Hold** → HoldDate is NOT NULL (internal reservation)
- **On Memo** → linked to an active memo (IsActive = TRUE) in memo_stock
- **Sold** → StockNo appears in sales table

```sql
CASE
  WHEN s.StockNo IN (SELECT StockNo FROM sales)                           THEN 'Sold'
  WHEN s.StockNo IN (
    SELECT ms.StockNo FROM memo_stock ms
    JOIN memo m ON ms.MemoID = m.MemoID
    WHERE m.IsActive = TRUE
  )                                                                        THEN 'On Memo'
  WHEN s.HoldDate IS NOT NULL                                              THEN 'On Hold'
  ELSE                                                                          'In Warehouse'
END AS StockStatus
```

---

### Table: users
```sql
UserID          UUID PRIMARY KEY DEFAULT gen_random_uuid()
Username        VARCHAR UNIQUE NOT NULL
Email           VARCHAR UNIQUE NOT NULL
PasswordHash    VARCHAR NOT NULL
FirstName       VARCHAR NOT NULL
LastName        VARCHAR NOT NULL
Role            VARCHAR NOT NULL CHECK (Role IN ('admin', 'member'))
IsFirstLogin    BOOLEAN DEFAULT TRUE
IsActive        BOOLEAN DEFAULT TRUE
OtpHash         VARCHAR
OtpExpiresAt    TIMESTAMP
CreatedAt       TIMESTAMP DEFAULT NOW()
ModifiedAt      TIMESTAMP DEFAULT NOW()
ModifiedByID    UUID REFERENCES users(UserID)
```

---

### Table: clients
```sql
ClientID              UUID PRIMARY KEY DEFAULT gen_random_uuid()
PartyCode             VARCHAR UNIQUE          -- from ERP / Sales report
PartyName             VARCHAR NOT NULL
CloseToExpiryDays     INTEGER DEFAULT 7
IsStockPullAllowed    BOOLEAN DEFAULT TRUE
CreatedAt             TIMESTAMP DEFAULT NOW()
```

**Population logic:** On every Stock/Sales upload, extract unique client names + party codes. If not in clients table → insert with defaults. Never duplicate.

---

### Table: stock
```sql
StockID             UUID PRIMARY KEY DEFAULT gen_random_uuid()
StockNo             VARCHAR UNIQUE NOT NULL   -- unique piece identifier from Excel
StockType           VARCHAR
ProductDescription  VARCHAR
ProductType         VARCHAR
ProductStyle        VARCHAR
StoneShape          VARCHAR
Metal               VARCHAR
StonePCs            DECIMAL
StoneWT             DECIMAL
MetalType           VARCHAR
MetalWT             DECIMAL
StyleNo             VARCHAR
BoxCode             VARCHAR
Location            VARCHAR
HoldDate            DATE                      -- if set → piece is On Hold
HoldLocation        VARCHAR
HoldNarration       VARCHAR
UploadedAt          TIMESTAMP DEFAULT NOW()
```

---

### Table: memo
```sql
MemoID          UUID PRIMARY KEY DEFAULT gen_random_uuid()
MemoNo          VARCHAR UNIQUE NOT NULL
MemoDate        DATE NOT NULL
MemoEndDate     DATE GENERATED ALWAYS AS (MemoDate + Terms * INTERVAL '1 day') STORED
Terms           INTEGER NOT NULL              -- number of days
MemoNarration   VARCHAR
ClientID        UUID REFERENCES clients(ClientID)
IsActive        BOOLEAN DEFAULT TRUE
CreatedAt       TIMESTAMP DEFAULT NOW()
```

---

### Table: memo_stock (Junction — one memo can have many pieces)
```sql
MemoStockID     UUID PRIMARY KEY DEFAULT gen_random_uuid()
MemoID          UUID REFERENCES memo(MemoID)
StockNo         VARCHAR REFERENCES stock(StockNo)
AddedAt         TIMESTAMP DEFAULT NOW()
```

---

### Table: sales
```sql
SalesID         UUID PRIMARY KEY DEFAULT gen_random_uuid()
InvoiceNo       VARCHAR NOT NULL
InvoiceDate     DATE NOT NULL
PartyCode       VARCHAR REFERENCES clients(PartyCode)
PartyName       VARCHAR
Department      VARCHAR
StockNo         VARCHAR REFERENCES stock(StockNo)   -- STNo = StockNo
STShapes        VARCHAR
ProductType     VARCHAR
Metal           VARCHAR
StonePCs        DECIMAL
StoneWT         DECIMAL
MetalType       VARCHAR
MetalWT         DECIMAL
Size            VARCHAR
Remarks         VARCHAR
RestockNeeded   BOOLEAN DEFAULT FALSE
RestockType     VARCHAR CHECK (RestockType IN ('same', 'different', null))
MemoID          UUID REFERENCES memo(MemoID)        -- which memo converted to this invoice
UploadedAt      TIMESTAMP DEFAULT NOW()
```

**Dedup logic:** Skip row if `InvoiceNo` + `StockNo` combo already exists in DB.

---

### Table: excel_mappings
```sql
MappingID       UUID PRIMARY KEY DEFAULT gen_random_uuid()
ReportType      VARCHAR NOT NULL CHECK (ReportType IN ('stock', 'sales'))
Mapping         JSONB NOT NULL               -- { "ExcelColumnHeader": "db_field", ... }
UpdatedAt       TIMESTAMP DEFAULT NOW()
```

---

### Indexes (add after migration)
```sql
CREATE INDEX idx_stock_styleno      ON stock(StyleNo);
CREATE INDEX idx_stock_stoneshape   ON stock(StoneShape);
CREATE INDEX idx_stock_metal        ON stock(Metal);
CREATE INDEX idx_stock_metaltype    ON stock(MetalType);
CREATE INDEX idx_memo_stock_memoid  ON memo_stock(MemoID);
CREATE INDEX idx_memo_stock_stockno ON memo_stock(StockNo);
CREATE INDEX idx_sales_stockno      ON sales(StockNo);
CREATE INDEX idx_sales_partycode    ON sales(PartyCode);
```

---

## Roles & Permissions

| Permission | admin | member |
|---|---|---|
| Login | ✅ | ✅ |
| Replenishment Screen | ✅ | ✅ |
| Client Master Screen | ✅ | ✅ |
| Upload Excel | ✅ | ✅ |
| Excel Map Configuration | ✅ | ❌ |
| User Management Screen | ✅ | ❌ |

---

## Auth Flows

### Login
- User enters email + password
- Validate email domain matches `ALLOWED_EMAIL_DOMAIN`
- On success → check `is_first_login`
  - If TRUE → redirect to Force Password Change screen
  - If FALSE → redirect to Replenishment Screen
- Issue JWT stored in httpOnly cookie

### Invite User (Admin only)
- Admin enters new user's email on User Management screen
- System validates email domain
- Generates username + 12-char temp password
- Creates user in DB with `is_first_login = TRUE`
- Sends email with username + temp password via SMTP

### Force Password Change (First Login)
- User must set a new password before accessing any screen
- Password must differ from temp password
- On save → set `is_first_login = FALSE` → redirect to Replenishment Screen

### Forgot Password — OTP Flow
1. User clicks "Forgot Password" on Login screen
2. Enters registered email
3. System generates 6-digit OTP, stores hashed OTP + expiry (10 min) against user
4. Sends OTP to email via SMTP
5. User enters OTP
6. On valid OTP → show New Password screen
7. On save → clear OTP, update password → redirect to Login
- OTP expires after 10 minutes
- OTP is single-use (invalidated after first correct use)

---

## Screens

---

### 1. Login Screen
**Route:** `/login`
**Access:** Public

**Elements:**
- Email input
- Password input
- "Forgot Password?" link → `/forgot-password`
- Login button

**Validation:**
- Email must match `ALLOWED_EMAIL_DOMAIN`
- Show error on invalid credentials

---

### 2. Forgot Password — Enter Email
**Route:** `/forgot-password`
**Access:** Public

**Elements:**
- Email input
- "Send OTP" button
- Back to Login link

---

### 3. Forgot Password — Enter OTP
**Route:** `/forgot-password/otp`
**Access:** Public (session-bound to previous step)

**Elements:**
- 6-digit OTP input (individual boxes)
- "Verify" button
- "Resend OTP" link (re-triggers email, resets timer)
- Countdown timer showing OTP expiry

---

### 4. Forgot Password — New Password
**Route:** `/forgot-password/reset`
**Access:** Public (session-bound, only reachable after valid OTP)

**Elements:**
- New password input
- Confirm password input
- "Save Password" button

---

### 5. Force Password Change
**Route:** `/change-password`
**Access:** Authenticated users with `is_first_login = TRUE`

**Elements:**
- New password input
- Confirm password input
- "Set Password" button

**Behavior:**
- Middleware redirects to this screen if `is_first_login = TRUE`
- Cannot skip or navigate away

---

### 6. Replenishment Screen
**Route:** `/`
**Access:** Admin + Member

**Layout:**
- Top bar: App name/logo, Upload Excel button (top right), user avatar/logout
- Filter bar below top bar
- Results section

**Filter Bar:**
- Style No (`StyleNo`) — typeahead search input (queries DB as user types, shows suggestions)
- Stone Shape (`StoneShape`) — dropdown
- Metal (`Metal`) — dropdown
- Metal Type (`MetalType`) — dropdown
- Product Type (`ProductType`) — dropdown
- Product Style (`ProductStyle`) — dropdown
- Required Quantity — number input (required for calculation)
- "Search" button

**Results Section (shown after search):**
Three metric cards displayed horizontally:

**Card 1 — In Stock ✅**
- Count of StockIDs matching filters where no active memo exists
- Eye icon button → opens drawer/modal listing individual StockIDs

**Card 2 — Available via Pullback 🔄**
- Count of StockIDs on active memo where:
  - Client `is_stock_pull_allowed = TRUE`
  - Memo expiry date is within client's `close_to_expiry_days` from today
  - (memo_end_date or memo_start_date + terms_days) <= today + close_to_expiry_days
- Eye icon button → opens drawer/modal listing StockIDs with client name, expiry date

**Card 3 — Needs Factory Order 🏭**
- `MAX(0, Required_Quantity - In_Stock - Pullback_Available)`
- Eye icon not applicable here — just the number

**Excel Upload Popup (triggered by Upload Excel button):**
- Step 1: Select report type → "Stock Report" or "Sales Report"
- Step 2: File picker for .xlsx / .xls / .csv
- Step 3: On upload → apply saved mapping for selected report type
  - If mapping not configured → show error "Please configure mapping in Excel Map Configuration first"
  - If column mismatch → show error listing which expected columns are missing
  - If success → show "X records inserted, Y duplicates skipped"
- Dedup logic:
  - Stock: skip if `StockNo` already exists in DB
  - Sales: skip if `InvoiceNo` + `StockNo` combo already exists in DB

---

### 7. Excel Map Configuration
**Route:** `/excel-config`
**Access:** Admin only

**Layout:**
- Two tabs: "Stock Report Mapping" | "Sales Report Mapping"
- Each tab:
  - Upload a sample Excel file to auto-detect column headers
  - Left column: detected Excel headers
  - Right column: dropdown mapping to DB field
  - "Save Mapping" button
  - Shows last saved date

**DB fields to map for Stock Report:**
`StockNo`, `StockType`, `ProductDescription`, `ProductType`, `ProductStyle`, `StoneShape`, `Metal`, `StonePCs`, `StoneWT`, `MetalType`, `MetalWT`, `StyleNo`, `BoxCode`, `Location`, `HoldDate`, `HoldLocation`, `HoldNarration`, `Company` (client name → used to create memo record), `MemoNo`, `MemoDate`, `Terms`

> Note: If `Company` is present in a stock row, the row is treated as "On Memo" — a memo record and memo_stock record are created. If `Company` is empty and `HoldDate` is empty → piece is "In Warehouse". If `HoldDate` is set → piece is "On Hold".

**DB fields to map for Sales Report:**
`InvoiceNo`, `InvoiceDate`, `PartyCode`, `PartyName`, `Department`, `StockNo`, `STShapes`, `ProductType`, `Metal`, `StonePCs`, `StoneWT`, `MetalType`, `MetalWT`, `Size`, `Remarks`, `RestockNeeded`, `RestockType`

---

### 8. Client Master Screen
**Route:** `/clients`
**Access:** Admin + Member

**Layout:**
- Search bar (filter by client name)
- Table of all clients with inline editing:
  - Client Name (read-only — auto-populated from uploads)
  - Close to Expiry Days (number input, editable)
  - Is Stock Pull Allowed (Yes/No toggle, editable)
- Auto-save on change or explicit Save button per row

**Client population logic:**
- On every Stock/Sales report upload, extract all unique client names
- If client name not in `clients` table → insert with defaults (`close_to_expiry_days = 7`, `is_stock_pull_allowed = TRUE`)
- Never duplicate

---

### 9. User Management Screen
**Route:** `/users`
**Access:** Admin only

**Layout:**
- Table of all users:
  - Username, Email, Role, Status (Active/Inactive), Date Added
- "Invite User" button → inline form or modal:
  - Email input
  - Role selector (Admin / Member)
  - "Send Invite" button
- Per user row actions:
  - Change role
  - Deactivate / Reactivate account

---

## Key Business Logic

### Replenishment Calculation
```
filters = { StyleNo, StoneShape, Metal, MetalType, ProductType, ProductStyle }
RequiredQty = user input (required field)

IN_WAREHOUSE =
  SELECT COUNT(*) FROM stock s
  WHERE [filters apply]
  AND s.HoldDate IS NULL
  AND s.StockNo NOT IN (SELECT StockNo FROM sales)
  AND s.StockNo NOT IN (
    SELECT ms.StockNo FROM memo_stock ms
    JOIN memo m ON ms.MemoID = m.MemoID
    WHERE m.IsActive = TRUE
  )

PULLBACK_AVAILABLE =
  SELECT COUNT(*) FROM stock s
  JOIN memo_stock ms ON s.StockNo = ms.StockNo
  JOIN memo m ON ms.MemoID = m.MemoID
  JOIN clients c ON m.ClientID = c.ClientID
  WHERE [filters apply]
  AND m.IsActive = TRUE
  AND c.IsStockPullAllowed = TRUE
  AND m.MemoEndDate <= CURRENT_DATE + c.CloseToExpiryDays

FACTORY_ORDER = GREATEST(0, RequiredQty - IN_WAREHOUSE - PULLBACK_AVAILABLE)
```

Eye button on In Warehouse card → list of StockNo, StockType, Location
Eye button on Pullback card → list of StockNo, PartyName, MemoNo, MemoEndDate

### OTP Storage
- Store `otp_hash` (bcrypt), `otp_expires_at` as columns on `users` table
- Clear both after successful password reset

### Password Rules
- Minimum 8 characters
- Must contain at least one number and one letter
- New password cannot match temp/old password

---

## Folder Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── forgot-password/otp/page.tsx
│   │   ├── forgot-password/reset/page.tsx
│   │   └── change-password/page.tsx
│   ├── (dashboard)/
│   │   ├── page.tsx                  ← Replenishment Screen
│   │   ├── clients/page.tsx
│   │   ├── excel-config/page.tsx
│   │   └── users/page.tsx
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   ├── forgot-password/route.ts
│       │   ├── verify-otp/route.ts
│       │   ├── reset-password/route.ts
│       │   └── change-password/route.ts
│       ├── replenishment/
│       │   └── calculate/route.ts
│       ├── upload/
│       │   └── route.ts
│       ├── excel-config/
│       │   └── route.ts
│       ├── clients/
│       │   └── route.ts
│       └── users/
│           └── route.ts
├── components/
│   ├── auth/
│   ├── replenishment/
│   │   ├── FilterBar.tsx
│   │   ├── MetricCard.tsx
│   │   ├── StockDrawer.tsx
│   │   └── UploadModal.tsx
│   ├── clients/
│   ├── users/
│   └── ui/                           ← shared components
├── lib/
│   ├── db.ts                         ← Prisma client
│   ├── auth.ts                       ← JWT helpers
│   ├── email.ts                      ← Nodemailer / SMTP
│   ├── excel.ts                      ← SheetJS parsing helpers
│   └── replenishment.ts              ← calculation logic
├── middleware.ts                     ← route protection + first login redirect
├── prisma/
│   └── schema.prisma
└── .env.local
```

---

## Middleware Behavior

```
/login, /forgot-password/*  → public, redirect to / if already logged in
/change-password            → only if authenticated + is_first_login = TRUE
/excel-config, /users       → admin only, redirect to / if member
/*                          → authenticated only, redirect to /login if not
```

---

## Build Order (Recommended)

1. PostgreSQL setup + Prisma schema + migrations
2. Auth — login, JWT middleware, route protection
3. Invite user flow + SMTP email
4. Forgot password OTP flow
5. Force password change flow
6. Excel Map Configuration screen + API
7. Excel upload + dedup engine (Stock Report)
8. Excel upload + dedup engine (Sales Report)
9. Client Master screen — auto-population + editing
10. Replenishment Screen — filters + calculation + metric cards + eye drawers
11. User Management screen

---

## Notes for Claude Code

- Use Prisma for all DB access — no raw SQL except where noted in calculation logic
- All API routes must validate JWT and check role before processing
- The replenishment calculation query can use raw SQL via `prisma.$queryRaw` for performance
- Excel upload should process entirely server-side — never expose raw file to client after upload
- All passwords must be hashed with bcrypt (salt rounds: 12)
- OTPs must be hashed before storing — never store plaintext OTP
- Use Zod for all API input validation
- Tailwind CSS for all styling — no CSS modules or styled-components