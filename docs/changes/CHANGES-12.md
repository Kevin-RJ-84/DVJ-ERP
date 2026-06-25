# CHANGES-12.md — Confirm Replenishment Overhaul + Style Upload Confirm + Rescan

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — DB Schema Changes

## 1.1 New column on replenishment_items

```prisma
// Add to replenishment_items:
ReplenishmentType  String   @default("invoice") @db.VarChar
// Values: 'invoice' | 'style_upload'

StyleUploadRef     String?  @db.VarChar
// Auto-generated reference for style upload records
// Format: {clientNameNoSpaces}_{YYYYMMDD}
// e.g. CALEESIDESIGNSJEWELERS_20260625

RescanCount        Int      @default(0)
// How many times this item has been rescanned

LastRescannedAt    DateTime? @db.Timestamp(6)
// When this item was last rescanned

LastRescannedBy    String?  @db.Uuid
// Who triggered the last rescan
```

## 1.2 New table — replenishment_rescan_log

Stores every rescan event and what changed:

```prisma
model replenishment_rescan_log {
  RescanLogID    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ItemID         String    @db.Uuid
  StyleUploadRef String?   @db.VarChar
  InvoiceNo      String?   @db.VarChar
  StyleNo        String    @db.VarChar
  OldStatus      String    @db.VarChar
  NewStatus      String    @db.VarChar
  OldStockNo     String?   @db.VarChar
  NewStockNo     String?   @db.VarChar
  ChangedBy      String    @db.Uuid
  ChangedAt      DateTime  @default(now()) @db.Timestamp(6)
  Notes          String?   @db.Text

  Item           replenishment_items @relation(fields: [ItemID], references: [ItemID])
  ChangedByUser  users               @relation(fields: [ChangedBy], references: [UserID])

  @@index([ItemID])
  @@index([StyleUploadRef])
  @@index([InvoiceNo])
  @@index([ChangedAt])
  @@map("replenishment_rescan_log")
}
```

## 1.3 Migration

```
npx prisma migrate dev --name changes12_confirm_rescan
npx prisma generate
```

---

# PART 2 — Style Upload Reference Generator

Add to lib/replenishment-utils.ts (create if not exists):

```typescript
/**
 * Generate a unique style upload reference
 * Format: {ClientNameNoSpaces}_{YYYYMMDD}
 * e.g. CALEESIDESIGNSJEWELERS_20260625
 */
export function generateStyleUploadRef(
  clientName: string,
  date: Date = new Date()
): string {
  const name = clientName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')  // remove spaces and special chars
    .slice(0, 30)                // max 30 chars for name part

  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '')
  return `${name}_${dateStr}`
}
```

---

# PART 3 — Style Upload Confirm

## 3.1 Enable Confirm Button in Style Upload Mode

File: components/replenishment/ReplenishmentV2Page.tsx

Change canConfirmReplenishment to include style upload mode:

```typescript
const canConfirmReplenishment = useMemo(
  () => {
    // Style upload: require client selected + rows exist
    if (searchMode === 'styleUpload') {
      return Boolean(styleUploadClientId) &&
        rows.some(row => row.overrideQty > 0)
    }
    // Client/invoice mode: existing logic
    return rows.some((row) => {
      if (row.overrideQty <= 0) return false
      return ['memo', 'stock', 'pullback_available', 'pullback_confirmed',
               'pending_pullback', 'factory_order', 'hold'].includes(
        deriveSingleRowStatus(row, replenPartyKey)
      )
    })
  },
  [rows, replenPartyKey, searchMode, styleUploadClientId]
)
```

Show confirm footer in style upload mode too:
```typescript
{rows.length > 0 && (searchMode !== 'styleUpload' || styleUploadClientId) ? (
  <div className="confirm-footer">
    ...
    <button onClick={handleConfirm}>
      {confirmed ? 'Confirmed' : 'Confirm Replenishment'}
    </button>
  </div>
) : null}
```

## 3.2 Style Upload Payload

Add styleUpload-specific fields to buildConfirmPayload():

```typescript
function buildConfirmPayload() {
  const payload = rows
    .filter(row => row.overrideQty > 0)
    .map(row => ({
      // existing fields...
      groupValue: row.groupValue,
      invoiceNos: searchMode === 'styleUpload'
        ? ['STYLE-UPLOAD']
        : row.invoiceNos,
      overrideQty: row.overrideQty,
      // ...allocation fields...

      // NEW for style upload:
      replenishmentType: searchMode === 'styleUpload'
        ? 'style_upload' : 'invoice',
      styleUploadClientId: searchMode === 'styleUpload'
        ? styleUploadClientId : null,
      styleUploadClientName: searchMode === 'styleUpload'
        ? styleUploadClient : null,

      // Hold allocation (new)
      holdAlloc: row.holdAlloc ?? 0,
      holdPillStockNos: [...(row.selectedHoldStockNos ?? new Set())],
    }))

  return payload
}
```

## 3.3 After Confirm in Style Upload Mode

After successful confirm → clear the page:

```typescript
if (searchMode === 'styleUpload') {
  // Clear everything
  setRows([])
  setStyleUploadClient('')
  setStyleUploadClientId(null)
  setStyleUploadSummary(null)
  setConfirmed(false)
  setToast({ type: 'success', message: 'Replenishment saved. View in History tab.' })
} else {
  // Existing behavior — stay on page with status chips
  setConfirmed(true)
  setExportSnapshot(buildExportSnapshot())
  // ... update rows with savedStatus ...
}
```

---

# PART 4 — Updated Confirm API

File: app/api/replenishment/confirm/route.ts

## 4.1 Handle Style Upload Type

```typescript
// In buildItemDrafts():
const isStyleUpload = row.replenishmentType === 'style_upload'

const styleUploadRef = isStyleUpload
  ? generateStyleUploadRef(
      row.styleUploadClientName ?? 'UNKNOWN',
      new Date()
    )
  : null

// Generate ONE ref per confirm call (not per row)
// Pass it to all rows in this confirm batch
```

## 4.2 Hold Status

Add hold as a saveable status:

```typescript
function getConfirmStatus(row: ParsedRow): string {
  // existing statuses...
  if (row.holdAlloc > 0 && row.memoAlloc === 0 && row.stockAlloc === 0) {
    return 'hold'
  }
  // ... rest of existing logic
}
```

## 4.3 Save Style Upload Items

```typescript
// replenishment_items gets these new fields:
{
  ReplenishmentType: 'style_upload' | 'invoice',
  StyleUploadRef: styleUploadRef | null,
  Status: getConfirmStatus(row),
  // ... existing fields
}
```

---

# PART 5 — Rescan Logic

## 5.1 New API Route

File: app/api/replenishment/rescan/route.ts
Method: POST
Permission: replenishment.confirm

```typescript
// Body:
{
  itemIds: string[]        // IDs to rescan
  // OR
  invoiceNo: string        // rescan all items for invoice
  // OR
  styleUploadRef: string   // rescan all items for style upload ref
  // OR
  all: true               // rescan everything on page
}
```

## 5.2 Rescan Logic Per Item

```typescript
async function rescanItem(
  item: replenishment_items,
  userId: string,
  db: PrismaClient
): Promise<{ changed: boolean; oldStatus: string; newStatus: string; newStockNo?: string }> {

  const oldStatus = item.Status
  const oldStockNo = item.StockNo

  // TERMINAL — never rescan
  if (oldStatus === 'sold') {
    return { changed: false, oldStatus, newStatus: oldStatus }
  }

  // LOCKED — same StockNo, only status can change
  if (['stock', 'memo', 'hold', 'pullback_confirmed'].includes(oldStatus)) {
    const stockNo = item.StockNo
    if (!stockNo) return { changed: false, oldStatus, newStatus: oldStatus }

    // Check if sold
    const isSold = await db.sales.findFirst({
      where: { StockNo: stockNo }
    })
    if (isSold) {
      return { changed: true, oldStatus, newStatus: 'sold', newStockNo: stockNo }
    }

    // Check if on active memo for client
    const onMemo = await db.memo_stock.findFirst({
      where: {
        StockNo: stockNo,
        Status: 'active',
        Memo: { is: { IsActive: true } }
      }
    })
    if (onMemo && oldStatus !== 'memo') {
      return { changed: true, oldStatus, newStatus: 'memo', newStockNo: stockNo }
    }

    // Check if on hold for client
    const onHold = await db.stock.findFirst({
      where: {
        StockNo: stockNo,
        HoldDate: { not: null },
        HoldCompany: { not: null }
      }
    })
    if (onHold && oldStatus === 'pullback_confirmed') {
      return { changed: true, oldStatus, newStatus: 'hold', newStockNo: stockNo }
    }

    // No change
    return { changed: false, oldStatus, newStatus: oldStatus }
  }

  // OPEN — fresh allocation for this StyleNo + MetalType
  if (['pullback_available', 'pb_in_progress', 'pending_pullback', 'factory_order'].includes(oldStatus)) {
    const styleNo = item.StyleNo
    const metalType = item.GroupValue?.split('·')[1]?.trim() ?? null
    const clientId = item.ClientID

    // Re-run hierarchy: Hold → Memo → Stock → Pullback → Factory

    // 1. Check Hold for this client
    if (clientId) {
      const client = await db.clients.findUnique({
        where: { ClientID: clientId },
        select: { PartyName: true }
      })
      if (client) {
        const holdItem = await db.stock.findFirst({
          where: {
            StyleNo: styleNo,
            HoldCompany: { equals: client.PartyName, mode: 'insensitive' },
            HoldDate: { not: null },
            Sales: { none: {} },
            MemoStockLinks: {
              none: { Status: 'active', Memo: { is: { IsActive: true } } }
            }
          },
          select: { StockNo: true }
        })
        if (holdItem) {
          return { changed: true, oldStatus, newStatus: 'hold', newStockNo: holdItem.StockNo }
        }
      }
    }

    // 2. Check Memo for this client
    if (clientId) {
      const memoItem = await db.memo_stock.findFirst({
        where: {
          Status: 'active',
          Stock: { is: { StyleNo: styleNo } },
          Memo: { is: { IsActive: true, ClientID: clientId } }
        },
        select: { StockNo: true }
      })
      if (memoItem?.StockNo) {
        return { changed: true, oldStatus, newStatus: 'memo', newStockNo: memoItem.StockNo }
      }
    }

    // 3. Check warehouse stock
    const warehouseItem = await db.stock.findFirst({
      where: {
        StyleNo: styleNo,
        HoldDate: null,
        Sales: { none: {} },
        MemoStockLinks: {
          none: { Status: 'active', Memo: { is: { IsActive: true } } }
        }
      },
      select: { StockNo: true }
    })
    if (warehouseItem) {
      return { changed: true, oldStatus, newStatus: 'stock', newStockNo: warehouseItem.StockNo }
    }

    // 4. Check pullback candidates
    const pullbackItem = await db.memo_stock.findFirst({
      where: {
        Status: 'active',
        Stock: { is: { StyleNo: styleNo } },
        Memo: {
          is: {
            IsActive: true,
            Client: { is: { IsStockPullAllowed: true } }
          }
        }
      },
      select: { StockNo: true }
    })
    if (pullbackItem?.StockNo) {
      return { changed: true, oldStatus, newStatus: 'pullback_available', newStockNo: pullbackItem.StockNo }
    }

    // 5. Still factory order
    return { changed: false, oldStatus, newStatus: 'factory_order' }
  }

  return { changed: false, oldStatus, newStatus: oldStatus }
}
```

## 5.3 Save Rescan Results

For each changed item:

```typescript
// Update replenishment_items
await db.replenishment_items.update({
  where: { ItemID: item.ItemID },
  data: {
    Status: result.newStatus,
    StockNo: result.newStockNo ?? item.StockNo,
    RescanCount: { increment: 1 },
    LastRescannedAt: new Date(),
    LastRescannedBy: userId
  }
})

// Log to replenishment_status_log
await db.replenishment_status_log.create({
  data: {
    ItemID: item.ItemID,
    InvoiceNo: item.InvoiceNo,
    StyleNo: item.StyleNo,
    FromStatus: result.oldStatus,
    ToStatus: result.newStatus,
    ChangedBy: userId,
    Notes: 'Auto-updated by rescan'
  }
})

// Log to replenishment_rescan_log
await db.replenishment_rescan_log.create({
  data: {
    ItemID: item.ItemID,
    StyleUploadRef: item.StyleUploadRef,
    InvoiceNo: item.InvoiceNo,
    StyleNo: item.StyleNo,
    OldStatus: result.oldStatus,
    NewStatus: result.newStatus,
    OldStockNo: item.StockNo,
    NewStockNo: result.newStockNo ?? item.StockNo,
    ChangedBy: userId,
    Notes: 'Auto-updated by rescan'
  }
})
```

---

# PART 6 — History Tab Upgrade

## 6.1 Updated History API

File: app/api/replenishment/history/route.ts

Return both invoice and style upload records:

```typescript
// Group by InvoiceNo (invoice records) 
// OR StyleUploadRef (style upload records)

Response: [{
  type: 'invoice' | 'style_upload'
  invoiceNo: string | null
  styleUploadRef: string | null
  partyName: string
  replenishedAt: string
  replenishedByName: string
  totalItems: number
  confirmedCount: number
  factoryCount: number
  pendingCount: number
  soldCount: number
  rescanableCount: number  // items eligible for rescan
  items: [{
    itemId: string
    styleNo: string
    metalType: string | null
    status: string
    stockNo: string | null
    holdCompany: string | null
    replenishedByName: string
    replenishedAt: string
    rescanCount: number
    lastRescannedAt: string | null
    canRescan: boolean  // true if not sold
  }]
}]
```

## 6.2 History Tab UI

File: components/replenishment/ReplenishmentHistoryTab.tsx

### Top Level
```
[Rescan All]  ← rescans all rescanable items across all groups
               Only show if rescanableCount > 0

[Client ▼] [Invoice/Ref No ________] [Search] [Clear]
```

### Group Card
```
▶ INV-0291 · DEUTSCH · Feb 1, 2025 · 12 items
  [✅ 8] [🏭 2] [⏳ 2] [💰 0 sold]
  [Rescan Group]  [Export Confirmed ▼] [Export Factory ▼]
```

For style upload:
```
▶ CALEESIDESIGNS_20260625 · CALEESI · Jun 25, 2026 · 5 items
  [✅ 2] [🏭 2] [⏳ 1] [💰 0 sold]
  [Rescan Group]  [Export ▼]
  🏷 Style Upload
```

### Expanded Item Row
```
StyleNo          MetalType  Status Badge    StockNo     Rescan
KJE7828-RD-2.00  14KW      [✅ Memo]       JS38477     [↻]
DVR056-OV-3.00   14KY      [🏭 Factory]    —           [↻]
KJR9977B         14KW      [💰 Sold]       JS30558     —
```

Rescan button `[↻]`:
- Shows on all items EXCEPT Sold
- Spins while rescanning
- On complete: badge updates to new status
- If changed: brief highlight animation

### Status Badges in History
```
stock              → bg-[#DCFCE7] text-[#166634]  "Stock"
memo               → bg-[#EDE9FE] text-[#3B0764]  "Memo"
hold               → bg-[#FCE7F3] text-[#9D174D]  "Hold"
pullback_confirmed → bg-[#DBEAFE] text-[#1E40AF]  "Pullback Confirmed"
pb_in_progress     → bg-[#FEF3C7] text-[#92400E]  "PB In Progress"
pending_pullback   → bg-[#FEF3C7] text-[#92400E]  "Pending Pullback"
pullback_available → bg-[#FEE2E2] text-[#991B1B]  "Pullback Available"
factory_order      → bg-[#F1F5F9] text-[#475569]  "Factory Order"
sold               → bg-[#F3F4F6] text-[#9CA3AF]  "Sold ✓"
```

---

# PART 7 — Permissions

Add to seed:
```
replenishment.rescan
```

Default roles:
- super_admin + admin: yes
- member: yes
- viewer: no

---

# Build Order

1. Part 1 — Schema changes → migrate → generate
2. Part 2 — generateStyleUploadRef utility
3. Part 4 — Updated confirm API (hold status + style upload type)
4. Part 3 — Style upload confirm UI (enable button + clear on confirm)
5. Part 5 — Rescan API route
6. Part 6 — History tab upgrade (rescan buttons + sold status)
7. Part 7 — Seed permission
8. npm run build — must pass
9. Update docs/PROGRESS.md

---

# Notes for Cursor

- StyleUploadRef generated ONCE per confirm batch — same ref for all rows
- Sold status is TERMINAL — never rescanned, no rescan button shown
- LOCKED items (stock/memo/hold/pullback_confirmed): StockNo never changes on rescan
- OPEN items (factory/pullback_available/pb_in_progress/pending_pullback): fresh allocation
- Rescan saves immediately — no confirmation dialog
- Rescan All → rescans ALL non-sold items across ALL groups on page
- Rescan Group → rescans all non-sold items in that invoice/ref group
- Rescan Item → rescans that single item
- History shows both invoice AND style upload records together
- Style upload records tagged with 🏷 Style Upload chip in card header
- Hold status badge: pink bg-[#FCE7F3] text-[#9D174D]
- MetalType for rescan: extract from GroupValue or item metadata
- ClientID must be saved on replenishment_items for rescan to work
  Check if ClientID column exists — add if missing