# CHANGES-3.md — Ranking Refactor + Production-Grade Testing Suite

Read CLAUDE.md first for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement Part 1 first, then Part 2. Do not mix them.

---

# PART 1 — Ranking Architecture Refactor

## 1.1 Update `clients` table — Add Overall Ranking Columns

Add to `clients` model in `prisma/schema.prisma`:

```prisma
OverallRank      Int?      // Global rank among all clients
OverallScore     Decimal?  @db.Decimal(14, 4)  // Combined score used for ranking
LastRankedAt     DateTime? @db.Timestamp(6)    // When overall rank was last calculated
```

## 1.2 Update `customer_rankings` table — Drop OverallRank

Remove `OverallRank Int?` column from `customer_rankings` model.
Keep `StyleRank Int?` — this is now the only rank column on this table.
Keep all other columns unchanged.

## 1.3 Migration SQL

```sql
-- Add columns to clients
ALTER TABLE clients ADD COLUMN "OverallRank" INTEGER;
ALTER TABLE clients ADD COLUMN "OverallScore" DECIMAL(14,4);
ALTER TABLE clients ADD COLUMN "LastRankedAt" TIMESTAMP(6);

-- Drop OverallRank from customer_rankings
ALTER TABLE customer_rankings DROP COLUMN IF EXISTS "OverallRank";

-- Add index on clients.OverallRank
CREATE INDEX idx_clients_overall_rank ON clients("OverallRank");
```

Run migration:
```bash
npx prisma migrate dev --name ranking_refactor_overall_to_clients
```

## 1.4 Update `lib/rankings.ts` — recalculateRankings()

Change the overall ranking upsert logic:

**Before:** upsert overall rows into `customer_rankings` where `StyleNo = NULL`

**After:**
1. Calculate overall scores per client from sales (same CTE logic)
2. RANK() clients by CombinedScore DESC
3. **Write overall rank directly to `clients` table:**
   ```sql
   UPDATE clients SET 
     "OverallRank" = ...,
     "OverallScore" = ...,
     "LastRankedAt" = NOW()
   WHERE "ClientID" = ...
   ```
4. StyleNo-specific rankings still upsert into `customer_rankings` as before
5. Delete `StyleNo = NULL` rows from `customer_rankings` after migration (they're now redundant)

## 1.5 Update `app/api/replenishment/v2/route.ts`

Change pullback query to read `OverallRank` from `clients` table instead of `customer_rankings`:

```sql
-- Before: join customer_rankings for OverallRank
-- After: OverallRank comes directly from clients join (already joined for IsStockPullAllowed)

SELECT 
  c."OverallRank",           -- from clients directly
  cr."StyleRank"             -- from customer_rankings where StyleNo matches
FROM clients c
LEFT JOIN customer_rankings cr 
  ON cr."ClientID" = c."ClientID" 
  AND cr."StyleNo" = [current group StyleNo]
```

Update `lib/replenishment-v2.ts` types — `overallRank` now comes from clients, `styleRank` from customer_rankings.

## 1.6 After Migration — Trigger Recalculation

After migration runs successfully:
```bash
# Trigger fresh recalculation from real sales data
curl -X POST /api/rankings/recalculate
# Or run directly: npx ts-node -e "require('./lib/rankings').recalculateRankings()"
```

This writes fresh OverallRank to clients and StyleRank to customer_rankings from actual sales data.

## 1.7 Build Order for Part 1

1. Update prisma schema (clients + customer_rankings models)
2. Run migration
3. Update `lib/rankings.ts`
4. Update `app/api/replenishment/v2/route.ts` + `lib/replenishment-v2.ts` types
5. Trigger recalculation
6. Verify: check clients table has OverallRank populated, customer_rankings has no NULL StyleNo rows
7. Update docs/SCHEMA.md + docs/PROGRESS.md

---

# PART 2 — Production-Grade Testing Suite

## Overview

Build a comprehensive test suite covering every layer of the application.
Goal: production-ready, not college-project level.
Use these testing libraries:

```bash
npm install -D jest @jest/globals ts-jest supertest @types/supertest
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install -D playwright @playwright/test
npm install -D artillery                    # load testing
npm install -D axe-playwright              # accessibility
npm install -D zod                         # already installed
```

Configure `jest.config.ts`:
```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterFramework: ['<rootDir>/tests/setup.ts'],
  coverageThreshold: { global: { lines: 80 } }
}
```

---

## 2.1 Unit Tests — Business Logic

### `tests/unit/rankings.test.ts`
```
- recalculateRankings() with mocked Prisma
- Correct CombinedScore formula: (SaleValue × weight) + (volume × weight)
- Weights sum to 1.0
- ranking_period filter: all_time / yearly / monthly date ranges correct
- Clients with no sales get rank = null, not rank = 0
- Profit = SaleValue - CRAmount calculated correctly
- Idempotent: running twice gives same result
- Config switch: SaleValue vs Profit as value metric
```

### `tests/unit/rbac.test.ts`
```
- hasPermission returns true for correct permission
- hasPermission returns false for missing permission
- requirePermission throws ForbiddenError when denied
- ForbiddenError carries 403 status response
- Cache: second call within 60s does not hit DB
- Cache invalidation: invalidateUserPermissionCache clears correctly
- User with no role returns empty permissions
- Super admin has all permissions
```

### `tests/unit/config.test.ts`
```
- getConfig returns correct value
- getConfigBool: 'true' → true, 'false' → false
- getConfigInt: '10' → 10, invalid → throws
- getConfigDecimal: '0.6' → 0.6
- Missing key throws error
- Cache: second read within 60s skips DB
- invalidateConfigCache forces fresh read
```

### `tests/unit/replenishment-calc.test.ts`
```
- IN_WAREHOUSE count correct for items with no memo and no hold
- PULLBACK count excludes IsStockPullAllowed = false clients
- PULLBACK count excludes memos not within CloseToExpiryDays
- FACTORY_ORDER = max(0, required - warehouse - pullback)
- FACTORY_ORDER never goes negative
- pickRandom returns correct count
- pickRandom count capped at pool size
- Override qty change re-picks correctly
- Already-replenished invoices excluded correctly
- Partial visibility config respected
```

### `tests/unit/excel-import.test.ts`
```
- Stock row with empty Company → in warehouse
- Stock row with Company → on memo
- Stock row with HoldDate → on hold
- Dedup: duplicate StockNo skipped
- Dedup: duplicate InvoiceNo+StockNo skipped
- SaleValue + CRAmount parsed from decimal cells correctly
- Rich-text cells parsed correctly (xlsxCellToScalar)
- Missing required fields → error row, not crash
- Wrong mapping → error reported, not silent fail
```

---

## 2.2 API Integration Tests

### `tests/api/auth.test.ts`
```
POST /api/auth/login
- Valid credentials → 200 + JWT cookie set
- Wrong password → 401
- Non-existent email → 401
- Wrong domain email → 403
- is_first_login = true → redirects to change-password
- OTP flow: request → verify → reset in sequence
- OTP expired → 400
- OTP already used → 400
- Rate limiting: 5 failed logins → 429 (if implemented)

POST /api/auth/forgot-password
- Valid email → 200, OTP sent
- Unknown email → 200 (don't leak user existence)

POST /api/auth/verify-otp
- Valid OTP → 200
- Invalid OTP → 400
- Expired OTP → 400

POST /api/auth/reset-password
- New password same as old → 400
- Password too short → 400
- Without valid OTP session → 401
```

### `tests/api/rbac.test.ts`
```
For every protected route:
- No cookie → 401
- Valid cookie, wrong permission → 403
- Valid cookie, correct permission → 200

Spot-check these specifically:
- GET /api/users → needs users.view
- POST /api/users → needs users.invite  
- GET /api/settings → needs settings.view
- PATCH /api/settings → needs settings.edit
- POST /api/replenishment/confirm → needs replenishment.confirm
- POST /api/replenishment/undo → needs replenishment.undo
- DELETE /api/roles → needs roles.delete
- POST /api/rankings/recalculate → needs rankings.recalculate
```

### `tests/api/replenishment.test.ts`
```
GET /api/replenishment/v2
- Returns correct groups for client + date range
- Excludes confirmed replenishments (IsUndone = false)
- partial_replenishment_visibility = true → only exclude confirmed groups
- partial_replenishment_visibility = false → exclude entire invoice
- Pullback sorted by OverallRank ASC NULLS LAST
- Empty date range → empty results, not error
- Invalid clientId → 400

POST /api/replenishment/confirm
- Saves one row per invoiceNo × stockNo
- Returns replenishmentIds
- Duplicate confirm → handled gracefully
- Empty stockNos → 400

POST /api/replenishment/undo
- Sets IsUndone = true, UndoneBy, UndoneAt
- Already undone → no change, still 200
- Invalid replenishmentId → 400

GET /api/replenishment/history
- Pagination works: page + limit respected
- clientId filter works
- fromDate/toDate filter works
- canUndo = false on undone rows
- canUndo based on user permission
```

### `tests/api/upload.test.ts`
```
POST /api/upload (stock)
- Valid Excel + correct mapping → inserts new rows
- Duplicate StockNo → skipped, count reported
- Wrong report type selected → mapping mismatch error
- Missing required columns → error with column names listed
- Empty file → 400
- Non-Excel file → 400
- After sales upload → recalculateRankings triggered

POST /api/upload (sales)
- SaleValue + CRAmount parsed correctly
- Duplicate InvoiceNo+StockNo → skipped
- New clients auto-created in clients table
```

### `tests/api/roles.test.ts`
```
GET /api/roles → returns roles with user count and permissions
POST /api/roles → creates role
PATCH /api/roles (update) → updates name/description
PATCH /api/roles (assign_permissions) → replaces permission set, invalidates RBAC cache
DELETE /api/roles → deletes non-system role
DELETE /api/roles (system role) → 403
DELETE /api/roles (role with users) → 400 or reassign check
```

### `tests/api/settings.test.ts`
```
GET /api/settings → returns all config grouped by module
PATCH /api/settings → updates value, invalidates cache
PATCH /api/settings (ranking key) → triggers recalculateRankings
PATCH /api/settings (invalid key) → 400
PATCH /api/settings (wrong type) → 400 (e.g. string for integer field)
```

---

## 2.3 Security Tests

### `tests/security/auth-security.test.ts`
```
JWT SECURITY:
- Tampered JWT signature → 401
- Expired JWT → 401
- JWT from different secret → 401
- JWT missing permissions array → treated as empty
- JWT replayed after logout → 401 (if token blacklist implemented)

INJECTION:
- SQL injection in search params → sanitized, no DB error
- XSS in all text inputs (PartyName, Remarks etc.) → escaped in response
- Path traversal in file upload → rejected
- Oversized file upload → 413

CSRF:
- State-changing requests without proper origin → blocked

SENSITIVE DATA:
- PasswordHash never appears in any API response
- OtpHash never appears in any API response
- JWT payload does not contain PasswordHash
- Error messages don't leak stack traces in production mode

AUTHORIZATION:
- Member cannot access /api/settings
- Member cannot access /api/roles  
- Member cannot POST /api/replenishment/undo
- Viewer cannot POST /api/replenishment/confirm
- User cannot modify another user's password
- User cannot see other users' OTPs

BRUTE FORCE:
- OTP: 10 wrong attempts → account locked or OTP invalidated
- Login: repeated failures handled gracefully

DOMAIN VALIDATION:
- Invite with wrong domain → rejected
- Login with wrong domain → rejected
```

### `tests/security/data-security.test.ts`
```
- All passwords stored as bcrypt hash (never plaintext)
- OTPs stored as hash (never plaintext)
- No secrets in API responses
- Database errors don't expose schema info in responses
- File uploads stored server-side only, never returned to client
```

---

## 2.4 UI / UX Tests (Playwright E2E)

### Setup `playwright.config.ts`
```typescript
export default {
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium' },
    { name: 'firefox' },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ]
}
```

### `tests/e2e/auth.spec.ts`
```
- Login page renders correctly
- Error shown on wrong credentials
- OTP flow completes end to end
- Force password change on first login
- Logout clears session and redirects
- Protected routes redirect to login when unauthenticated
```

### `tests/e2e/replenishment.spec.ts`
```
- Search with client + date range returns results
- Group by selector changes grouping instantly
- Override qty updates factory order in real time
- Stock pills render green by default
- Click pill → turns grey (deselected)
- Click grey pill → turns green (reselected)
- Factory order recalculates on pill toggle
- Confirm button disabled when no pills selected
- Confirm button enabled when pills selected
- After confirm → Export PDF button activates
- PDF downloads successfully
- New search resets confirm state
- Already replenished items don't appear in results
```

### `tests/e2e/roles.spec.ts`
```
- Roles list renders with correct badges
- Create new role → appears in list
- Assign permissions → saved correctly
- System role checkboxes are disabled
- Delete non-system role → removed from list
- Delete system role button not shown
```

### `tests/e2e/settings.spec.ts`
```
- All 4 tabs render
- Toggle saves immediately
- Number input debounces 1s then saves
- "Saved ✓" badge appears after save
- Recalculate rankings button triggers recalculation
- Last calculated timestamp updates
- Member role cannot see Settings in nav
```

### `tests/e2e/navigation.spec.ts`
```
- Member sees: Replenishment, History, Clients
- Admin sees: + Users, Excel Config, Roles, Settings
- Viewer sees: Replenishment, History, Clients (read only)
- Direct URL access to forbidden route → redirect or 403 page
- Sidebar active state correct on each route
```

### `tests/e2e/accessibility.spec.ts` (using axe-playwright)
```
- Login page: no accessibility violations
- Replenishment page: no accessibility violations
- Roles page: no accessibility violations
- Settings page: no accessibility violations
- All interactive elements keyboard navigable
- Color contrast ratios pass WCAG AA
- Screen reader labels on all inputs
- Error messages associated with inputs
```

---

## 2.5 Performance / Load Tests

### `tests/load/artillery.yml`
```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - name: Warm up
      duration: 30
      arrivalRate: 5
    - name: Ramp up
      duration: 60
      arrivalRate: 5
      rampTo: 50
    - name: Sustained load
      duration: 120
      arrivalRate: 50
    - name: Peak (60-70 cases/day simulation)
      duration: 60
      arrivalRate: 100

scenarios:
  - name: Replenishment search
    flow:
      - post:
          url: /api/auth/login
          json: { email: "{{email}}", password: "{{password}}" }
          capture:
            - header: set-cookie
              as: cookie
      - get:
          url: /api/replenishment/v2?clientId={{clientId}}&fromDate={{fromDate}}&toDate={{toDate}}&groupBy=StyleNo
          headers:
            Cookie: "{{cookie}}"

  - name: Upload + rankings recalculate
    flow:
      - post:
          url: /api/upload
          # sales Excel file
```

### Performance Benchmarks to Assert:
```
- GET /api/replenishment/v2 → p95 < 500ms under 50 concurrent users
- POST /api/replenishment/confirm → p95 < 300ms
- GET /api/replenishment/history → p95 < 400ms
- POST /api/upload (18K rows) → completes < 30s
- recalculateRankings() → completes < 10s for 18K sales rows
- Login → p95 < 200ms
- JWT verify → p95 < 50ms
```

### `tests/performance/db-query.test.ts`
```
- Replenishment V2 query with 18K sales rows < 500ms
- Rankings recalculation with 18K rows < 10s
- History pagination (page 1 of 1000 records) < 200ms
- Upload dedup check (18K existing rows) < 5s
```

---

## 2.6 UI Component Tests

### `tests/components/StockPillGroup.test.tsx`
```
- Renders correct number of pills
- All pills green by default
- Click pill → calls onToggle with correct stockNo
- Deselected pill has grey styling
- Re-click grey pill → green again
- Empty pool → no pills rendered
```

### `tests/components/ReplenishmentV2Page.test.tsx`
```
- Search button disabled when no client selected
- Results table renders after search
- Override qty input updates correctly
- Factory order = max(0, override - warehouse - pullback)
- Confirm button disabled with no selections
- Confirm button enabled with selections
- Export disabled before confirm
- Export enabled after confirm
```

### `tests/components/RolesManagement.test.tsx`
```
- Role list renders correctly
- System roles show lock badge
- Selecting role shows its permissions
- Dirty flag triggers Save button
- Create role form toggles on + click
```

---

## 2.7 Regression Tests

### `tests/regression/upload-dedup.test.ts`
```
- Upload same stock file twice → no duplicates in DB
- Upload same sales file twice → no duplicates
- Partial re-upload (some new, some existing) → only new inserted
- Count reported correctly: inserted vs skipped
```

### `tests/regression/ranking-consistency.test.ts`
```
- After upload + recalculate → all clients have OverallRank in clients table
- No customer_rankings rows with NULL StyleNo (post-migration)
- StyleRank within same StyleNo has no gaps (1, 2, 3... not 1, 3, 5)
- Client with highest SaleValue has OverallRank = 1
- Changing ranking_value_metric + recalculate → ranks change accordingly
```

### `tests/regression/replenishment-state.test.ts`
```
- Confirm replenishment → invoice disappears from V2 results
- Undo replenishment → invoice reappears in V2 results
- Partial visibility = true → only confirmed groups hidden
- Partial visibility = false → whole invoice hidden after any confirm
```

---

## 2.8 Test Data & Fixtures

### `tests/fixtures/seed-test-db.ts`
```typescript
// Create isolated test DB state before each test suite
// Includes:
// - 3 test users (super_admin, member, viewer)
// - 5 test clients with various CloseToExpiryDays + IsStockPullAllowed settings
// - 50 stock items (mix of in warehouse, on memo, on hold, sold)
// - 20 memo records (mix of active, expired, near expiry)
// - 30 sales records with SaleValue + CRAmount
// - Pre-calculated rankings
// - 1 confirmed replenishment for exclusion testing
```

---

## 2.9 CI Pipeline (GitHub Actions)

### `.github/workflows/test.yml`
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
        options: --health-cmd pg_isready
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npx prisma db seed
      - run: npm test -- --coverage
      - run: npm run test:security

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e

  load:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: npm run test:load
```

---

## 2.10 Test Scripts in `package.json`

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:security": "jest tests/security",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:load": "artillery run tests/load/artillery.yml",
    "test:a11y": "playwright test tests/e2e/accessibility.spec.ts",
    "test:all": "npm run test:coverage && npm run test:e2e && npm run test:security"
  }
}
```

---

## 2.11 Build Order for Part 2

1. Install all test dependencies
2. Configure `jest.config.ts` + `playwright.config.ts`
3. Create `tests/fixtures/seed-test-db.ts`
4. Write unit tests (2.1) — run and fix until passing
5. Write API integration tests (2.2) — run and fix until passing
6. Write security tests (2.3) — run and fix, fix any failures immediately
7. Write Playwright E2E tests (2.4) — run against local dev server
8. Write accessibility tests (axe) — fix any violations found
9. Write load tests (2.5) — run against local, fix slow queries
10. Write component tests (2.6)
11. Write regression tests (2.7)
12. Set up CI pipeline (2.9)
13. Run `npm run test:all` — must pass completely
14. Update docs/PROGRESS.md

---

## What "Production Ready" Means For This App

After all tests pass:

| Category | Target |
|---|---|
| Unit test coverage | > 80% |
| API test coverage | 100% of routes tested |
| Security vulnerabilities | Zero critical/high |
| Accessibility | WCAG AA compliant |
| p95 response time | < 500ms under 50 users |
| Zero data leaks | No passwords/OTPs in responses |
| Regression suite | All critical flows covered |
| CI | All tests pass on every push |