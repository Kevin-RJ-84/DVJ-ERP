# CHANGES-9.md — ERP Stock API Sync + Style Rank Badge + Seasonal Stock Replenishment

Read CLAUDE.md for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order. Do NOT touch any files not mentioned.

---

# PART 1 — New DB Columns (Schema Updates)

## 1.1 Add missing columns to stock table

```prisma
model stock {
  // ...existing columns...
  
  // New columns from ERP API
  Size              String?   @db.VarChar        // PROD_SIZE from API
  StoneType         String?   @db.VarChar        // STONE_TYPES from API (e.g. LGD, Diamond)
  StockValue        Decimal?  @db.Decimal(12, 2) // PROD_VAL from API
  Metal             String?   @db.VarChar        // Parsed from METAL_TYPE (e.g. Yellow Gold)
  MetalPurity       String?   @db.VarChar        // Parsed from METAL_TYPE (e.g. 14K, 18K)
  HoldSoldRemark    String?   @db.VarChar        // HOLD_SOLD_REMARK from API
  HoldSoldDate      DateTime? @db.Date           // HOLD_SOLD_DATE from API
  LastSyncedAt      DateTime? @db.Timestamp(6)   // When this record was last synced from ERP
  SyncSource        String?   @db.VarChar        // 'api' | 'excel' — where data came from
}
```

## 1.2 Add new system config keys

Add to `prisma/seed.ts`:

```typescript
// ── S-Class ──
{ ConfigKey: 'sclass_min_revenue_per_piece', ConfigValue: '500', ConfigType: 'decimal',
  Description: 'Avg sale value above which a StyleNo is S-class. Checked before ABC ranking.', Module: 'stock_replenishment' },
{ ConfigKey: 'sclass_fixed_min_stock', ConfigValue: '1', ConfigType: 'integer',
  Description: 'Fixed minimum pieces to always keep for S-class. No trend calculation applied.', Module: 'stock_replenishment' },

// ── ABC Distribution ──
{ ConfigKey: 'abc_a_class_pct', ConfigValue: '20', ConfigType: 'integer',
  Description: 'Top X% of styles by annual revenue = A-class. A+B must not exceed 99.', Module: 'stock_replenishment' },
{ ConfigKey: 'abc_b_class_pct', ConfigValue: '30', ConfigType: 'integer',
  Description: 'Next X% of styles by annual revenue = B-class. C = 100 - A - B (auto).', Module: 'stock_replenishment' },

// ── Buffers — global toggle ──
{ ConfigKey: 'buffer_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Master switch — when OFF all class buffers ignored', Module: 'stock_replenishment' },

// ── Buffers — per class toggle + multiplier ──
{ ConfigKey: 'buffer_a_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Apply buffer to A-class styles', Module: 'stock_replenishment' },
{ ConfigKey: 'buffer_a_multiplier', ConfigValue: '1.2', ConfigType: 'decimal',
  Description: 'Buffer multiplier for A-class styles (e.g. 1.2 = 20% safety stock)', Module: 'stock_replenishment' },

{ ConfigKey: 'buffer_b_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Apply buffer to B-class styles', Module: 'stock_replenishment' },
{ ConfigKey: 'buffer_b_multiplier', ConfigValue: '1.15', ConfigType: 'decimal',
  Description: 'Buffer multiplier for B-class styles', Module: 'stock_replenishment' },

{ ConfigKey: 'buffer_c_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Apply buffer to C-class styles', Module: 'stock_replenishment' },
{ ConfigKey: 'buffer_c_multiplier', ConfigValue: '1.05', ConfigType: 'decimal',
  Description: 'Buffer multiplier for C-class styles (lean — stay close to prediction)', Module: 'stock_replenishment' },

// ── Method 1 — YoY Same Month ──
{ ConfigKey: 'stock_velocity_years_back', ConfigValue: '3', ConfigType: 'integer',
  Description: 'How many past years to look at for same-month sales history', Module: 'stock_replenishment' },

// ── Method 2 — Seasonal Arc ──
{ ConfigKey: 'stock_window_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Use seasonal arc (multi-month window) as Method 2', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_window_size', ConfigValue: '4', ConfigType: 'integer',
  Description: 'Number of months in window including current month (e.g. 4 = Feb+Mar+Apr+May)', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_window_direction', ConfigValue: 'backward', ConfigType: 'enum',
  Description: 'backward = preceding months | forward = following months in past years', Module: 'stock_replenishment' },

// ── Window Weights ──
{ ConfigKey: 'stock_window_weight_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Apply weights to window months (current month gets more weight)', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_window_weight_mode', ConfigValue: 'auto', ConfigType: 'enum',
  Description: 'auto = current month 50% rest split equally | manual = user sets each weight', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_window_weight_current', ConfigValue: '50', ConfigType: 'integer',
  Description: 'Weight % for current month in auto mode', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_window_weights_manual', ConfigValue: '{}', ConfigType: 'json',
  Description: 'Manual weights per month offset. e.g. {"0":50,"−1":30,"−2":20} must sum to 100', Module: 'stock_replenishment' },

// ── Blending ──
{ ConfigKey: 'stock_method1_weight', ConfigValue: '50', ConfigType: 'integer',
  Description: 'Weight % for Method 1 (YoY same month) in final blend. Method 2 = 100 - this.', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_confidence_gap_warning', ConfigValue: '30', ConfigType: 'integer',
  Description: 'If Method 1 and Method 2 differ by more than X% — flag for manual review', Module: 'stock_replenishment' },

// ── CV Noise Filter ──
{ ConfigKey: 'stock_cv_trust_threshold', ConfigValue: '0.3', ConfigType: 'decimal',
  Description: 'CV below this = consistent data = trust growth fully', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_cv_dampen_threshold', ConfigValue: '0.7', ConfigType: 'decimal',
  Description: 'CV between trust and this = dampen growth by 50%. CV above this = ignore growth.', Module: 'stock_replenishment' },

// ── Safety ──
{ ConfigKey: 'stock_global_minimum', ConfigValue: '1', ConfigType: 'integer',
  Description: 'Absolute minimum stock floor — no style ever goes below this', Module: 'stock_replenishment' },

// ── Feedback Loop (Phase 2 — built now, activated later) ──
{ ConfigKey: 'stock_feedback_enabled', ConfigValue: 'false', ConfigType: 'boolean',
  Description: 'Track forecast accuracy for future ML bias correction. OFF until 6+ months data.', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_bias_correction_enabled', ConfigValue: 'false', ConfigType: 'boolean',
  Description: 'Apply learned bias correction to predictions. OFF until feedback data matures.', Module: 'stock_replenishment' },
{ ConfigKey: 'stock_bias_window_months', ConfigValue: '6', ConfigType: 'integer',
  Description: 'How many months of forecast history to use for bias score calculation', Module: 'stock_replenishment' },

// ── ERP Sync ──
{ ConfigKey: 'erp_sync_enabled', ConfigValue: 'true', ConfigType: 'boolean',
  Description: 'Whether auto ERP sync is enabled', Module: 'system' },
{ ConfigKey: 'erp_sync_interval_minutes', ConfigValue: '30', ConfigType: 'integer',
  Description: 'Auto sync interval in minutes', Module: 'system' },
{ ConfigKey: 'erp_last_stock_sync', ConfigValue: '', ConfigType: 'string',
  Description: 'Last successful stock sync timestamp', Module: 'system' },
```

Run migration after adding columns.
Run seed after adding config keys.

---

# PART 2 — ERP API Integration Library

## 2.1 New file: lib/erp-api.ts

```typescript
/**
 * ERP API client for DVJ Jewelry Corp
 * Handles authentication + data fetching from external ERP system
 */

const ERP_BASE_URL = process.env.ERP_API_BASE_URL!
const ERP_LOGIN_TYPE = process.env.ERP_LOGIN_TYPE ?? ''
const ERP_USERNAME = process.env.ERP_USER_NAME!
const ERP_PASSWORD = process.env.ERP_PASSWORD!
const ERP_USER_ID = process.env.ERP_USER_ID ?? 'HITESH'
const ERP_REMOTE_ADDRESS = process.env.ERP_REMOTE_ADDRESS ?? ''
const ERP_COMMAND_TYPE = process.env.ERP_COMMAND_TYPE ?? 'GETDATA'

// Auth token cached in memory (re-auth if expired)
let cachedToken: string | null = null
let tokenExpiresAt: Date | null = null

/**
 * Authenticate with ERP and return token
 * Caches token in memory until expiry
 */
export async function getErpToken(): Promise<string> {
  // Return cached token if still valid (5 min buffer)
  if (cachedToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
    return cachedToken
  }

  const response = await fetch(`${ERP_BASE_URL}/api/Authenticate/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loginType: ERP_LOGIN_TYPE,
      userName: ERP_USERNAME,
      password: ERP_PASSWORD,
      sessionId: '',
      remoteAddress: ERP_REMOTE_ADDRESS,
      remoteHost: '',
      remoteUser: '',
      urlName: ''
    })
  })

  if (!response.ok) {
    throw new Error(`ERP auth failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  
  // Extract token — adjust field name based on actual API response
  const token = data.token ?? data.Token ?? data.access_token ?? data.data?.token
  if (!token) {
    throw new Error('ERP auth response missing token field')
  }

  cachedToken = token
  // Cache for 50 minutes (assuming 1hr expiry)
  tokenExpiresAt = new Date(Date.now() + 50 * 60 * 1000)
  
  return token
}

/**
 * Fetch all stock records from ERP
 */
export async function fetchErpStock(): Promise<ErpStockRecord[]> {
  const token = await getErpToken()

  const response = await fetch(`${ERP_BASE_URL}/api/JewelryReport/getJewelryStock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      command_type: ERP_COMMAND_TYPE,
      user_id: ERP_USER_ID
    })
  })

  if (!response.ok) {
    throw new Error(`ERP stock fetch failed: ${response.status}`)
  }

  const data = await response.json()
  // API may return array directly or nested in a data field
  return Array.isArray(data) ? data : (data.data ?? data.records ?? [])
}

/**
 * Fetch all sales records from ERP
 */
export async function fetchErpSales(): Promise<ErpSaleRecord[]> {
  const token = await getErpToken()

  const response = await fetch(`${ERP_BASE_URL}/api/JewelryReport/getJewelrySale`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      command_type: ERP_COMMAND_TYPE,
      user_id: ERP_USER_ID
    })
  })

  if (!response.ok) {
    throw new Error(`ERP sales fetch failed: ${response.status}`)
  }

  const data = await response.json()
  return Array.isArray(data) ? data : (data.data ?? data.records ?? [])
}

// TypeScript types for ERP responses
export interface ErpStockRecord {
  PROD_CODE: string
  LOCATION: string
  PROD_SIZE: string | null
  PROD_TYPE: string | null
  PROD_STYLE_CODE: string | null
  PROD_STYLE: string | null
  STONE_TYPES: string | null
  STONE_WT: number | null
  QUANTITY: number | null
  STONE_PCS: number | null
  STONE_SHAPES: string | null
  METAL_TYPE: string | null
  METAL_WT: number | null
  PROD_VAL: number | null
  MEMO_REMARK: string | null
  MEMO_DATE: string | null
  HOLD_REMARK: string | null
  HOLD_DATE: string | null
  HOLD_SOLD_REMARK: string | null
  HOLD_SOLD_DATE: string | null
  ROWID: number
  // Future fields (when API team adds them)
  MEMO_PARTY_CODE?: string | null
  MEMO_PARTY_NAME?: string | null
  MEMO_TERMS_DAYS?: number | null
  PROD_DESC?: string | null
  BOX_CODE?: string | null
}

export interface ErpSaleRecord {
  INVOICE_NO: string
  INV_DATE: string
  PROD_CODE: string
  LOCATION: string | null
  PROD_SIZE: string | null
  PROD_TYPE: string | null
  PROD_STYLE_CODE: string | null
  PROD_STYLE: string | null
  STONE_TYPES: string | null
  STONE_WT: number | null
  STONE_PCS: number | null
  STONE_SHAPES: string | null
  METAL_TYPE: string | null
  METAL_WT: number | null
  PROD_VAL: number | null
  ROWID: number
  // Future fields
  PARTY_CODE?: string | null
  PARTY_NAME?: string | null
  CR_AMOUNT?: number | null
}
```

## 2.2 Metal parsing helper

Add to `lib/erp-api.ts`:

```typescript
/**
 * Parse METAL_TYPE code into Metal + MetalPurity
 * Examples: 14KY → {metal: 'Yellow Gold', purity: '14K'}
 *           18KW → {metal: 'White Gold', purity: '18K'}
 *           PT   → {metal: 'Platinum', purity: 'PT'}
 */
export function parseMetalType(metalType: string | null): { 
  metal: string | null
  purity: string | null 
} {
  if (!metalType) return { metal: null, purity: null }
  
  const mt = metalType.trim().toUpperCase()
  
  const karatMatch = mt.match(/^(\d+K)/)
  const karat = karatMatch ? karatMatch[1] : null
  
  let metal: string | null = null
  
  if (mt.includes('Y')) metal = 'Yellow Gold'
  else if (mt.includes('W')) metal = 'White Gold'
  else if (mt.includes('R') || mt.includes('P')) metal = 'Rose Gold'
  else if (mt.startsWith('PT')) { metal = 'Platinum'; return { metal, purity: 'PT' } }
  else if (mt.startsWith('SS')) { metal = 'Silver'; return { metal, purity: 'SS' } }
  else if (karat) metal = 'Gold'
  
  return { metal, purity: karat }
}
```

---

# PART 3 — Stock Sync Logic

## 3.1 New file: lib/erp-sync.ts

```typescript
/**
 * ERP sync logic — fetches data from ERP API and upserts into DB
 * Reuses existing memo lifecycle logic from upload route
 */

export interface StockSyncResult {
  inserted: number
  updated: number
  markedSold: number
  markedReturned: number
  flaggedMissing: number
  memosDeactivated: number
  errors: string[]
  syncedAt: Date
}

export async function syncStockFromErp(): Promise<StockSyncResult> {
  const result: StockSyncResult = {
    inserted: 0, updated: 0,
    markedSold: 0, markedReturned: 0,
    flaggedMissing: 0, memosDeactivated: 0,
    errors: [], syncedAt: new Date()
  }

  // 1. Fetch from ERP
  const erpRecords = await fetchErpStock()
  if (!erpRecords.length) {
    throw new Error('ERP returned empty stock data')
  }

  const uploadedStockNos = new Set(erpRecords.map(r => r.PROD_CODE.trim()))
  const lastRowByStockNo = new Map<string, ErpStockRecord>()
  for (const record of erpRecords) {
    lastRowByStockNo.set(record.PROD_CODE.trim(), record)
  }

  // 2. Upsert each stock record
  for (const record of erpRecords) {
    const stockNo = record.PROD_CODE.trim()
    const { metal, purity } = parseMetalType(record.METAL_TYPE)
    const hasMemo = Boolean(record.MEMO_DATE)
    const isReturned = !hasMemo && !record.HOLD_DATE

    try {
      await db.stock.upsert({
        where: { StockNo: stockNo },
        create: {
          StockNo: stockNo,
          Location: record.LOCATION?.trim() ?? null,
          Size: record.PROD_SIZE?.trim() ?? null,
          ProductType: record.PROD_TYPE?.trim() ?? null,
          StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
          ProductStyle: record.PROD_STYLE?.trim() ?? null,
          StoneType: record.STONE_TYPES?.trim() ?? null,
          StoneShape: record.STONE_SHAPES?.trim() ?? null,
          StoneWT: record.STONE_WT ? new Decimal(record.STONE_WT) : null,
          StonePCs: record.STONE_PCS ? new Decimal(record.STONE_PCS) : null,
          MetalType: record.METAL_TYPE?.trim() ?? null,
          Metal: metal,
          MetalPurity: purity,
          MetalWT: record.METAL_WT ? new Decimal(record.METAL_WT) : null,
          StockValue: record.PROD_VAL ? new Decimal(record.PROD_VAL) : null,
          HoldDate: record.HOLD_DATE ? new Date(record.HOLD_DATE) : null,
          HoldNarration: record.HOLD_REMARK?.trim() ?? null,
          HoldSoldDate: record.HOLD_SOLD_DATE ? new Date(record.HOLD_SOLD_DATE) : null,
          HoldSoldRemark: record.HOLD_SOLD_REMARK?.trim() ?? null,
          LastSyncedAt: new Date(),
          SyncSource: 'api'
        },
        update: {
          Location: record.LOCATION?.trim() ?? null,
          Size: record.PROD_SIZE?.trim() ?? null,
          ProductType: record.PROD_TYPE?.trim() ?? null,
          StyleNo: record.PROD_STYLE_CODE?.trim() ?? null,
          ProductStyle: record.PROD_STYLE?.trim() ?? null,
          StoneType: record.STONE_TYPES?.trim() ?? null,
          StoneShape: record.STONE_SHAPES?.trim() ?? null,
          StoneWT: record.STONE_WT ? new Decimal(record.STONE_WT) : null,
          StonePCs: record.STONE_PCS ? new Decimal(record.STONE_PCS) : null,
          MetalType: record.METAL_TYPE?.trim() ?? null,
          Metal: metal,
          MetalPurity: purity,
          MetalWT: record.METAL_WT ? new Decimal(record.METAL_WT) : null,
          StockValue: record.PROD_VAL ? new Decimal(record.PROD_VAL) : null,
          HoldDate: record.HOLD_DATE ? new Date(record.HOLD_DATE) : null,
          HoldNarration: record.HOLD_REMARK?.trim() ?? null,
          HoldSoldDate: record.HOLD_SOLD_DATE ? new Date(record.HOLD_SOLD_DATE) : null,
          HoldSoldRemark: record.HOLD_SOLD_REMARK?.trim() ?? null,
          LastSyncedAt: new Date(),
          SyncSource: 'api',
          IsMissing: false  // clear missing flag if item reappears
        }
      })
      result.updated++
    } catch (err) {
      result.errors.push(`Failed to upsert ${stockNo}: ${err}`)
    }
  }

  // 3. Run memo lifecycle (same logic as Excel upload)
  // Detect sold/returned/missing items
  // Reuse applyStockUploadMemoLifecyclePasses from upload route
  // (extract to shared lib function if not already)
  const lifecycleResult = await applyStockUploadMemoLifecyclePasses(
    uploadedStockNos,
    lastRowByStockNo as any  // adapt type
  )
  result.markedSold = lifecycleResult.markedSold
  result.markedReturned = lifecycleResult.markedReturned
  result.flaggedMissing = lifecycleResult.flaggedMissing
  result.memosDeactivated = lifecycleResult.memosDeactivated

  // 4. Handle memo creation for items with MEMO_DATE
  for (const record of erpRecords) {
    const stockNo = record.PROD_CODE.trim()
    if (record.MEMO_DATE) {
      await syncMemoFromErpRecord(record, stockNo)
    }
  }

  // 5. Update last sync timestamp in config
  await db.system_config.update({
    where: { ConfigKey: 'erp_last_stock_sync' },
    data: { ConfigValue: new Date().toISOString() }
  })

  return result
}

/**
 * Create/update memo record from ERP stock record
 * MEMO_PARTY_CODE/MEMO_PARTY_NAME used when available
 * Falls back to MEMO_REMARK for client matching until API adds dedicated fields
 */
async function syncMemoFromErpRecord(
  record: ErpStockRecord,
  stockNo: string
): Promise<void> {
  const memoDate = new Date(record.MEMO_DATE!)
  
  // Get terms — use dedicated field when available, else default
  const terms = record.MEMO_TERMS_DAYS ?? 30
  const memoEndDate = new Date(memoDate)
  memoEndDate.setDate(memoEndDate.getDate() + terms)

  // Find client — use party code/name when available
  // Fall back to MEMO_REMARK for now
  let clientId: string | null = null
  
  const partyName = record.MEMO_PARTY_NAME?.trim() 
    ?? record.MEMO_REMARK?.trim() 
    ?? null

  if (partyName) {
    const client = await db.clients.findFirst({
      where: { PartyName: { equals: partyName, mode: 'insensitive' } }
    })
    if (client) {
      clientId = client.ClientID
    } else {
      // Auto-create client
      const newClient = await db.clients.create({
        data: { PartyName: partyName, PartyCode: record.MEMO_PARTY_CODE?.trim() ?? null }
      })
      clientId = newClient.ClientID
    }
  }

  // Upsert memo
  const memoNo = `ERP-${stockNo}-${memoDate.toISOString().split('T')[0]}`
  
  await db.memo.upsert({
    where: { MemoNo: memoNo },
    create: {
      MemoNo: memoNo,
      MemoDate: memoDate,
      Terms: terms,
      MemoEndDate: memoEndDate,
      MemoNarration: record.MEMO_REMARK?.trim() ?? null,
      ClientID: clientId,
      StockNo: stockNo,
      IsActive: true
    },
    update: {
      Terms: terms,
      MemoEndDate: memoEndDate,
      MemoNarration: record.MEMO_REMARK?.trim() ?? null,
      ClientID: clientId
    }
  })
}
```

---

# PART 4 — Sync API Routes

## 4.1 New route: POST /api/erp/sync/stock

```typescript
// app/api/erp/sync/stock/route.ts
// Permission: upload.stock
// Triggers manual stock sync from ERP

export async function POST(req: NextRequest) {
  const user = await requireAuth(req)
  if (!user) return unauthorized()
  await requirePermission(user.userId, 'upload.stock')

  try {
    const result = await syncStockFromErp()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
```

## 4.2 New route: GET /api/erp/sync/status

```typescript
// Returns last sync time + whether sync is enabled
// Permission: replenishment.view

export async function GET(req: NextRequest) {
  const lastSync = await getConfig('erp_last_stock_sync')
  const syncEnabled = await getConfigBool('erp_sync_enabled')
  const intervalMinutes = await getConfigInt('erp_sync_interval_minutes')

  return NextResponse.json({
    lastStockSync: lastSync || null,
    syncEnabled,
    intervalMinutes
  })
}
```

---

# PART 5 — Auto Sync (Every 30 Minutes)

## 5.1 New file: lib/erp-auto-sync.ts

Use Next.js route with a cron-like approach via Vercel Cron or a simple interval check on API routes:

```typescript
/**
 * Check if auto sync should run and trigger if needed
 * Called at the start of replenishment API requests
 * Non-blocking — runs in background, doesn't delay response
 */
export async function triggerAutoSyncIfDue(): Promise<void> {
  try {
    const syncEnabled = await getConfigBool('erp_sync_enabled')
    if (!syncEnabled) return

    const lastSyncStr = await getConfig('erp_last_stock_sync')
    const intervalMinutes = await getConfigInt('erp_sync_interval_minutes')

    if (lastSyncStr) {
      const lastSync = new Date(lastSyncStr)
      const minutesSinceSync = (Date.now() - lastSync.getTime()) / 1000 / 60
      if (minutesSinceSync < intervalMinutes) return  // not due yet
    }

    // Run sync in background — don't await
    syncStockFromErp().catch(err => 
      console.error('Auto ERP sync failed:', err)
    )
  } catch (err) {
    console.error('Auto sync check failed:', err)
  }
}
```

## 5.2 Trigger auto sync from replenishment API

Add to `app/api/replenishment/v2/route.ts` at the top of the GET handler:

```typescript
// Trigger auto ERP sync if due — non-blocking
triggerAutoSyncIfDue()
```

---

# PART 6 — Manual Sync Button in Navbar

## 6.1 Update DashboardTopBar/Navbar component

Add sync status indicator + manual sync button to navbar:

```tsx
// Show in navbar right side, before Upload Excel button

{/* ERP Sync Status */}
<div className="flex items-center gap-2">
  {syncStatus && (
    <span className="text-xs text-[#A8A29E]">
      Synced {formatRelativeTime(syncStatus.lastStockSync)}
    </span>
  )}
  <button
    onClick={handleManualSync}
    disabled={isSyncing}
    className="flex items-center gap-1.5 px-3 py-1.5 
               text-xs font-medium rounded-lg
               border border-[#E8E3DC] bg-white
               hover:bg-[#FAF8F5] hover:border-[#3B0764]
               disabled:opacity-50 disabled:cursor-not-allowed
               transition-all duration-150"
  >
    <RefreshCw 
      size={13} 
      className={isSyncing ? 'animate-spin' : ''} 
    />
    {isSyncing ? 'Syncing...' : 'Sync ERP'}
  </button>
</div>
```

**handleManualSync:**
```typescript
async function handleManualSync() {
  setIsSyncing(true)
  try {
    const res = await fetch('/api/erp/sync/stock', { method: 'POST' })
    const data = await res.json()
    if (data.success) {
      toast.success(`Synced: ${data.updated} updated, ${data.inserted} new`)
      setSyncStatus({ lastStockSync: new Date().toISOString() })
    } else {
      toast.error(`Sync failed: ${data.error}`)
    }
  } finally {
    setIsSyncing(false)
  }
}
```

---

# PART 7 — Settings Screen — ERP Sync Tab

## 7.1 Add Tab 6 "ERP Sync" to SystemSettingsPage.tsx

```
Tab 6 — ERP Sync

Auto Sync: [Toggle ON/OFF]
Sync Interval: [30 minutes ▼]  (15 / 30 / 60 / 120 mins)

Last Stock Sync: "May 26, 2026 10:30 AM" or "Never"
Last Sales Sync: "Coming soon — awaiting API fields"

[Sync Stock Now] button
Status: shows result of last sync (inserted/updated/errors)
```

---

# PART 8 — Complete Stock Replenishment Logic (ABC + S-Class + Dual Method + Seasonal Arc)

## Overview

Two independent methods calculate a prediction. Both are blended for the final threshold.

```
Method 1 — YoY Same Month:
  "What did this month look like historically?"
  Uses: actual same-month sales across past X years + YoY trend + CV noise filter

Method 2 — Seasonal Arc:
  "Where is this year's sales curve pointing?"
  Uses: historical month-to-month arc + current year actual data

Final = Blend(Method1, Method2) × class buffer
Floor = MAX(result, global_minimum)
```

## 8.1 New DB Table — stock_forecast_accuracy (Phase 2)

Build now, activate later via config toggle.

```prisma
model stock_forecast_accuracy {
  AccuracyID          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  StyleNo             String    @db.VarChar
  ForecastMonth       DateTime  @db.Date           // Which month was predicted
  PredictedThreshold  Int                          // What system said minimum was
  ActualSold          Int?                         // What actually sold (filled after month ends)
  Error               Int?                         // ActualSold - PredictedThreshold
  ErrorPct            Decimal?  @db.Decimal(8, 4)  // Error as % of predicted
  Method1Result       Int?                         // Method 1 contribution
  Method2Result       Int?                         // Method 2 contribution
  StockClass          String    @db.VarChar        // S/A/B/C at time of forecast
  CreatedAt           DateTime  @default(now()) @db.Timestamp(6)

  @@index([StyleNo])
  @@index([ForecastMonth])
  @@map("stock_forecast_accuracy")
}
```

## 8.2 Velocity Classification — New file: lib/stock-classification.ts

```typescript
/**
 * Classifies each StyleNo into S / A / B / C class
 * based on avg revenue per piece and annual revenue contribution
 */

export type StockClass = 'S' | 'A' | 'B' | 'C'

export interface StyleClassification {
  styleNo: string
  stockClass: StockClass
  avgRevenuePerPiece: number
  annualRevenue: number
  annualPieces: number
}

export async function classifyAllStyles(): Promise<Map<string, StyleClassification>> {
  // Read config
  const sClassMinRevenue   = await getConfigDecimal('sclass_min_revenue_per_piece')  // 500
  const aClassPct          = await getConfigInt('abc_a_class_pct')                   // 20
  const bClassPct          = await getConfigInt('abc_b_class_pct')                   // 30
  // C = 100 - A - B (auto)

  // Get annual revenue per StyleNo from sales
  const currentYear = new Date().getFullYear()
  const yearStart = new Date(currentYear, 0, 1)

  const salesByStyle = await db.$queryRaw<{
    StyleNo: string
    totalRevenue: number
    totalPieces: number
    avgRevenuePerPiece: number
  }[]>`
    SELECT 
      "StyleNo",
      SUM("SaleValue") as "totalRevenue",
      COUNT(*) as "totalPieces",
      AVG("SaleValue") as "avgRevenuePerPiece"
    FROM sales
    WHERE "StyleNo" IS NOT NULL
      AND "SaleValue" IS NOT NULL
      AND "InvoiceDate" >= ${yearStart}
    GROUP BY "StyleNo"
    ORDER BY SUM("SaleValue") DESC
  `

  const totalStyles = salesByStyle.length
  const aCount = Math.ceil(totalStyles * aClassPct / 100)
  const bCount = Math.ceil(totalStyles * bClassPct / 100)

  const result = new Map<string, StyleClassification>()

  salesByStyle.forEach((row, index) => {
    let stockClass: StockClass

    // S-class check first — based purely on avg revenue per piece
    if (row.avgRevenuePerPiece >= sClassMinRevenue) {
      stockClass = 'S'
    } else if (index < aCount) {
      stockClass = 'A'
    } else if (index < aCount + bCount) {
      stockClass = 'B'
    } else {
      stockClass = 'C'
    }

    result.set(row.StyleNo, {
      styleNo: row.StyleNo,
      stockClass,
      avgRevenuePerPiece: row.avgRevenuePerPiece,
      annualRevenue: row.totalRevenue,
      annualPieces: Number(row.totalPieces)
    })
  })

  return result
}
```

## 8.3 Threshold Calculation — Update lib/stock-replenishment.ts

```typescript
/**
 * Calculate minimum threshold for a StyleNo
 * Uses two independent methods then blends them:
 *
 * Method 1 — YoY Same Month:
 *   Actual same-month sales across past X years + trend + CV filter
 *
 * Method 2 — Seasonal Arc:
 *   Historical month-to-month arc projected from current year data
 *   Falls back to Method 1 only if no current year data available
 */

export async function calculateThreshold(
  styleNo: string,
  classification: StyleClassification | undefined
): Promise<{ threshold: number; method1: number | null; method2: number | null; stockClass: StockClass }> {

  const globalMin     = await getConfigInt('stock_global_minimum')       // 1
  const yearsBack     = await getConfigInt('stock_velocity_years_back')  // 3
  const bufferEnabled = await getConfigBool('buffer_enabled')
  const cvTrust       = await getConfigDecimal('stock_cv_trust_threshold')   // 0.3
  const cvDampen      = await getConfigDecimal('stock_cv_dampen_threshold')  // 0.7
  const m1Weight      = await getConfigInt('stock_method1_weight')           // 50
  const gapWarning    = await getConfigInt('stock_confidence_gap_warning')   // 30
  const windowEnabled = await getConfigBool('stock_window_enabled')
  const windowSize    = await getConfigInt('stock_window_size')              // 4
  const windowDir     = await getConfig('stock_window_direction')            // backward
  const weightEnabled = await getConfigBool('stock_window_weight_enabled')
  const weightMode    = await getConfig('stock_window_weight_mode')          // auto
  const weightCurrent = await getConfigInt('stock_window_weight_current')    // 50

  const stockClass = classification?.stockClass ?? 'C'

  // ── S-class → fixed minimum, skip all calculation ──
  if (stockClass === 'S') {
    const sFixedMin = await getConfigInt('sclass_fixed_min_stock')
    return { threshold: Math.max(sFixedMin, globalMin), method1: null, method2: null, stockClass }
  }

  const currentMonth = new Date().getMonth() + 1  // 1-12
  const currentYear  = new Date().getFullYear()

  // ─────────────────────────────────────────────────
  // METHOD 1 — YoY Same Month
  // ─────────────────────────────────────────────────

  // Get actual same-month sales for past X years (skip years with no data)
  const sameMonthlySales: number[] = []

  for (let y = 1; y <= yearsBack; y++) {
    const year = currentYear - y
    const start = new Date(year, currentMonth - 1, 1)
    const end   = new Date(year, currentMonth, 0)

    const count = await db.sales.count({
      where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } }
    })
    if (count > 0) sameMonthlySales.push(count)
  }

  let method1: number | null = null

  if (sameMonthlySales.length > 0) {
    // Base average
    const baseAvg = sameMonthlySales.reduce((a, b) => a + b, 0) / sameMonthlySales.length

    // CV check — how consistent is this data?
    const mean   = baseAvg
    const stdDev = Math.sqrt(sameMonthlySales.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sameMonthlySales.length)
    const cv     = mean > 0 ? stdDev / mean : 1

    // YoY growth rates
    let trendMultiplier = 1.0
    if (sameMonthlySales.length >= 2) {
      const growthRates: number[] = []
      for (let i = 1; i < sameMonthlySales.length; i++) {
        const prev = sameMonthlySales[i]      // older
        const curr = sameMonthlySales[i - 1]  // more recent
        if (prev > 0) growthRates.push(((curr - prev) / prev) * 100)
      }
      if (growthRates.length > 0) {
        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length

        // CV-based dampening
        if (cv < cvTrust) {
          // Consistent — trust fully
          trendMultiplier = 1 + (avgGrowth / 100)
        } else if (cv < cvDampen) {
          // Moderate volatility — use 50% of growth signal
          trendMultiplier = 1 + (avgGrowth / 100 * 0.5)
        } else {
          // High volatility — ignore growth, use mean only
          trendMultiplier = 1.0
        }
      }
    }

    method1 = baseAvg * trendMultiplier
  }

  // ─────────────────────────────────────────────────
  // METHOD 2 — Seasonal Arc
  // ─────────────────────────────────────────────────

  let method2: number | null = null

  if (windowEnabled && windowSize > 1) {

    // Build month offsets based on direction and size
    // backward: [0, -1, -2, -3] for size=4
    // forward:  [0, +1, +2, +3] for size=4
    const offsets: number[] = []
    for (let i = 0; i < windowSize; i++) {
      offsets.push(windowDir === 'forward' ? i : -i)
    }
    // offsets[0] = current month (offset 0)

    // Calculate weights
    const weights: number[] = []
    if (weightEnabled) {
      if (weightMode === 'auto') {
        // Current month = weightCurrent%, rest split equally
        const remainingWeight = 100 - weightCurrent
        const otherMonthWeight = remainingWeight / (windowSize - 1)
        weights.push(weightCurrent / 100)
        for (let i = 1; i < windowSize; i++) weights.push(otherMonthWeight / 100)
      } else {
        // Manual weights from config
        const manualWeights = await getConfig('stock_window_weights_manual')
        const parsed = JSON.parse(manualWeights || '{}')
        for (let i = 0; i < windowSize; i++) {
          weights.push((parsed[String(offsets[i])] ?? (100 / windowSize)) / 100)
        }
      }
    } else {
      // Equal weights
      for (let i = 0; i < windowSize; i++) weights.push(1 / windowSize)
    }

    // For each past year — get sales for each month in window
    // Build arc: month-to-month growth rates for each step
    const arcSteps: number[][] = Array(windowSize - 1).fill(null).map(() => [])

    for (let y = 1; y <= yearsBack; y++) {
      const year = currentYear - y
      const monthlySales: (number | null)[] = []

      for (const offset of offsets) {
        const targetMonth = currentMonth + offset
        const targetDate  = new Date(year, targetMonth - 1, 1)
        const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
        const end   = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)

        const count = await db.sales.count({
          where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } }
        })
        monthlySales.push(count > 0 ? count : null)
      }

      // Calculate arc steps for this year (only if all months have data)
      const allPresent = monthlySales.every(v => v !== null)
      if (allPresent) {
        for (let s = 0; s < windowSize - 1; s++) {
          const from = monthlySales[s]!
          const to   = monthlySales[s + 1]!
          if (from > 0) arcSteps[s].push(((to - from) / from) * 100)
        }
      }
    }

    // Average arc steps across years
    const avgArc: number[] = arcSteps.map(steps =>
      steps.length > 0
        ? steps.reduce((a, b) => a + b, 0) / steps.length
        : 0
    )

    // Find most recent current year month with data
    // Try from most recent offset back to current month
    // offsets are [0, -1, -2, -3] for backward
    // We want most recent = offset closest to 0
    let anchorValue: number | null = null
    let anchorOffsetIndex = -1

    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i]
      const targetMonth  = currentMonth + offset
      const targetDate   = new Date(currentYear, targetMonth - 1, 1)
      const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)
      const end   = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0)

      if (start > new Date()) continue  // future month — skip

      const count = await db.sales.count({
        where: { StyleNo: styleNo, InvoiceDate: { gte: start, lte: end } }
      })
      if (count > 0) {
        anchorValue = count
        anchorOffsetIndex = i
        break  // use most recent available
      }
    }

    if (anchorValue !== null && anchorOffsetIndex >= 0) {
      // Project forward from anchor to current month using arc
      let projected = anchorValue
      for (let s = anchorOffsetIndex - 1; s >= 0; s--) {
        projected = projected * (1 + avgArc[s] / 100)
      }
      method2 = projected
    }
  }

  // ─────────────────────────────────────────────────
  // BLEND Method 1 + Method 2
  // ─────────────────────────────────────────────────

  let blended: number

  if (method1 !== null && method2 !== null) {
    const m2Weight = 100 - m1Weight
    blended = (method1 * m1Weight / 100) + (method2 * m2Weight / 100)

    // Gap warning check
    const gap = Math.abs(method1 - method2) / Math.max(method1, method2) * 100
    if (gap > gapWarning) {
      console.warn(`[StockThreshold] ${styleNo}: Method1=${method1.toFixed(1)} vs Method2=${method2.toFixed(1)} — gap ${gap.toFixed(1)}% exceeds ${gapWarning}% warning threshold`)
    }
  } else if (method1 !== null) {
    blended = method1  // only Method 1 available
  } else if (method2 !== null) {
    blended = method2  // only Method 2 available
  } else {
    return { threshold: globalMin, method1: null, method2: null, stockClass }
  }

  // ─────────────────────────────────────────────────
  // APPLY CLASS BUFFER
  // ─────────────────────────────────────────────────

  let finalThreshold = blended

  if (bufferEnabled) {
    const classKey = stockClass.toLowerCase()
    const classBufferEnabled    = await getConfigBool(`buffer_${classKey}_enabled`)
    const classBufferMultiplier = await getConfigDecimal(`buffer_${classKey}_multiplier`)

    if (classBufferEnabled) {
      finalThreshold = blended * classBufferMultiplier
    }
  }

  // ─────────────────────────────────────────────────
  // FLOOR + RETURN
  // ─────────────────────────────────────────────────

  const threshold = Math.max(Math.ceil(finalThreshold), globalMin)

  // Save to forecast accuracy table if feedback enabled
  const feedbackEnabled = await getConfigBool('stock_feedback_enabled')
  if (feedbackEnabled) {
    const forecastMonth = new Date(currentYear, currentMonth - 1, 1)
    await db.stock_forecast_accuracy.upsert({
      where: { StyleNo_ForecastMonth: { StyleNo: styleNo, ForecastMonth: forecastMonth } },
      create: {
        StyleNo: styleNo,
        ForecastMonth: forecastMonth,
        PredictedThreshold: threshold,
        Method1Result: method1 ? Math.ceil(method1) : null,
        Method2Result: method2 ? Math.ceil(method2) : null,
        StockClass: stockClass
      },
      update: {
        PredictedThreshold: threshold,
        Method1Result: method1 ? Math.ceil(method1) : null,
        Method2Result: method2 ? Math.ceil(method2) : null,
        StockClass: stockClass
      }
    })
  }

  return { threshold, method1, method2, stockClass }
}
```

## 8.4 Update GET /api/stock/replenishment/route.ts

Replace existing velocity calculation with new logic:

```typescript
// At start of handler — classify all styles once
const classifications = await classifyAllStyles()

// For each StyleNo — calculate threshold using new function
for (const styleNo of styleNos) {
  const classification = classifications.get(styleNo)
  const minThreshold = await calculateThreshold(styleNo, classification)
  
  // Include class in response for display
  items.push({
    styleNo,
    stockClass: classification?.stockClass ?? 'C',
    currentStock,
    minThreshold,
    shortage: Math.max(0, minThreshold - currentStock),
    // ...rest of fields
  })
}
```

## 8.4 Update Stock Replenishment Screen

Show stock class badge per row in StockReplenishmentPage.tsx:

```
Style No | Class | Product | Current | Threshold | Shortage | Severity | Progress
3333     |  [A]  | Gold... |   12    |    86     |   74     | CRITICAL |  ████░░
DVE075   |  [S]  | Plat... |    0    |     1     |    1     | WARNING  |  ░░░░░░
KJN7265  |  [C]  | Silv... |    8    |     3     |    0     | ✓ OK     |  ██████
```

Class badge colors:
```
S: bg-[#EDE9FE] text-[#3B0764]  "S"  — special/expensive
A: bg-[#DCFCE7] text-[#166534]  "A"  — high revenue
B: bg-[#DBEAFE] text-[#1E40AF]  "B"  — medium revenue
C: bg-[#F1F5F9] text-[#475569]  "C"  — low revenue
```

## 8.5 Update Settings Screen — Stock Replenishment Tab (Tab 5)

```
Threshold Mode: [Manual ▼] [Velocity ▼] [Same for all ▼]

── When Mode = Velocity ──

  ┌─ S-CLASS ─────────────────────────────────────────────┐
  │ Min revenue per piece: [$500]                          │
  │ Fixed minimum stock:   [1]                             │
  │ "Styles with avg sale value above $500 always keep     │
  │  at least 1 piece. Trend calculation skipped."         │
  └────────────────────────────────────────────────────────┘

  ┌─ ABC DISTRIBUTION ─────────────────────────────────────┐
  │ A-class: [20]%    B-class: [30]%    C-class: [50]%     │
  │ C = 100 - A - B (auto). A+B cannot exceed 99%.         │
  └────────────────────────────────────────────────────────┘

  ┌─ BUFFERS ──────────────────────────────────────────────┐
  │ [Toggle] Use buffers globally                          │
  │                                                        │
  │ A-class: [Toggle] [1.2×]                              │
  │ B-class: [Toggle] [1.15×]                             │
  │ C-class: [Toggle] [1.05×]                             │
  └────────────────────────────────────────────────────────┘

  ┌─ METHOD 1 — Historical Same Month ─────────────────────┐
  │ Years back: [3]                                        │
  │ "Look at same month in past X years. Only years with   │
  │  sales data included."                                 │
  └────────────────────────────────────────────────────────┘

  ┌─ METHOD 2 — Seasonal Arc ──────────────────────────────┐
  │ [Toggle] Use seasonal arc                              │
  │                                                        │
  │ Window size:   [4] months                              │
  │ Direction:     [Backward ▼] [Forward ▼]                │
  │                                                        │
  │ [Toggle] Use weighted months                           │
  │ Weight mode:   [Auto ▼] [Manual ▼]                     │
  │                                                        │
  │ When Auto:                                             │
  │   Current month weight: [50]%                          │
  │   Other months: 16.7% each (auto split)               │
  │                                                        │
  │ When Manual:                                           │
  │   May (current): [50]%                                 │
  │   Apr (-1 month): [30]%                               │
  │   Mar (-2 months): [20]% ← auto calculated            │
  │   Must sum to 100%                                     │
  └────────────────────────────────────────────────────────┘

  ┌─ BLENDING ─────────────────────────────────────────────┐
  │ Method 1 weight: [50]%                                 │
  │ Method 2 weight: [50]% (auto = 100 - Method 1)        │
  │ Gap warning:     [30]%                                 │
  │ "If Method 1 and 2 differ by more than 30% —          │
  │  flag this style for manual review"                    │
  └────────────────────────────────────────────────────────┘

  ┌─ CV NOISE FILTER ──────────────────────────────────────┐
  │ Trust threshold:   [0.3]                               │
  │   "Below 0.3 = consistent data = trust growth fully"   │
  │ Dampen threshold:  [0.7]                               │
  │   "0.3-0.7 = use 50% of growth signal"                │
  │   "Above 0.7 = ignore growth, use average only"        │
  └────────────────────────────────────────────────────────┘

  ┌─ SAFETY ───────────────────────────────────────────────┐
  │ Global minimum: [1] piece (absolute floor, all styles) │
  └────────────────────────────────────────────────────────┘

  ┌─ FORMULA PREVIEW (live — updates as config changes) ───┐
  │ S-class:  Fixed minimum = 1 piece                      │
  │ A-class:  Blend(Method1 × 50%, Method2 × 50%) × 1.2   │
  │ B-class:  Blend(Method1 × 50%, Method2 × 50%) × 1.15  │
  │ C-class:  Blend(Method1 × 50%, Method2 × 50%) × 1.05  │
  │ Floor:    MAX(result, 1 piece)                         │
  └────────────────────────────────────────────────────────┘

  ┌─ FEEDBACK LOOP (Phase 2) ──────────────────────────────┐
  │ [Toggle] Track forecast accuracy      default: OFF     │
  │ [Toggle] Apply bias correction        default: OFF     │
  │ Bias window: [6] months                                │
  │                                                        │
  │ "Turn ON after 6+ months of data.                      │
  │  System will learn from its own prediction errors."    │
  └────────────────────────────────────────────────────────┘

  [Recalculate All Thresholds] button
  Last calculated: [timestamp]
```

Validation rules:
- A + B cannot exceed 99 → red error inline
- Buffer multipliers must be > 0
- Years back: min 1, max 10
- Window size: min 1, max 6
- Manual weights must sum to 100%
- CV trust threshold must be < CV dampen threshold
- Method 1 weight: 1-99 (Method 2 = 100 - Method 1)

---

# PART 9 — Style Rank Badge in Client Replenishment

## 9.1 Update results table in ReplenishmentV2Page.tsx

In the Group Value column — add rank badge next to StyleNo:

```tsx
// In the Group Value cell
<td>
  <div className="flex items-center gap-2">
    <span className="font-mono font-semibold text-[#1C1917]">
      {row.groupValue}
    </span>
    {row.styleRank && (
      <span className="inline-flex items-center px-1.5 py-0.5 
                       rounded text-[10px] font-semibold
                       bg-[#F1F5F9] text-[#475569]">
        #{row.styleRank}
      </span>
    )}
  </div>
</td>
```

## 9.2 Add styleRank to API response

Update `app/api/replenishment/v2/route.ts`:

For each result row — look up `customer_rankings` for:
- `ClientID` = searched client
- `StyleNo` = current group value (when groupField = 'StyleNo')

```typescript
// After building soldItems — fetch style ranks for this client
const styleNos = [...new Set(soldItems.map(s => s.StyleNo).filter(Boolean))]

const styleRanks = clientId ? await db.customer_rankings.findMany({
  where: {
    ClientID: clientId,
    StyleNo: { in: styleNos }
  },
  select: { StyleNo: true, StyleRank: true }
}) : []

const styleRankMap = new Map(
  styleRanks.map(r => [r.StyleNo, r.StyleRank])
)

// Add to each row in response:
{
  ...existingRowFields,
  styleRank: groupField === 'StyleNo' 
    ? (styleRankMap.get(groupValue) ?? null) 
    : null
}
```

## 9.3 Update TypeScript types

In `lib/replenishment-v2.ts` — add to row type:
```typescript
styleRank: number | null
```

---

# PART 10 — Environment Variables

## 10.1 Add to .env.local

```env
# ERP API Integration
ERP_API_BASE_URL=https://your-erp-url.com
ERP_LOGIN_TYPE=
ERP_USER_NAME=
ERP_PASSWORD=
ERP_USER_ID=HITESH
ERP_REMOTE_ADDRESS=
ERP_COMMAND_TYPE=GETDATA
```

## 10.2 Add to .env.example

```env
# ERP API Integration
ERP_API_BASE_URL=
ERP_LOGIN_TYPE=
ERP_USER_NAME=
ERP_PASSWORD=
ERP_USER_ID=
ERP_REMOTE_ADDRESS=
ERP_COMMAND_TYPE=
```

---

# Build Order

1. Part 1.1 — Add new stock columns to schema → migrate
2. Part 1.2 — Add new config keys → seed
3. Part 2 — Create lib/erp-api.ts
4. Part 3 — Create lib/erp-sync.ts
5. Part 4 — Create /api/erp/sync/stock + /api/erp/sync/status routes
6. Part 5 — Create lib/erp-auto-sync.ts + wire to replenishment v2 route
7. Part 6 — Add Sync ERP button to navbar
8. Part 7 — Add ERP Sync tab to Settings screen
9. Part 8.1 — Update seasonal velocity calculation in stock replenishment
10. Part 8.2 — Update Settings screen Stock Replenishment tab
11. Part 9 — Add style rank badge to replenishment results
12. Part 10 — Update .env.local + .env.example
13. Run npm run build — must pass
14. Test: manually trigger sync via button, verify stock data updates
15. Update docs/PROGRESS.md

---

# Notes for Cursor

- ERP_COMMAND_TYPE in .env — fill with actual value from API team
- Token auth header format may differ — adjust if API uses different auth method
- applyStockUploadMemoLifecyclePasses must be extracted to shared function
  (currently in upload route) so erp-sync.ts can reuse it
- Style rank badge only shows when groupField = 'StyleNo'
- Style rank only fetched when searching by client (not invoice no)
- Seasonal velocity: only years with data count — never divide by zero
- Auto sync is fire-and-forget — never blocks API response
- Excel upload kept as fallback — both paths write to same DB tables
- Do not remove Excel upload functionality
- Build must pass before testing sync