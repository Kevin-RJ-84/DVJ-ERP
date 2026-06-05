# CHANGES.md — Replenishment V2

This file describes what needs to be built NEW or CHANGED from SPEC.md.
Do not modify existing V1 replenishment page — just hide it from navigation.

---

## 1. New Page — Replenishment V2

**Route:** `/replenishment`
**Old V1 Route:** move to `/replenishment-v1` (keep code, remove from nav)
**Access:** Admin + Member

---

## 2. Search Bar (Top of Page)

Three inputs + Search button:

| Field | Type | Notes |
|---|---|---|
| Client Name | Searchable dropdown | Populated from `clients` table |
| From Date | Date picker | Invoice date range start |
| To Date | Date picker | Invoice date range end |
| Search | Button | Triggers query |

---

## 3. Group By Control

Below search bar, before results — a **Group By selector.**

**Default:** StyleNo

**Available group by options:**
- StyleNo
- ProductType
- StoneShape
- Metal
- MetalType
- ProductStyle

User can select one option at a time. Changing group by **re-groups results instantly** without re-fetching from DB (client-side re-grouping of already fetched data).

---

## 4. Results Table

Shown after search. One row per group (e.g., one row per StyleNo if grouped by StyleNo).

### Columns:

| Column | Description |
|---|---|
| Group Value | e.g., StyleNo value like "3333" |
| Sold Qty | COUNT of pieces sold to this client in date range for this group |
| Override Qty | Editable number input — defaults to Sold Qty. User can change per row. |
| ✅ In Warehouse | Count of matching stock pieces: not on memo, not on hold, not sold |
| 🔄 Pullback Available | Count of matching stock on active memo where IsStockPullAllowed = TRUE and within CloseToExpiryDays |
| 🏭 Factory Order | GREATEST(0, OverrideQty - InWarehouse - PullbackAvailable) |
| Actions | Eye buttons per metric (see below) |

### Live Recalculation:
When user edits Override Qty for any row → that row's In Warehouse, Pullback, Factory Order metrics **recalculate instantly** (client-side, no API call needed — data already fetched).

---

## 5. Eye Buttons

**✅ In Warehouse eye button:**
Opens drawer/modal showing:
- StockNo
- ProductDescription
- Location
- BoxCode

**🔄 Pullback eye button:**
Opens drawer/modal showing:
- StockNo
- ProductDescription
- PartyName (client who has it on memo)
- MemoNo
- MemoEndDate
- CloseToExpiryDays threshold for that client

**🏭 Factory Order eye button:**
Skip eye button on this column — just show the number.
*(Not sure what to show here yet — revisit in future phase)*

---

## 6. Replenishment Calculation Logic (Per Row)

```
-- Context:
GroupField    = selected group by field (e.g., StyleNo)
GroupValue    = the value for this row (e.g., "3333")
OverrideQty   = user input (defaults to SoldQty)

-- IN WAREHOUSE
SELECT COUNT(*) FROM stock s
WHERE s.[GroupField] = [GroupValue]
AND s.HoldDate IS NULL
AND s.StockNo NOT IN (SELECT StockNo FROM sales)
AND s.StockNo NOT IN (
  SELECT ms.StockNo FROM memo_stock ms
  JOIN memo m ON ms.MemoID = m.MemoID
  WHERE m.IsActive = TRUE
)

-- PULLBACK AVAILABLE
SELECT COUNT(*) FROM stock s
JOIN memo_stock ms ON s.StockNo = ms.StockNo
JOIN memo m ON ms.MemoID = m.MemoID
JOIN clients c ON m.ClientID = c.ClientID
WHERE s.[GroupField] = [GroupValue]
AND m.IsActive = TRUE
AND c.IsStockPullAllowed = TRUE
AND m.MemoEndDate <= CURRENT_DATE + c.CloseToExpiryDays

-- FACTORY ORDER
GREATEST(0, OverrideQty - IN_WAREHOUSE - PULLBACK_AVAILABLE)
```

---

## 7. Export to PDF

**"Export PDF" button** — top right of results section (visible only after search returns results).

### PDF Contents:
- Title: "Replenishment Report"
- Generated on: [date + time]
- Client: [selected client name]
- Date Range: [From Date] to [To Date]
- Grouped By: [selected group by field]
- Table with all rows:
  - Group Value, Sold Qty, Override Qty, In Warehouse, Pullback Available, Factory Order
- Summary row at bottom:
  - Total Sold Qty, Total Override Qty, Total In Warehouse, Total Pullback, Total Factory Order

### PDF Library:
Use `@react-pdf/renderer` or `jspdf` + `jspdf-autotable` — pick whichever is simpler to implement.

---

## 8. What Does NOT Change from SPEC.md

- All auth flows (login, OTP, invite, force password change)
- Excel upload flow
- Excel Map Configuration screen
- Client Master screen
- User Management screen
- Database schema (no new tables or columns needed)
- All existing API routes

---

## 9. Navigation Change

| Item | Change |
|---|---|
| Old V1 replenishment (`/replenishment-v1`) | Remove from sidebar/nav — keep code |
| New V2 replenishment (`/replenishment`) | Add to sidebar as "Replenishment" |

---

## 10. New API Route Needed

**GET `/api/replenishment/v2`**

Query params:
- `clientId` — UUID
- `fromDate` — ISO date string
- `toDate` — ISO date string
- `groupBy` — one of: `StyleNo`, `ProductType`, `StoneShape`, `Metal`, `MetalType`, `ProductStyle`

Response:
```json
[
  {
    "groupValue": "3333",
    "soldQty": 3,
    "inWarehouse": 2,
    "pullbackAvailable": 1,
    "factoryOrder": 0,
    "inWarehouseItems": [
      { "StockNo": "...", "ProductDescription": "...", "Location": "...", "BoxCode": "..." }
    ],
    "pullbackItems": [
      { "StockNo": "...", "ProductDescription": "...", "PartyName": "...", "MemoNo": "...", "MemoEndDate": "...", "CloseToExpiryDays": 7 }
    ]
  }
]
```

---

## 11. Build Order for These Changes

1. New API route `/api/replenishment/v2`
2. Replenishment V2 page — search bar + group by selector
3. Results table with live Override Qty recalculation
4. Eye button drawers (In Warehouse + Pullback)
5. Export PDF button
6. Hide V1 from nav, update routing