# CHANGES-10.md — Replenishment Status Overhaul + Confirm Flow + Factory Orders + History Upgrade

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — New DB Tables + Columns

## 1.1 New Table — replenishment_status_log

Stores every status transition for every replenishment item.

```prisma
model replenishment_status_log {
  LogID         String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ItemID        String    @db.Uuid
  InvoiceNo     String    @db.VarChar
  StyleNo       String    @db.VarChar
  FromStatus    String?   @db.VarChar       // null on first creation
  ToStatus      String    @db.VarChar
  ChangedBy     String    @db.Uuid
  ChangedAt     DateTime  @default(now()) @db.Timestamp(6)
  Notes         String?   @db.Text

  Item          replenishment_items @relation(fields: [ItemID], references: [ItemID])
  ChangedByUser users               @relation(fields: [ChangedBy], references: [UserID])

  @@index([ItemID])
  @@index([InvoiceNo])
  @@index([StyleNo])
  @@index([ChangedAt])
  @@map("replenishment_status_log")
}
```

## 1.2 Update replenishment_items

Add new columns:

```prisma
// Status values (full set):
// 'memo' | 'stock' | 'pullback' | 'pullback_confirmed' |
// 'pending_pullback' | 'pb_in_progress' | 'factory_order' |
// 'factory_order_placed' | 'skipped'

// New columns to add:
PullbackCandidateCount  Int?      // pullback candidates at time of save
IsActive                Boolean   @default(true)
FactoryOrderPlacedAt    DateTime? @db.Timestamp(6)  // when marked as ordered
FactoryOrderPlacedBy    String?   @db.Uuid
```

## 1.3 Migration

```
npx prisma migrate dev --name changes10_status_log_factory_orders
npx prisma generate
```

---

# PART 2 — Status Transition Rules

## 2.1 All Valid Transitions

```
null                  → stock               system — warehouse items assigned
null                  → memo                system — client memo covers it
null                  → pullback_available  system — candidates exist
null                  → factory_order       system — no candidates

pullback_available    → pb_in_progress      user selects candidate from drawer
pullback_available    → factory_order       user skips (clicks skip warning)
pullback_available    → pullback            saved unactioned on confirm replenishment

pb_in_progress        → pullback_confirmed  contact log response = 'accepted'
pb_in_progress        → pullback_available  client rejects → back to available
pb_in_progress        → factory_order       user explicitly skips
pb_in_progress        → pending_pullback    saved on confirm — not yet resolved

pullback_confirmed    → pb_in_progress      user changes selection (requires reason)

factory_order         → pullback_available  user undoes skip (candidates > 0)
factory_order         → factory_order_placed team marks as ordered (LOCKED forever)

pending_pullback      → pb_in_progress      resurrected on next search (Option A)
```

## 2.2 Log Every Transition

Every status change → insert into replenishment_status_log:
```typescript
await db.replenishment_status_log.create({
  data: {
    ItemID: item.ItemID,
    InvoiceNo: item.InvoiceNo,
    StyleNo: item.StyleNo,
    FromStatus: previousStatus ?? null,
    ToStatus: newStatus,
    ChangedBy: currentUserId,
    Notes: reason ?? null
  }
})
```

---

# PART 3 — Row State Rules (Active vs Disabled)

## 3.1 DISABLED + LOCKED (never recalculate)

These rows are greyed out, pointer-events-none, read only:

```
stock                    → StockNo assigned ✅
memo                     → Memo covers it ✅
pullback_confirmed        → Client agreed ✅
factory_order_placed      → Order placed with factory ✅ PERMANENT LOCK
factory_order (PullbackCandidateCount = 0) → nothing can be done
```

## 3.2 ACTIVE + LOCKED SELECTION (recalculate landscape, not selection)

Row is interactive. Candidate selection is preserved — NOT reassigned.

```
pb_in_progress:
  Keep: selected candidate locked (who we're contacting)
  Update: pullback count, contact logs, other candidates

pending_pullback:
  Resurrect as: pb_in_progress
  Restore: previously selected candidate
  Update: pullback count, contact logs
```

## 3.3 ACTIVE + FULL RECALCULATE

Row is fully interactive, everything recalculated fresh:

```
pullback_available       → recalculate candidates completely fresh
factory_order (pending, PullbackCandidateCount > 0)
                         → ACTIVE, can still convert to pullback
                           OR team marks as ordered from Factory Orders screen
```

## 3.4 Disabled Row Styling

```tsx
className={isDisabled
  ? 'opacity-50 pointer-events-none bg-[#FAFAF9]'
  : ''}

// Show status chip on disabled rows:
stock            → [✅ Stocked · JS30558]
memo             → [✅ Memo]
pullback_confirmed → [✅ Pulled Back]
factory_order_placed → [🏭 Ordered]
factory_order    → [🏭 Factory Order]
```

## 3.5 Show Completed Toggle

Default: hide disabled rows (showCompleted = false)
Toggle: "Show completed" → reveals disabled rows

```tsx
<label className="flex items-center gap-2 text-sm text-[#57534E]">
  <input type="checkbox" checked={showCompleted}
    onChange={e => setShowCompleted(e.target.checked)} />
  Show completed rows
</label>
```

---

# PART 4 — Confirm Replenishment Flow

## 4.1 Warning Dialog

Before saving — check for pb_in_progress items:

```
If inProgressCount > 0:

Modal:
  "X items still have pending pullbacks.
   These will be saved as Pending Pullback and will
   NOT be included in the confirmed replenishment export.
   Continue?"
  [Continue]  [Go Back]
```

## 4.2 Save Logic Per Status

```typescript
function getConfirmStatus(row: TableRow): string {
  const badge = derivePullbackBadgeState(row)

  if (row.selectedWarehouseStockNos.size > 0) return 'stock'
  if (memoAlloc > 0 && stockAlloc === 0) return 'memo'
  if (badge === 'pullback_confirmed') return 'pullback_confirmed'
  if (badge === 'pb_in_progress') return 'pending_pullback'
  if (badge === 'pullback_available' && !row.skippedPullback) return 'pullback'
  if (row.skippedPullback || factoryAllocDisplay > 0) return 'factory_order'
  return 'factory_order'
}
```

## 4.3 Save to DB

For each item — save replenishment_items + status log:

```typescript
// replenishment_items
{
  Status: getConfirmStatus(row),
  PullbackCandidateCount: pullbackAvail,
  IsActive: true,   // stays true — disabled logic is derived in UI
  // existing fields...
}

// replenishment_status_log
{
  ItemID: item.ItemID,
  InvoiceNo: item.InvoiceNo,
  StyleNo: item.StyleNo,
  FromStatus: null,   // first save
  ToStatus: item.Status,
  ChangedBy: userId,
}
```

## 4.4 Confirm API Response

```typescript
{
  success: true,
  replenishmentIds: [...],
  itemsCreated: number,
  confirmedCount: number,       // stock + memo + pullback_confirmed
  pendingPullbackCount: number, // pb_in_progress → pending_pullback
  factoryOrderCount: number,
  pullbackUnactionedCount: number
}
```

---

# PART 5 — Exports (Two Separate)

## 5.1 Export 1 — Confirmed Replenishment

Includes: Status = stock OR memo OR pullback_confirmed

PDF columns:
```
InvoiceNo | Client | StyleNo | StockNo | Type | Confirmed By | Date
```

Excel columns:
```
InvoiceNo | Client | StyleNo | StockNo | ProductDescription |
MetalType | MetalPurity | Type | Confirmed By | Date
```

Filename: `confirmed-replenishment-{clientName}-{date}.pdf/xlsx`

## 5.2 Export 2 — Factory Orders

Includes: Status = factory_order OR factory_order_placed

PDF columns:
```
InvoiceNo | Client | StyleNo | Qty | ProductDescription | MetalType | MetalPurity
```

Excel columns:
```
InvoiceNo | ClientName | StyleNo | Quantity | ProductDescription |
MetalType | MetalPurity | StoneShape | ProductType | Metal | Notes
```

Filename: `factory-orders-{clientName}-{date}.pdf/xlsx`

## 5.3 Export Button Design

Use dropdown style per export type:

```
[Export Confirmed ▼]          [Export Factory Orders ▼]
  → PDF                          → PDF
  → Excel                        → Excel
```

---

# PART 6 — Pending Invoices Count Badge + Drawer

## 6.1 Count Badge

Add at top of results section in ReplenishmentV2Page:

```tsx
<button
  onClick={() => setShowPendingDrawer(true)}
  className="inline-flex items-center gap-2 px-3 py-1.5
             bg-[#FEE2E2] text-[#991B1B] rounded-full
             text-xs font-semibold hover:bg-[#FECACA]"
>
  {pendingCount} invoices pending replenishment
  <ChevronRight size={12} />
</button>
```

## 6.2 Pending Invoices Drawer

Slides in from right. Shows table:

```
InvoiceNo | Party Name | No. of Pieces | Days Since Sold
```

All columns sortable — click header toggles asc/desc.
Days Since Sold = TODAY - InvoiceDate
Default sort: Days Since Sold DESC (oldest first)
Color coding on Days Since Sold:
  < 7 days: neutral
  7-14 days: amber
  > 14 days: red

---

# PART 7 — Factory Orders Screen

## 7.1 New Route

```
/replenishment/factory-orders
```

Add to sidebar under Replenishment group.
Permission: replenishment.view

## 7.2 Screen Layout

Header:
  Title: "Factory Orders"
  Subtitle: "Track and confirm orders placed with factory"

Summary pills:
```
[🟡 X Pending]  [🔵 Y Ordered]  [Total Z]
```
Clicking each pill filters table.

Filter bar:
```
[Client Name ▼]  [StyleNo ________]  [Status ▼]  [Search]
```

Results table:
```
InvoiceNo (mono) | Client | StyleNo | Description |
Metal | MetalPurity | Qty | Days Waiting | Status | Actions
```

Status badges:
```
factory_order        → bg-[#FEF9C3] text-[#854D0E]  "Pending"
factory_order_placed → bg-[#DBEAFE] text-[#1E40AF]  "Ordered"
```

Days Waiting color:
```
< 3 days:  neutral #A8A29E
3-7 days:  amber   #D97706
> 7 days:  red     #DC2626
```

## 7.3 Mark as Ordered — Inline Confirmation

NO popup. NO new screen. Inline confirmation below the row:

```
Row: DVE075 | DEUTSCH | ... | 🟡 Pending | [Mark as Ordered]

On click "Mark as Ordered":
  Row expands inline:
  ┌─────────────────────────────────────────────┐
  │ Mark DVE075 as ordered from factory?        │
  │ This cannot be undone.                      │
  │                                             │
  │ Notes (optional): [________________]        │
  │                                             │
  │ [Confirm Order Placed]  [Cancel]            │
  └─────────────────────────────────────────────┘

On confirm:
  Status → factory_order_placed
  FactoryOrderPlacedAt = now()
  FactoryOrderPlacedBy = current user
  Row → disabled, locked permanently
  Log status transition
```

## 7.4 Ordered Rows

Once marked as ordered:
  Row shows as disabled (opacity-50)
  Status badge → "Ordered" (blue)
  No action buttons
  Shows: "Ordered by Karan · May 29, 2026"

## 7.5 Pagination

25 per page. Filter + sort on all columns.

---

# PART 8 — Pending Pullbacks Screen

## 8.1 New Route

```
/replenishment/pending-pullbacks
```

Add to sidebar under Replenishment group.
Permission: replenishment.view

## 8.2 Screen Layout

Header:
  Title: "Pending Pullbacks"
  Subtitle: "Items awaiting pullback confirmation across all clients"

Summary pills:
```
[🔴 X Pullback Available]  [🟡 Y PB In Progress]  [Total Z]
```

Filter bar:
```
[Client Name ▼]  [StyleNo ________]  [Status ▼]  [Search]
```

Results table:
```
InvoiceNo | Client | StyleNo | Status | Candidates |
Last Contact | Days Pending | Actions
```

Days Pending color:
```
< 3 days:  neutral
3-7 days:  amber warning
> 7 days:  red urgent
```

Actions per row:
  [Open] → navigates to /replenishment/client with invoice pre-searched
  [Log Contact] → opens contact log modal directly

---

# PART 9 — History Tab Upgrade

## 9.1 Make History Tab Global

Current: History only works when client is searched
New: History tab works independently — shows all replenishments

## 9.2 Filters

Replace existing filters with:
```
[Client Name ▼]  [Invoice No ________]  [Search]  [Clear]

One or both:
  Client only    → all replenishments for that client
  Invoice No only → that specific invoice
  Both           → that invoice for that client
  Neither        → show all (last 25, newest first)
```

Remove: Date Range filter (no longer needed)

## 9.3 Results — Grouped by Invoice

Results grouped by InvoiceNo with clear visual separation.
Default: ALL collapsed. Click to expand.

**Invoice group header (collapsed):**
```
▶ INV-0291  ·  DEUTSCH AND DEUTSCH  ·  Feb 1, 2025  ·  12 items
  [✅ 8 confirmed]  [🏭 2 factory]  [⏳ 2 pending]
  [Export Confirmed ▼]  [Export Factory Orders ▼]
```

**Invoice group (expanded):**
```
▼ INV-0291  ·  DEUTSCH AND DEUTSCH  ·  Feb 1, 2025  ·  12 items
  [✅ 8 confirmed]  [🏭 2 factory]  [⏳ 2 pending]
  [Export Confirmed ▼]  [Export Factory Orders ▼]

  StyleNo          Status              StockNo       By       Date
  ─────────────────────────────────────────────────────────────────
  KJN7265          ✅ Stock            JS30558       Karan    Feb 2
  DVE075           ✅ Pullback Conf.   ST-001        Karan    Feb 2
  DVR056-OV-3.00   🏭 Factory Order   —             Karan    Feb 2
  KJN7262          ⏳ PB In Progress  —             Karan    Feb 2
```

## 9.4 Export Buttons — Per Invoice

Export buttons in EACH invoice group header.
Exports only items from that specific invoice.

```
[Export Confirmed ▼]          [Export Factory Orders ▼]
  → PDF (confirmed items)        → PDF (factory items)
  → Excel                        → Excel
```

Only show Export Factory Orders button if invoice has factory_order items.
Only show Export Confirmed button if invoice has confirmed items.

## 9.5 Status Chips in History

```
stock              → bg-[#DCFCE7] text-[#166634]  "Stock"
memo               → bg-[#EDE9FE] text-[#3B0764]  "Memo"
pullback_confirmed → bg-[#DBEAFE] text-[#1E40AF]  "Pullback Confirmed"
pb_in_progress     → bg-[#FEF3C7] text-[#92400E]  "PB In Progress"
pending_pullback   → bg-[#FEF3C7] text-[#92400E]  "Pending Pullback"
factory_order      → bg-[#F1F5F9] text-[#475569]  "Factory Order"
factory_order_placed → bg-[#DBEAFE] text-[#1E40AF] "Ordered"
pullback           → bg-[#FEE2E2] text-[#991B1B]  "Pullback"
```

---

# PART 10 — Dashboard Updates

## 10.1 Pending Replenishments Card

Add to dashboard bottom row:

```tsx
<Card>
  <div className="flex justify-between items-center mb-3">
    <span className="text-sm font-600 text-[#1C1917]">
      Pending Replenishments
    </span>
    <span className="badge bg-[#FEE2E2] text-[#991B1B]">
      {pendingCount}
    </span>
  </div>

  <div className="space-y-2">
    <div className="flex justify-between text-xs">
      <span className="text-[#991B1B]">Pullback Available</span>
      <span>{pullbackAvailableCount}</span>
    </div>
    <div className="flex justify-between text-xs">
      <span className="text-[#92400E]">PB In Progress</span>
      <span>{pbInProgressCount}</span>
    </div>
    <div className="flex justify-between text-xs">
      <span className="text-[#854D0E]">Factory Orders Pending</span>
      <span>{factoryPendingCount}</span>
    </div>
  </div>

  <button
    onClick={() => router.push('/replenishment/pending-pullbacks')}
    className="mt-4 w-full text-xs text-[#3B0764] underline text-left"
  >
    View pending pullbacks →
  </button>
  <button
    onClick={() => router.push('/replenishment/factory-orders')}
    className="mt-1 w-full text-xs text-[#3B0764] underline text-left"
  >
    View factory orders →
  </button>
</Card>
```

Data from: GET /api/replenishment/pending-count

---

# PART 11 — New API Routes

## 11.1 GET /api/replenishment/pending-count
```typescript
// Permission: replenishment.view
Response: {
  totalPendingInvoices: number,
  pullbackAvailableCount: number,
  pbInProgressCount: number,
  factoryPendingCount: number   // factory_order (not placed)
}
```

## 11.2 GET /api/replenishment/pending-invoices
```typescript
// For the drawer
// Permission: replenishment.view
// Query: sortBy = 'invoiceNo' | 'partyName' | 'pieceCount' | 'daysSinceSold'
//        sortDir = 'asc' | 'desc'
Response: [{
  invoiceNo: string,
  partyName: string,
  pieceCount: number,
  invoiceDate: string,
  daysSinceSold: number
}]
```

## 11.3 GET /api/replenishment/pending-pullbacks
```typescript
// For pending pullbacks screen
// Permission: replenishment.view
// Query: clientId?, styleNo?, status?, page, limit
Response: [{
  itemId: string,
  invoiceNo: string,
  partyName: string,
  styleNo: string,
  status: string,
  pullbackCandidateCount: number,
  lastContactAt: string | null,
  lastContactResponse: string | null,
  replenishedAt: string,
  daysPending: number
}]
```

## 11.4 GET /api/replenishment/factory-orders
```typescript
// For factory orders screen
// Permission: replenishment.view
// Query: clientId?, styleNo?, status?, page, limit
Response: [{
  itemId: string,
  invoiceNo: string,
  partyName: string,
  styleNo: string,
  productDescription: string | null,
  metalType: string | null,
  metalPurity: string | null,
  stoneShape: string | null,
  productType: string | null,
  quantity: number,
  status: string,   // factory_order | factory_order_placed
  daysWaiting: number,
  factoryOrderPlacedAt: string | null,
  factoryOrderPlacedByName: string | null
}]
```

## 11.5 PATCH /api/replenishment/factory-orders/mark-ordered
```typescript
// Permission: replenishment.confirm
// Body: { itemId: string, notes?: string }
// Sets: Status = factory_order_placed, FactoryOrderPlacedAt, FactoryOrderPlacedBy
// Logs: status transition in replenishment_status_log
Response: { success: true }
```

## 11.6 GET /api/replenishment/history (update existing)
```typescript
// Remove date filters
// Add: clientId? (optional), invoiceNo? (optional)
// Return grouped by InvoiceNo with item counts per status
// Default: last 25 invoices newest first
Response: [{
  invoiceNo: string,
  partyName: string,
  replenishedAt: string,
  replenishedByName: string,
  totalItems: number,
  confirmedCount: number,
  factoryCount: number,
  pendingCount: number,
  items: [{
    itemId, styleNo, status, stockNo,
    productDescription, metalType, metalPurity,
    replenishedByName, replenishedAt
  }]
}]
```

---

# PART 12 — Sidebar Updates

Add to DashboardSidebar.tsx under Replenishment group:

```
── REPLENISHMENT ──
  Client Replenishment    /replenishment/client
  Pending Pullbacks       /replenishment/pending-pullbacks  ← new
  Factory Orders          /replenishment/factory-orders     ← new
  Stock Replenishment     /replenishment/stock
```

---

# PART 13 — Permissions

Add to seed:
```
replenishment.view_pending_pullbacks
replenishment.view_factory_orders
replenishment.mark_factory_ordered
replenishment.export_confirmed
replenishment.export_factory_orders
```

Default roles:
  super_admin + admin: all
  member: all 5
  viewer: view_pending_pullbacks + view_factory_orders only

---

# Build Order

1. Part 1 — Schema changes → migrate → generate
2. Part 11 — All new API routes
3. Part 4 — Updated confirm replenishment API + status log
4. Part 3 — Row state logic in ReplenishmentV2Page
5. Part 6 — Pending invoices count badge + drawer
6. Part 5 — Export buttons (confirmed + factory orders)
7. Part 7 — Factory Orders screen
8. Part 8 — Pending Pullbacks screen
9. Part 9 — History tab upgrade (global, grouped, collapsed)
10. Part 10 — Dashboard pending replenishments card
11. Part 12 — Sidebar updates
12. Part 13 — Seed permissions
13. npm run build — must pass
14. Update docs/PROGRESS.md

---

# Notes for Cursor

- factory_order (pending) stays ACTIVE — can convert to pullback OR mark ordered
- factory_order_placed is PERMANENTLY LOCKED — no undo
- factory_order (PullbackCandidateCount = 0) is DISABLED
- Mark as Ordered = inline confirmation below row, NOT a popup/modal
- pb_in_progress → candidate selection LOCKED, landscape recalculates
- pending_pullback → resurrect as pb_in_progress, restore candidate
- History tab: grouped by invoice, collapsed by default, export per invoice
- History filters: client name + invoice no ONLY (no date range)
- Export buttons are dropdowns: PDF | Excel per export type
- Status log INSERT on every transition — not just on confirm
- Do one build order step at a time
- Build must pass after each step