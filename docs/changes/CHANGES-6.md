# CHANGES-6.md — Stock Logic Fix + Replenishment Overhaul + UI Additions

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — Stock Upload Logic Fix

## 1.1 New DB Columns

Add to `memo_stock` model in `prisma/schema.prisma`:

```prisma
Status        String    @default("active")   // active | sold | returned | missing
InvoiceNo     String?   @db.VarChar          // filled when item is sold
StatusNote    String?   @db.VarChar          // reason for missing flag
UpdatedAt     DateTime  @default(now()) @db.Timestamp(6)
```

Add to `stock` model:
```prisma
IsMissing     Boolean   @default(false)      // flagged when not found in upload or sales
MissingNote   String?   @db.VarChar
```

Run migration after adding.

## 1.2 Updated Stock Upload Logic

File: `app/api/upload/route.ts`

When processing Stock Excel upload — after inserting/updating all rows present in Excel:

### Step 1 — Detect Missing Items
```typescript
// Find all StockNos that were previously On Memo
// but are now MISSING from the new Excel upload
const previousMemoStockNos = await prisma.memo_stock.findMany({
  where: { Status: 'active' },
  select: { StockNo: true, MemoID: true, MemoStockID: true }
})

const uploadedStockNos = new Set(excelRows.map(r => r.StockNo))

const missingItems = previousMemoStockNos.filter(
  ms => !uploadedStockNos.has(ms.StockNo)
)
```

### Step 2 — Classify Each Missing Item
For each missing item:

```typescript
// Check if it exists in Sales table
const saleRecord = await prisma.sales.findFirst({
  where: { StockNo: ms.StockNo }
})

if (saleRecord) {
  // SOLD — update memo_stock
  await prisma.memo_stock.update({
    where: { MemoStockID: ms.MemoStockID },
    data: { 
      Status: 'sold',
      InvoiceNo: saleRecord.InvoiceNo,
      UpdatedAt: new Date()
    }
  })
  
  // Check if ALL items on this memo are now sold/returned
  const remainingActive = await prisma.memo_stock.count({
    where: { MemoID: ms.MemoID, Status: 'active' }
  })
  
  if (remainingActive === 0) {
    // Deactivate entire memo
    await prisma.memo.update({
      where: { MemoID: ms.MemoID },
      data: { IsActive: false }
    })
  }
} else {
  // NOT FOUND IN SALES — flag as missing, do not auto-deactivate
  await prisma.memo_stock.update({
    where: { MemoStockID: ms.MemoStockID },
    data: { 
      Status: 'missing',
      StatusNote: 'Item missing from stock upload — not found in sales. Manual review required.',
      UpdatedAt: new Date()
    }
  })
  
  await prisma.stock.update({
    where: { StockNo: ms.StockNo },
    data: { IsMissing: true, MissingNote: 'Missing from stock upload' }
  })
}
```

### Step 3 — Detect Returned Items
For each StockNo present in upload WHERE memo columns are empty (Company/MemoNo empty):

```typescript
// Find if this StockNo was previously on active memo
const activeMemoStock = await prisma.memo_stock.findFirst({
  where: { StockNo: stockNo, Status: 'active' }
})

if (activeMemoStock) {
  // RETURNED — deactivate this memo_stock row
  await prisma.memo_stock.update({
    where: { MemoStockID: activeMemoStock.MemoStockID },
    data: {
      Status: 'returned',
      StatusNote: 'Item returned by client — detected via stock upload',
      UpdatedAt: new Date()
    }
  })
  
  // Check if all items on memo are now closed
  const remainingActive = await prisma.memo_stock.count({
    where: { MemoID: activeMemoStock.MemoID, Status: 'active' }
  })
  
  if (remainingActive === 0) {
    await prisma.memo.update({
      where: { MemoID: activeMemoStock.MemoID },
      data: { IsActive: false }
    })
  }
  
  // Stock is now In Warehouse — no further action needed
  // (memo columns being empty already means no active memo link)
}
```

### Step 4 — Stock is Never Deleted
```typescript
// CRITICAL: Never DELETE any stock record
// Only UPDATE status fields
// Even if StockNo disappears from Excel — keep in DB, just flag it
```

### Step 5 — Upload Response
Return summary:
```typescript
{
  inserted: number,
  updated: number,
  markedSold: number,
  markedReturned: number,
  flaggedMissing: number,   // needs manual review
  memosDeactivated: number
}
```

---

# PART 2 — New DB Tables for Replenishment History

## 2.1 replenishment_items

Replace current `replenishments` table approach with more detailed tracking.

```prisma
model replenishment_items {
  ItemID            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  
  // Which replenishment session
  ReplenishmentID   String    @db.Uuid
  
  // What was replenished
  InvoiceNo         String    @db.VarChar
  StyleNo           String    @db.VarChar
  GroupField        String    @db.VarChar
  GroupValue        String    @db.VarChar
  
  // The stock item assigned
  StockNo           String    @db.VarChar
  
  // Status of this item
  Status            String    @db.VarChar  
  // Values: 'memo' | 'stock' | 'pullback' | 'factory_order'
  
  // For pullback items
  PullbackMemoID    String?   @db.Uuid     // which memo we're pulling from
  PullbackClientID  String?   @db.Uuid     // which client we're pulling from
  PullbackStatus    String?   @db.VarChar  
  // Values: 'pending' | 'accepted' | 'rejected' | 'no_response'
  
  // For factory order items
  FactoryOrderNote  String?   @db.VarChar
  
  CreatedBy         String    @db.Uuid
  CreatedAt         DateTime  @default(now()) @db.Timestamp(6)
  UpdatedAt         DateTime  @default(now()) @db.Timestamp(6)

  Replenishment     replenishments          @relation(fields: [ReplenishmentID], references: [ReplenishmentID])
  PullbackHistory   pullback_history[]
  SelectionHistory  pullback_selection_history[]

  @@index([InvoiceNo])
  @@index([StyleNo])
  @@index([StockNo])
  @@map("replenishment_items")
}
```

## 2.2 pullback_history

Tracks every communication attempt with client for pullback.

```prisma
model pullback_history {
  HistoryID         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ReplenishmentItemID String  @db.Uuid
  
  // Communication log
  ContactedAt       DateTime  @default(now()) @db.Timestamp(6)
  Channel           String    @db.VarChar   // 'whatsapp' | 'call' | 'email' | 'in_person'
  ContactedBy       String    @db.Uuid      // UserID of salesperson
  ClientResponse    String    @db.VarChar   // 'accepted' | 'rejected' | 'no_answer' | 'callback_requested'
  Notes             String?   @db.Text
  
  ReplenishmentItem replenishment_items @relation(fields: [ReplenishmentItemID], references: [ItemID])
  ContactedByUser   users               @relation(fields: [ContactedBy], references: [UserID])

  @@index([ReplenishmentItemID])
  @@map("pullback_history")
}
```

## 2.3 pullback_selection_history

Tracks every time a pullback selection is changed with mandatory reason.

```prisma
model pullback_selection_history {
  SelectionHistoryID  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ReplenishmentItemID String    @db.Uuid
  
  // What changed
  PreviousStockNo     String?   @db.VarChar
  NewStockNo          String?   @db.VarChar
  PreviousMemoID      String?   @db.Uuid
  NewMemoID           String?   @db.Uuid
  
  // Mandatory reason
  Reason              String    @db.Text    // free text, mandatory
  ChangedBy           String    @db.Uuid
  ChangedAt           DateTime  @default(now()) @db.Timestamp(6)
  
  ReplenishmentItem   replenishment_items @relation(fields: [ReplenishmentItemID], references: [ItemID])
  ChangedByUser       users               @relation(fields: [ChangedBy], references: [UserID])

  @@index([ReplenishmentItemID])
  @@map("pullback_selection_history")
}
```

Run migration after adding all tables.

---

# PART 3 — Client Replenishment Screen Overhaul

## 3.1 Search Bar Changes

**Two search modes — strictly one at a time:**

```
Mode 1 — By Client + Date Range (existing):
  [Client Name dropdown] [From Date] [To Date] [Search]

Mode 2 — By Invoice No:
  [Invoice No text input] [Search]

Toggle between modes:
  "Search by Client" | "Search by Invoice No"
  Tab style toggle above search bar
```

When searched by Invoice No — show confirmation banner:
```
Invoice #INV-0291 found
TENENBAUM JEWELERS · Feb 1, 2025 · 12 items
```

## 3.2 Results Table — New Status Column

Replace current results with:

| Column | Description |
|---|---|
| Style No | JetBrains Mono |
| Product (from sales) | Description |
| Sold Qty | Count sold on this invoice |
| Desired Qty | Editable — defaults to Sold Qty |
| Status | Smart status display (see below) |
| Actions | Eye buttons per status type |
| Replenishment History | Link if previously replenished |

### Status Display Logic

```
DesiredQty = user input (default = SoldQty)

// How many does client still have on memo for same StyleNo?
ClientMemoQty = count of active memo_stock items for this client 
                WHERE StyleNo matches AND memo_stock.Status = 'active'

// Available sources
InWarehouse   = stock matching StyleNo, not on memo, not sold, not on hold
PullbackAvail = stock on memo, IsStockPullAllowed = true, within CloseToExpiryDays

// Allocation logic (in priority order):
Step 1: Allocate from ClientMemoQty first (Memo status)
Step 2: Remaining → allocate from InWarehouse (Stock status)  
Step 3: Remaining → allocate from PullbackAvail (Pullback status)
Step 4: Remaining → Factory Order

remaining = DesiredQty

memoAlloc    = min(remaining, ClientMemoQty); remaining -= memoAlloc
stockAlloc   = min(remaining, InWarehouse);   remaining -= stockAlloc
pullAlloc    = min(remaining, PullbackAvail); remaining -= pullAlloc
factoryAlloc = remaining
```

### Status Badge Display

```
IF DesiredQty <= SoldQty:
  Show single badge only — most relevant status
  e.g. "Memo" or "Stock" or "Pullback" or "Factory Order"

IF DesiredQty > SoldQty AND multiple sources needed:
  Show multiple badges with counts:
  e.g. "Memo ×4  Stock ×1" or "Stock ×2  Pullback ×1  Factory ×2"

Badge colors:
  Memo:          bg #EDE9FE, text #3B0764
  Stock:         bg #DCFCE7, text #166534
  Pullback:      bg #FEF3C7, text #92400E
  Factory Order: bg #FEE2E2, text #991B1B
```

### Live Recalculation
When user changes Desired Qty → all status badges recalculate instantly client-side.

## 3.3 Eye Button Drawers — Per Status

### Memo Drawer
Shows: which specific memo items the client still has
| Memo No | Stock No | Start Date | End Date | Days Left |

### Stock Drawer  
Shows: randomly picked StockNos from warehouse (existing pill logic)
- Green pills, toggleable
- Count = stockAlloc quantity
- Re-picks on desired qty change

### Pullback Drawer
Shows: available pullback candidates sorted by client rank

**Checkbox selection:**
- Each row has a checkbox
- User can select max = pullAlloc quantity
- Cannot select more than pullAlloc
- Selected items shown as confirmed pullback outside drawer
- "Confirm Selection" button at bottom

**Per pullback row:**
| ☐ | Stock No | Client Name | Overall Rank | Style Rank | Memo Expiry | Days Left |

**After confirming pullback selection:**
- Show selected items as amber pills outside drawer (like stock pills)
- Each pill has client name abbreviated
- Clicking pill → opens pullback communication log for that item

**Pullback Communication Log (per item):**
```
[+ Log Contact Attempt] button

Each log entry:
  Channel: [WhatsApp ▼] [Call ▼] [Email ▼] [In Person ▼]
  Response: [Accepted ▼] [Rejected ▼] [No Answer ▼] [Callback ▼]
  Notes: text area
  [Save]

History list below (newest first):
  May 7, 2026 · WhatsApp · John (salesperson) · Accepted
  "Client confirmed they can return item by May 10"
```

**Changing a confirmed pullback selection:**
- Click "Change Selection" button on confirmed pill
- Opens modal: "Reason for change" — free text, mandatory, cannot save without it
- On save: old selection + reason stored in `pullback_selection_history`
- New selection takes effect

### Factory Order Drawer
Shows: count of items to order
Simple display — no selection needed
```
X items need factory order for Style ABCD
[Add Note] optional text field
```

## 3.4 Confirm Replenishment — Updated

On confirm:
- Save one `replenishment_items` row per item per status
- Stock items: status = 'stock', StockNo filled
- Memo items: status = 'memo', note which memo
- Pullback items: status = 'pullback', PullbackMemoID + PullbackClientID filled
- Factory items: status = 'factory_order', FactoryOrderNote filled

## 3.5 Replenishment History — Merged Into Client Replenishment

Remove separate History page from sidebar.
Add "History" tab inside Client Replenishment page:

**Tab 1: Search & Replenish** (existing functionality)
**Tab 2: History**

History tab shows all past replenishments with:
- InvoiceNo | Client | Style No | Status | Replenished By | Date
- Expandable row → shows full detail:
  - Each item's status
  - For pullback items: full communication history
  - For selection changes: full reason history
- Filter: Client, Date Range, Status, Replenished By
- Export to Excel/PDF

---

# PART 4 — Stock Replenishment Search

File: `components/replenishment/StockReplenishmentPage.tsx`

Add search bar at top of results:
```
[Search by Style No or Product Description...] [🔍]
```

- Real-time filter as user types (client-side filter of loaded results)
- Filters both StyleNo (exact/partial) and ProductDescription (partial)
- Show "No results for X" when nothing matches
- Clear button (×) to reset search

---

# PART 5 — Missing Items Dashboard Widget

Add to Dashboard — "Items Needing Review" card:

Shows count of stock items flagged as `IsMissing = true`
- Click → goes to a simple list page `/stock-review`
- List shows: StockNo | StyleNo | Last Seen | Status Note | [Mark Resolved] button
- Mark Resolved: sets `IsMissing = false`, clears note

---

# PART 6 — Permissions Update

Add to seed:
```
replenishment.log_pullback_contact
replenishment.change_pullback_selection
stock_review.view
stock_review.resolve
```

Default roles:
- super_admin + admin: all
- member: log_pullback_contact, change_pullback_selection, stock_review.view
- viewer: none of the above

---

# PART 7 — MEMO_FOR_DAYS Excel Mapping + MemoEndDate Calculation

## 7.1 Add MEMO_FOR_DAYS to Excel Mapping Config

File: `lib/excel-config.ts`

Add `MEMO_FOR_DAYS` to the Stock Report mappable fields:
```typescript
// In STOCK_REPORT_FIELDS array — add:
{ key: 'MEMO_FOR_DAYS', label: 'Memo Terms (Days)', required: false }
```

This makes it appear in the Excel Map Configuration screen 
so admin can map their Excel column to this field.

## 7.2 Terms Parsing Logic

File: `app/api/upload/route.ts`

When processing each Stock Excel row that has memo data (Company column filled):

```typescript
const DEFAULT_MEMO_TERMS_DAYS = 30

function asMemoTermsDays(cellValue: unknown): number {
  if (cellValue === null || cellValue === undefined) return 0

  // Try direct number first
  const asNumber = Number(cellValue)
  if (!isNaN(asNumber) && asNumber > 0) return Math.floor(asNumber)

  // Try extracting first integer from text e.g. "30 days", "Net 45", "45 Days"
  const str = String(cellValue).trim()
  const match = str.match(/\d+/)
  if (match) {
    const parsed = parseInt(match[0], 10)
    if (parsed > 0) return parsed
  }

  return 0
}

// During memo row processing:
const rawTerms = mappedRow['MEMO_FOR_DAYS']
const parsedTerms = asMemoTermsDays(rawTerms)

// If 0 → not on memo (skip memo creation even if Company column filled)
// This handles the case where MEMO_FOR_DAYS = 0 means in warehouse

let terms: number
if (parsedTerms === 0) {
  // Treat as In Warehouse — skip memo creation
  terms = 0
} else {
  // Use parsed value or fall back to default
  terms = parsedTerms > 0 ? parsedTerms : DEFAULT_MEMO_TERMS_DAYS
}

// Calculate MemoEndDate
const memoStartDate = parsedRow.MemoDate ?? new Date()
const memoEndDate = new Date(memoStartDate)
memoEndDate.setDate(memoEndDate.getDate() + terms)
```

## 7.3 Update Memo Upsert

When creating or updating memo record during stock upload:

```typescript
await prisma.memo.upsert({
  where: { MemoNo: memoNo },
  create: {
    MemoNo: memoNo,
    MemoDate: memoStartDate,
    Terms: terms,
    MemoEndDate: memoEndDate,   // calculated from MemoDate + Terms
    ClientID: client.ClientID,
    IsActive: true,
    ...
  },
  update: {
    Terms: terms,
    MemoEndDate: memoEndDate,   // recalculate on every upload in case Terms changed
    ...
  }
})
```

## 7.4 Backfill Existing Memo Records

After upload logic is fixed — run a one-time backfill for existing memos 
that have Terms but wrong/null MemoEndDate:

```sql
UPDATE memo
SET "MemoEndDate" = "MemoDate" + ("Terms" * INTERVAL '1 day')
WHERE "Terms" > 0 
AND ("MemoEndDate" IS NULL OR "MemoEndDate" != "MemoDate" + ("Terms" * INTERVAL '1 day'));
```

Run this as a migration or manually via Cursor after the upload fix is deployed.

## 7.5 Verify in Excel Map Configuration Screen

After this change:
- Admin opens Excel Map Configuration → Stock Report tab
- Should see new field: "Memo Terms (Days)" → maps to MEMO_FOR_DAYS
- Admin maps their Excel column (e.g. "MEMO_FOR_DAYS" or "Terms" or "Days")
- On next upload → Terms and MemoEndDate calculated correctly

---

# Build Order

1. Part 7.1 — Add MEMO_FOR_DAYS to excel-config.ts mappable fields
2. Part 7.2-7.3 — Add asMemoTermsDays() parser + update memo upsert in upload route
3. Part 7.4 — Run backfill SQL for existing memo records
4. Part 7.5 — Verify in Excel Map Configuration screen
5. Part 1.1 — Add new DB columns to memo_stock + stock → migrate
2. Part 1.2 — Update stock upload logic (detection + classification)
3. Test upload with a real Excel file — verify sold/returned/missing detection
4. Part 2.1-2.3 — Add new replenishment tables → migrate
5. Part 3.1 — Search bar with two modes (Client vs Invoice No)
6. Part 3.2 — Results table with new Status column + live calculation
7. Part 3.3 — Eye button drawers (Memo, Stock, Pullback, Factory)
8. Part 3.3 — Pullback communication log UI
9. Part 3.3 — Pullback selection change with mandatory reason
10. Part 3.4 — Updated confirm replenishment saving logic
11. Part 3.5 — History tab inside Client Replenishment
12. Part 4 — Stock Replenishment search bar
13. Part 5 — Missing items dashboard widget + /stock-review page
14. Part 6 — Seed new permissions
15. Run npm run build — must pass
16. Update docs/PROGRESS.md

---

# Notes for Cursor

- memo_stock.Status is item-level — never deactivate full memo unless ALL items are sold/returned
- Stock records are NEVER deleted — only status fields updated
- Pullback selection max = pullAlloc quantity — enforce this in UI
- Mandatory reason field on pullback change — cannot submit without it
- All new API routes: requirePermission check via lib/rbac.ts
- Replenishment history is now a TAB inside client replenishment — remove from sidebar
- Status calculation is client-side after API returns raw data — no extra API call on qty change
- Invoice No search shows confirmation banner with client name + date + item count
- Do one build order step at a time — confirm before moving to next