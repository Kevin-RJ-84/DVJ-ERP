# CHANGES-7.md — History API Pullback Logs + Pullback Status Overhaul

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — History API — Expose Pullback Logs

## 1.1 Update GET /api/replenishment/history/route.ts

For each replenishment row returned — join replenishment_items:
```typescript
// Add to existing history query
items: await db.replenishment_items.findMany({
  where: { ReplenishmentID: replenishment.ReplenishmentID },
  include: {
    pullbackHistory: {
      include: {
        ContactedByUser: {
          select: { FirstName: true, LastName: true }
        }
      },
      orderBy: { ContactedAt: 'desc' }
    },
    selectionHistory: {
      include: {
        ChangedByUser: {
          select: { FirstName: true, LastName: true }
        }
      },
      orderBy: { ChangedAt: 'desc' }
    }
  }
})
```

Updated response shape per history row:
```typescript
{
  // ...existing fields unchanged...
  items: [{
    ItemID: string,
    StockNo: string,
    Status: string,           // 'stock' | 'pullback' | 'memo' | 'factory_order'
    GroupField: string,
    GroupValue: string,
    PullbackStatus: string | null,
    pullbackHistory: [{
      HistoryID: string,
      ContactedAt: string,    // ISO date
      Channel: string,        // 'whatsapp' | 'call' | 'email' | 'in_person'
      ClientResponse: string, // 'accepted' | 'rejected' | 'no_answer' | 'callback_requested'
      Notes: string | null,
      contactedByName: string // FirstName + ' ' + LastName
    }],
    selectionHistory: [{
      SelectionHistoryID: string,
      ChangedAt: string,      // ISO date
      PreviousStockNo: string | null,
      NewStockNo: string | null,
      Reason: string,
      changedByName: string   // FirstName + ' ' + LastName
    }]
  }]
}
```

## 1.2 Update ReplenishmentHistoryTab.tsx

Replace placeholder panels in expanded rows with real data:

**Pullback Communication Log section:**
```
Table: Date | Channel badge | Response badge | By | Notes
Sorted: newest first
Empty: "No contact attempts logged"

Channel badge colors:
  whatsapp:  bg-[#DCFCE7] text-[#166534]
  call:      bg-[#DBEAFE] text-[#1E40AF]
  email:     bg-[#EDE9FE] text-[#3B0764]
  in_person: bg-[#F3F4F6] text-[#374151]

Response badge colors:
  accepted:           bg-[#DCFCE7] text-[#166534]
  rejected:           bg-[#FEE2E2] text-[#991B1B]
  no_answer:          bg-[#FEF3C7] text-[#92400E]
  callback_requested: bg-[#DBEAFE] text-[#1E40AF]
```

**Selection Change History section:**
```
Table: Changed At | Previous Stock (mono) | New Stock (mono) | Reason | By
Sorted: newest first
Empty: "No selection changes"
```

Only show these sections for items where Status = 'pullback'.
For other statuses show: "Item Details" section only 
(GroupField, GroupValue, StockNo).

---

# PART 2 — New Badge States + Colors

## 2.1 Badge Definitions — Replace ALL existing status badges

Remove all old badge color/label definitions and replace with:

```typescript
const BADGE_CONFIG = {
  memo: {
    label: 'Memo',
    className: 'bg-[#EDE9FE] text-[#3B0764]'
  },
  stock: {
    label: 'Stock',
    className: 'bg-[#DCFCE7] text-[#166634]'
  },
  pullback_available: {
    label: 'Pullback Available',
    className: 'bg-[#FEE2E2] text-[#991B1B]',
    clickable: true   // opens skip warning
  },
  pullback_confirmed: {
    label: 'Pullback Confirmed',
    className: 'bg-[#DBEAFE] text-[#1E40AF]',
    clickable: false
  },
  pb_in_progress: {
    label: 'PB In Progress',
    className: 'bg-[#FEF3C7] text-[#92400E]',
    clickable: false
  },
  factory_order_skippable: {
    label: 'Factory Order',
    className: 'bg-[#F1F5F9] text-[#475569] cursor-pointer hover:bg-[#E2E8F0]',
    clickable: true   // opens switch-back warning (only when pullback candidates exist)
  },
  factory_order_final: {
    label: 'Factory Order',
    className: 'bg-[#F1F5F9] text-[#475569] cursor-default',
    clickable: false  // no pullback candidates
  }
} as const
```

All badges: `px-2 py-0.5 rounded-full text-xs font-semibold`
NO borders on any badge.

---

# PART 3 — Badge State Transition Logic

## 3.1 New state field on TableRow

Add to each row's state:
```typescript
skippedPullback: boolean  // user explicitly clicked skip
```

Default: `false`

## 3.2 Pullback Badge Derivation Function

```typescript
function derivePullbackBadgeState(
  row: TableRow,
  replenPartyNorm: string
): 'pullback_available' | 'pullback_confirmed' | 'pb_in_progress' | null {
  
  const { pullAlloc, pullbackAvail } = computeAllocationBreakdown(row, replenPartyNorm)
  
  if (pullAlloc === 0) return null  // no pullback needed
  
  // No candidates available
  if (pullbackAvail === 0) return null

  // Skipped by user → handled separately (factory_order_skippable)
  if (row.skippedPullback) return null

  // No confirmed selection yet
  if (row.confirmedPullbackItems.length === 0) {
    return 'pullback_available'
  }

  // Has confirmed items — check contact logs
  const totalLogs = row.pullbackContactLogs.reduce(
    (sum, bucket) => sum + bucket.logs.length, 0
  )

  if (totalLogs === 0) {
    return 'pullback_confirmed'
  }

  // Has logs — check if all accepted
  const allAccepted = row.confirmedPullbackItems.every(item => {
    const bucket = row.pullbackContactLogs.find(b => b.stockNo === item.StockNo)
    if (!bucket || bucket.logs.length === 0) return false
    const lastLog = bucket.logs[bucket.logs.length - 1]
    return lastLog.response === 'accepted'
  })

  if (allAccepted) return 'pullback_confirmed'  // back to confirmed when all accepted

  return 'pb_in_progress'
}
```

## 3.3 Factory Order Badge Type

```typescript
function getFactoryOrderBadgeType(
  row: TableRow,
  replenPartyNorm: string
): 'factory_order_skippable' | 'factory_order_final' {
  const { pullbackAvail } = computeAllocationBreakdown(row, replenPartyNorm)
  
  // Clickable only if pullback candidates exist (user skipped them)
  if (row.skippedPullback && pullbackAvail > 0) {
    return 'factory_order_skippable'
  }
  
  return 'factory_order_final'
}
```

---

# PART 4 — Pullback Available Pill — Skip Warning

## 4.1 Click handler on "Pullback Available" badge

When user clicks "Pullback Available" pill:

Show inline warning dialog (not a full modal — inline below the row):
```
"Skip pullback for this item?
 X pullback candidates available.
 This will mark as Factory Order instead."

[Skip Pullback]  [Cancel]
```

Dialog style:
- bg: #FFFBEB
- border: 0.5px solid #D97706
- border-radius: 8px
- padding: 12px 16px
- font-size: 13px
- Buttons inline

On [Skip Pullback]:
- Set `row.skippedPullback = true`
- Clear `row.confirmedPullbackItems = []`
- Clear `row.pullbackContactLogs = []`
- Badge → "Factory Order" (skippable type — clickable)

On [Cancel]:
- Close dialog, no state change

## 4.2 Click handler on "Factory Order" (skippable type)

When user clicks Factory Order pill (skippable):

Show inline warning dialog:
```
"Switch back to pullback?
 X candidates still available."

[Use Pullback]  [Cancel]
```

On [Use Pullback]:
- Set `row.skippedPullback = false`
- Badge → "Pullback Available"
- Pullback drawer button reappears

---

# PART 5 — Pullback Drawer Button Visibility

## 5.1 Show/hide rules for pullback drawer eye button

```typescript
const showPullbackDrawer = 
  !row.skippedPullback &&
  pullbackAvail > 0

// Show when:
// - User has NOT skipped pullback
// - AND pullback candidates exist
// Covers: Pullback Available, Pullback Confirmed, PB In Progress states
```

Hide when:
- `skippedPullback = true` (user skipped → factory order)
- OR `pullbackAvail = 0` (no candidates)

---

# PART 6 — Communication Dots in Pullback Drawer

## 6.1 Update PullbackDrawer.tsx

For each candidate row in the drawer table — add a colored dot BEFORE the client name:

```typescript
function getPullbackDotState(
  item: PullbackItem,
  isSelected: boolean,
  contactLogs: ContactLog[]
): { color: string, tooltip: string } | null {
  
  if (!isSelected) return null  // no dot for unselected
  
  if (contactLogs.length === 0) {
    return { 
      color: '#EAB308',   // yellow
      tooltip: 'Selected — not contacted yet' 
    }
  }
  
  const lastLog = contactLogs[contactLogs.length - 1]
  
  if (lastLog.response === 'accepted') {
    return { 
      color: '#16A34A',   // green
      tooltip: 'Accepted — client agreed to return' 
    }
  }
  
  if (lastLog.response === 'rejected') {
    return { 
      color: '#DC2626',   // red
      tooltip: 'Rejected — client declined' 
    }
  }
  
  // contacted but no final response yet
  return { 
    color: '#2563EB',   // blue
    tooltip: 'Contacted — awaiting response' 
  }
}
```

Dot rendering:
```tsx
{dot && (
  <span
    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
    style={{ backgroundColor: dot.color }}
    title={dot.tooltip}  // native tooltip
  />
)}
<span>{item.PartyName}</span>
```

Dot size: `w-2 h-2` (8px)
Position: inline before client name, `gap-2` between dot and name
Tooltip: native `title` attribute (no library needed)

## 6.2 Swap button for rejected items

When dot is red (rejected) — show "Swap" button on that row:

```tsx
{dot?.color === '#DC2626' && (
  <button
    className="ml-auto text-xs text-[#3B0764] underline hover:no-underline"
    onClick={() => handleSwapRejected(item)}
  >
    Swap
  </button>
)}
```

`handleSwapRejected(item)`:
1. Close drawer
2. Open change reason modal (mandatory reason, min 10 chars)
3. On reason saved:
   - Append to `row.pullbackChangeHistory`
   - Remove rejected item from `confirmedPullbackItems`
   - Reopen drawer with `startWithEmptySelection = false`
     (keeps other selections, only rejected item is deselected)

---

# PART 7 — Updated ReplenishmentStatusCell

## 7.1 Full updated status cell logic

```typescript
function ReplenishmentStatusCell({ row, replenPartyNorm }) {
  const allocation = computeAllocationBreakdown(row, replenPartyNorm)
  const { memoAlloc, stockAlloc, pullAlloc, factoryAlloc, pullbackAvail } = allocation
  
  const pullbackBadge = derivePullbackBadgeState(row, replenPartyNorm)
  const factoryBadge = factoryAlloc > 0 ? getFactoryOrderBadgeType(row, replenPartyNorm) : null

  const badges = []

  if (memoAlloc > 0) badges.push({ type: 'memo', count: memoAlloc })
  if (stockAlloc > 0) badges.push({ type: 'stock', count: stockAlloc })
  
  if (pullbackBadge) {
    const pullbackCount = 
      pullbackBadge === 'pullback_available' ? pullAlloc :
      row.confirmedPullbackItems.length
    badges.push({ type: pullbackBadge, count: pullbackCount })
  }
  
  if (factoryBadge) {
    badges.push({ type: factoryBadge, count: factoryAlloc })
  }

  // Compact mode: single source, overrideQty <= soldQty
  const useCompact = row.overrideQty <= row.soldQty && badges.length === 1

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map(({ type, count }) => (
        <StatusBadge
          key={type}
          type={type}
          count={useCompact ? 0 : count}
          row={row}
          onSkipPullback={...}
          onRestorePullback={...}
        />
      ))}
    </div>
  )
}
```

---

# Build Order

1. Part 1.1 — Update history API route
2. Part 1.2 — Update ReplenishmentHistoryTab with real data
3. Run npm run build — confirm passes
4. Part 2 — Replace all badge configs
5. Part 3 — Add skippedPullback state + badge derivation functions
6. Part 4 — Skip warning + restore warning dialogs
7. Part 5 — Pullback drawer button visibility logic
8. Part 6 — Communication dots in PullbackDrawer
9. Part 7 — Updated ReplenishmentStatusCell
10. Run npm run build — must pass
11. Update docs/PROGRESS.md

---

# Notes for Cursor

- All state changes are LOCAL — no API calls for badge transitions
- Dot tooltip uses native title attribute — no tooltip library
- skippedPullback resets to false if overrideQty changes
  (qty change = new calculation, user should reconsider pullback)
- Do NOT change any API routes except /api/replenishment/history
- Do NOT touch any other components except:
  ReplenishmentV2Page.tsx
  PullbackDrawer.tsx (PPullbackDrawer.tsx — check exact filename)
  ReplenishmentHistoryTab.tsx
- Build must pass after Part 1-2 and again after Part 3-9