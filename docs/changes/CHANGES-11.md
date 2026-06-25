# CHANGES-11.md — Style Upload Enhancements + ERP New Fields + Hold Logic

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — New Stock Table Columns

## 1.1 Schema Changes

Add to stock model in prisma/schema.prisma:

```prisma
HoldCompany   String?   @db.VarChar    // HOLD_REMARK from ERP — client name item is on hold for
MemoPrice     Decimal?  @db.Decimal(12, 2)  // MEMO_PRICE from ERP — memo consignment value per item
```

## 1.2 Migration

```
npx prisma migrate dev --name changes11_hold_company_memo_price
npx prisma generate
```

---

# PART 2 — ERP Sync Updates

## 2.1 Update ErpStockRecord interface in lib/erp-api.ts

Add new fields:
```typescript
MEMO_PRICE:   number | null   // memo consignment value per item
HOLD_REMARK:  string | null   // client name item is on hold for (already exists — now mapped)
```

## 2.2 Update syncStockFromErp() in lib/erp-sync.ts

In stock upsert — add new field mappings:

```typescript
// In create and update blocks:
HoldCompany: record.HOLD_REMARK?.trim() || null,
MemoPrice:   record.MEMO_PRICE ? new Decimal(record.MEMO_PRICE) : null,
```

Note: HOLD_REMARK was previously ignored. Now mapped to HoldCompany.

---

# PART 3 — Style Upload Enhancements

## 3.1 Company Autocomplete

File: components/replenishment/ReplenishmentV2Page.tsx

In the By Style upload section — add Company autocomplete ABOVE the file upload:

```tsx
{/* Company autocomplete — shown only in style upload mode */}
{searchMode === 'styleUpload' && (
  <div className="mb-4">
    <label className="block text-xs font-600 text-[#57534E] mb-1.5 uppercase tracking-wide">
      Client / Company
    </label>
    <input
      type="text"
      placeholder="Type at least 3 letters..."
      value={styleUploadClient}
      onChange={e => handleStyleClientSearch(e.target.value)}
      className="w-full border border-[#E8E3DC] rounded-lg px-3 py-2 
                 text-sm focus:outline-none focus:border-[#3B0764]"
    />
    {/* Dropdown results */}
    {styleClientResults.length > 0 && (
      <div className="absolute z-50 bg-white border border-[#E8E3DC] 
                      rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
        {styleClientResults.map(client => (
          <button
            key={client.ClientID}
            onClick={() => selectStyleClient(client)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-[#FAF8F5]"
          >
            {client.PartyName}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

State additions:
```typescript
const [styleUploadClient, setStyleUploadClient] = useState('')
const [styleUploadClientId, setStyleUploadClientId] = useState<string | null>(null)
const [styleClientResults, setStyleClientResults] = useState<Client[]>([])
```

Search logic:
```typescript
async function handleStyleClientSearch(query: string) {
  setStyleUploadClient(query)
  setStyleUploadClientId(null)  // clear selection when typing
  if (query.length < 3) { setStyleClientResults([]); return }
  const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`)
  const data = await res.json()
  setStyleClientResults(data.clients ?? [])
}

function selectStyleClient(client: Client) {
  setStyleUploadClient(client.PartyName)
  setStyleUploadClientId(client.ClientID)
  setStyleClientResults([])
}
```

Pass to API: include `clientId: styleUploadClientId` in style upload request body.

## 3.2 Sample Excel Download Button

Add download button below file upload area in style upload mode:

```tsx
<button
  onClick={downloadStyleTemplate}
  className="flex items-center gap-1.5 text-xs text-[#3B0764] 
             underline hover:no-underline mt-2"
>
  <Download size={12} />
  Download sample template
</button>
```

```typescript
function downloadStyleTemplate() {
  // Create Excel with 3 columns + sample data
  // Use exceljs (already installed)
  
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Style Upload')
  
  // Headers
  sheet.columns = [
    { header: 'StyleNo', key: 'StyleNo', width: 20 },
    { header: 'MetalType', key: 'MetalType', width: 15 },
    { header: 'Qty', key: 'Qty', width: 10 }
  ]
  
  // Style header row
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: 'FFE8E3DC' }
  }
  
  // Sample rows
  sheet.addRow({ StyleNo: 'KR09151BR46', MetalType: '14KY', Qty: 2 })
  sheet.addRow({ StyleNo: 'DVE075', MetalType: '', Qty: 1 })
  sheet.addRow({ StyleNo: 'KJN7265', MetalType: '14KW', Qty: 3 })
  
  // Add note in row below samples
  sheet.addRow({})
  const noteRow = sheet.addRow({
    StyleNo: '← Required',
    MetalType: '← Optional (empty = any metal)',
    Qty: '← Optional (default 1)'
  })
  noteRow.font = { italic: true, color: { argb: 'FFA8A29E' } }
  
  // Download
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'DVJ-style-upload-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
```

## 3.3 MetalType Empty = Any Piece Logic

File: app/api/replenishment/style-upload/route.ts
File: components/replenishment/ReplenishmentV2Page.tsx (regroupStyleUpload)

Current behavior: MetalType required for matching.

New behavior:
```typescript
function matchesMetalType(
  stockMetalType: string | null, 
  uploadMetalType: string | null
): boolean {
  // If upload MetalType is empty/null → any piece matches
  if (!uploadMetalType || uploadMetalType.trim() === '') return true
  
  // If both exist → must match exactly (case insensitive)
  return normalizeMetalType(stockMetalType) === normalizeMetalType(uploadMetalType)
}
```

Apply this in:
1. API route — when filtering warehouse stock by StyleNo + MetalType
2. Client-side regroupStyleUpload() — when matching stock to upload rows

Also update validation:
```typescript
// Remove: reject rows missing MetalType
// New: MetalType is optional — empty means any metal type
```

Update error messages:
```
Before: "Row X: MetalType is required"
After:  MetalType missing → no error, matches any metal
```

## 3.4 Hold Priority Logic

File: app/api/replenishment/style-upload/route.ts

When `clientId` is provided in request:

### Step 1 — Fetch Hold Items for This Client

```typescript
const holdItems = clientId ? await db.stock.findMany({
  where: {
    StyleNo: { in: styleNos },
    HoldDate: { not: null },        // has a hold
    HoldCompany: {                   // held for THIS client
      equals: clientPartyName,       // match by party name
      mode: 'insensitive'
    },
    Sales: { none: {} },             // not sold
    MemoStockLinks: {
      none: { Memo: { is: { IsActive: true } } }
    }
  },
  select: {
    StockNo: true,
    StyleNo: true,
    MetalType: true,
    StockValue: true,
    HoldCompany: true,
    HoldDate: true
  }
}) : []
```

### Step 2 — Priority Allocation Per Style Row

```typescript
// For each uploaded style row:
// 1. Allocate from hold items first (same StyleNo + MetalType match)
// 2. Then memo items (client already has on memo)
// 3. Then warehouse stock (no hold, no memo)
// 4. Then pullback candidates
// 5. Then factory order (remainder)

let remaining = uploadQty

// Step 1: Hold allocation
const holdMatches = holdItems.filter(h => 
  h.StyleNo === styleNo && 
  matchesMetalType(h.MetalType, uploadMetalType)
)
const holdAlloc = Math.min(remaining, holdMatches.length)
remaining -= holdAlloc

// Step 2: Memo allocation (existing logic)
const memoAlloc = Math.min(remaining, clientMemoQty)
remaining -= memoAlloc

// Step 3: Warehouse allocation (existing logic)
const stockAlloc = Math.min(remaining, warehouseItems.length)
remaining -= stockAlloc

// Step 4: Pullback allocation (existing logic)
const pullAlloc = Math.min(remaining, pullbackItems.length)
remaining -= pullAlloc

// Step 5: Factory order
const factoryAlloc = remaining
```

### Step 3 — Hold Badge in Results

Hold items show as a new badge in Status column:

```typescript
// Badge config addition:
hold: {
  label: 'On Hold',
  className: 'bg-[#FCE7F3] text-[#9D174D]'
}
```

Hold pills in warehouse stock area:
- Pink pills (same style as stock pills but pink)
- Shows StockNo of hold item
- Label: "On Hold · {StockNo}"

### Step 4 — Include Hold Items in Response

```typescript
// In API response per group:
{
  holdItems: holdMatches.map(h => ({
    stockNo: h.StockNo,
    styleNo: h.StyleNo,
    metalType: h.MetalType,
    holdCompany: h.HoldCompany
  })),
  holdAlloc: holdAlloc,
  // ... existing fields
}
```

---

# PART 4 — Status Badge Updates

## 4.1 Add Hold Badge to BADGE_CONFIG

File: components/replenishment/ReplenishmentV2Page.tsx

```typescript
// Add to BADGE_CONFIG:
hold: {
  label: 'On Hold',
  className: 'bg-[#FCE7F3] text-[#9D174D]',
  clickable: false
}
```

## 4.2 Updated Status Priority Display

When hold items exist — show Hold badge FIRST:

```
Hold ×2  Memo ×1  Stock ×1  ...
```

---

# PART 5 — Update CLAUDE.md

Add style upload documentation:
- Route: /replenishment/client (By Style tab)
- API: /api/replenishment/style-upload
- New fields: HoldCompany, MemoPrice on stock table
- Hold priority logic

---

# Build Order

1. Part 1 — Schema changes → migrate → generate
2. Part 2 — ERP sync updates (new field mappings)
3. Part 3.1 — Company autocomplete in style upload
4. Part 3.2 — Sample Excel download button
5. Part 3.3 — MetalType empty = any piece logic
6. Part 3.4 — Hold priority logic + pink badge
7. Part 4 — Badge config update
8. Part 5 — Update CLAUDE.md
9. npm run build — must pass
10. Update docs/PROGRESS.md

---

# Notes for Cursor

- HoldCompany matched against client's PartyName (case insensitive)
- If no client selected in style upload → skip hold logic entirely
- MetalType empty in upload → matchesMetalType returns true for any stock metal
- Hold items take priority OVER memo, stock, pullback
- Hold badge: bg-[#FCE7F3] text-[#9D174D] "On Hold"
- Hold pills: same style as warehouse pills but pink
- Sample file filename: DVJ-style-upload-template.xlsx
- Sample file has 3 columns: StyleNo (required), MetalType (optional), Qty (optional, default 1)
- Do one build order step at a time
- Build must pass after each step