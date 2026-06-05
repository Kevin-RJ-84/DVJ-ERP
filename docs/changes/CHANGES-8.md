# CHANGES-8.md — Pullback Pill UX Improvements

Read CLAUDE.md for full project context.
Implement in order. Only touch files listed in Notes section.

---

# PART 1 — Pullback Pill — Click to Open Contact Log

## 1.1 Make entire pill clickable

File: `components/replenishment/ReplenishmentV2Page.tsx`

Current: Pill is a static display element with a small MessageCircle icon button.

Change: Make the ENTIRE pill clickable — clicking anywhere on the pill opens the contact log modal.

```tsx
// Pill wrapper — make it a button
<button
  type="button"
  className="group relative inline-flex items-center gap-1.5 
             rounded-full px-2.5 py-1 text-xs font-medium
             bg-[#FEF3C7] text-[#92400E]
             hover:bg-[#FDE68A] transition-colors duration-150
             cursor-pointer"
  onClick={() => openContactLog(item)}
>
  {/* Dot */}
  <span
    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
    style={{ backgroundColor: dotColor }}
    title={dotTooltip}
  />
  
  {/* Client name + StockNo */}
  <span>{abbreviatedClientName} · {item.StockNo}</span>
  
  {/* Hover buttons — shown only on hover */}
  <span className="hidden group-hover:inline-flex items-center gap-1 ml-1">
    {/* Log Contact icon */}
    <span title="Log contact attempt">
      <MessageCircle size={12} className="text-[#92400E] opacity-70" />
    </span>
    
    {/* Remove button */}
    <span
      role="button"
      title="Remove from pullback"
      className="text-[#92400E] opacity-70 hover:opacity-100 
                 hover:text-[#991B1B] transition-colors"
      onClick={(e) => {
        e.stopPropagation()  // prevent pill click opening log
        handleRemovePullbackItem(item)
      }}
    >
      <X size={12} />
    </span>
  </span>
</button>
```

## 1.2 Contact log modal — pre-expand form on open

When modal opens via pill click — show the "+ Log Contact Attempt" 
form already expanded (don't make user click the button first).

In the contact log modal component:
```typescript
// Add prop: defaultExpanded
interface ContactLogModalProps {
  item: PullbackItem
  logs: ContactLog[]
  defaultExpanded?: boolean  // new prop
  onClose: () => void
  onSave: (log: ContactLog) => void
}

// When defaultExpanded = true — show form immediately on mount
const [formOpen, setFormOpen] = useState(defaultExpanded ?? false)
```

Pass `defaultExpanded={true}` when opening from pill click.

---

# PART 2 — Remove Pullback Item (× button)

## 2.1 handleRemovePullbackItem function

Add to `ReplenishmentV2Page.tsx`:

```typescript
function handleRemovePullbackItem(
  rowIndex: number,
  item: PullbackItem
) {
  const row = tableRows[rowIndex]
  const isOnlyItem = row.confirmedPullbackItems.length === 1

  if (isOnlyItem) {
    // Show confirmation dialog
    setRemoveConfirmDialog({
      open: true,
      rowIndex,
      item,
      isOnly: true
    })
  } else {
    // Multiple items — require reason
    setRemoveReasonModal({
      open: true,
      rowIndex,
      item
    })
  }
}
```

## 2.2 Confirmation Dialog — Only Item

When removing the only confirmed pullback item:

```
Dialog (inline, below the pill — not full modal):
  Icon: AlertTriangle, 16px, #D97706
  Title: "Remove pullback?"
  Body: "This will move DVR071-OV-3.00 to Factory Order."
  
  Buttons:
  [Remove & Skip to Factory]  [Cancel]
  
  Style:
  bg: #FFFBEB
  border: 0.5px solid #D97706
  border-radius: 10px
  padding: 14px 16px
  max-width: 320px
  position: absolute, below the pill
```

On [Remove & Skip to Factory]:
```typescript
// Update row state
updateRow(rowIndex, {
  confirmedPullbackItems: [],
  pullbackContactLogs: [],
  skippedPullback: true,  // triggers Factory Order status
  pullbackChangeHistory: [
    ...row.pullbackChangeHistory,
    {
      previousItems: row.confirmedPullbackItems,
      reason: 'Removed only pullback item — moved to Factory Order',
      changedAt: new Date()
    }
  ]
})
```

On [Cancel]: close dialog, no change.

## 2.3 Reason Modal — Multiple Items

When removing one of multiple confirmed pullback items:

```
Modal:
  Title: "Reason for Removing [ClientName] · [StockNo]"
  
  Textarea:
    Placeholder: "Why are you removing this pullback item?"
    Min length: 10 chars
    Required: yes
  
  Buttons:
  [Remove Item]  [Cancel]
  [Remove Item] disabled until reason.length >= 10
```

On [Remove Item]:
```typescript
updateRow(rowIndex, {
  confirmedPullbackItems: row.confirmedPullbackItems
    .filter(i => i.StockNo !== item.StockNo),
  pullbackChangeHistory: [
    ...row.pullbackChangeHistory,
    {
      previousItems: row.confirmedPullbackItems,
      reason: enteredReason,
      changedAt: new Date()
    }
  ]
})
// skippedPullback stays false — other items still confirmed
```

---

# PART 3 — State Additions

## 3.1 New modal/dialog state in ReplenishmentV2Page

```typescript
// Confirmation dialog for removing only pullback item
const [removeConfirmDialog, setRemoveConfirmDialog] = useState<{
  open: boolean
  rowIndex: number
  item: PullbackItem | null
  isOnly: boolean
}>({ open: false, rowIndex: -1, item: null, isOnly: false })

// Reason modal for removing one of multiple items
const [removeReasonModal, setRemoveReasonModal] = useState<{
  open: boolean
  rowIndex: number
  item: PullbackItem | null
}>({ open: false, rowIndex: -1, item: null })
```

---

# PART 4 — Pill Visual Polish

## 4.1 Updated pill design

Confirmed pullback pills should feel more polished:

```tsx
// Normal state
bg-[#DBEAFE] text-[#1E40AF]  // blue — Pullback Confirmed
// or
bg-[#FEF3C7] text-[#92400E]  // amber — PB In Progress

// Hover state — slightly darker
hover:bg-[#BFDBFE]  // for blue
hover:bg-[#FDE68A]  // for amber

// Cursor
cursor-pointer

// Transition
transition-colors duration-150

// Show hover buttons only on group-hover
group  // on wrapper
hidden group-hover:inline-flex  // on buttons
```

## 4.2 Dot positioning

Dot should be flush left of client name:
```
● GIANNI VIN... · JS30772  [📋][×]
```
Not inside the pill text — before it.

---

# Build Order

1. Part 3 — Add new state variables
2. Part 1.1 — Make pill clickable + hover buttons
3. Part 1.2 — Contact log modal defaultExpanded prop
4. Part 2.1 — handleRemovePullbackItem function
5. Part 2.2 — Confirmation dialog (only item)
6. Part 2.3 — Reason modal (multiple items)
7. Part 4 — Pill visual polish
8. npm run build — must pass
9. Update docs/PROGRESS.md

---

# Notes for Cursor

- Only touch: components/replenishment/ReplenishmentV2Page.tsx
  and the contact log modal component (check exact filename)
- e.stopPropagation() on × button click is critical — 
  prevents pill click handler from firing simultaneously
- Do not change any API routes
- Do not touch PullbackDrawer.tsx unless contact log 
  modal is defined there
- skippedPullback = true when last item removed
- skippedPullback stays false when one of multiple removed
- Build must pass