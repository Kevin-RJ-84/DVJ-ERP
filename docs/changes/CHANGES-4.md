# CHANGES-4.md — Ranking Config + User Management Modal + Role Fix

Read CLAUDE.md first for full project context.
Read docs/SCHEMA.md for current table definitions.
Implement in order: Part 0 first (immediate fix), then Part 1, then Part 2.

---

# PART 0 — Immediate Fix (Do This First)

## Update role for specific user

Run this SQL directly on the database:

```sql
-- Step 1: Get the super_admin RoleID
SELECT "RoleID" FROM roles WHERE "RoleName" = 'super_admin';

-- Step 2: Update the user's role (replace <super_admin_role_id> with result from Step 1)
UPDATE users 
SET 
  "RoleID" = '<super_admin_role_id>',
  "Role" = 'super_admin'
WHERE "Email" = 'karan.davda@renaissancejewel.com';

-- Step 3: Verify
SELECT "UserID", "Email", "Role", "RoleID" 
FROM users 
WHERE "Email" = 'karan.davda@renaissancejewel.com';
```

After running — invalidate RBAC cache by restarting the dev server.
User must log out and log back in for new permissions to take effect in JWT.

---

# PART 1 — Ranking Config: Combined Score Toggle

## 1.1 New System Config Key

Add to `prisma/seed.ts` (upsert so re-running is safe):

```typescript
{
  ConfigKey: 'use_combined_score',
  ConfigValue: 'false',
  ConfigType: 'boolean',
  Description: 'When ON, ranks by weighted combination of value + volume. When OFF, ranks purely by selected value metric (SaleValue or Profit).',
  Module: 'ranking'
}
```

Run seed after adding:
```bash
npx prisma db seed
```

## 1.2 Update `lib/rankings.ts` — recalculateRankings()

Read the new config key and change scoring logic:

```typescript
const useCombinedScore = await getConfigBool('use_combined_score')
const valueMetric = await getConfig('ranking_value_metric') // 'SaleValue' | 'Profit'

let combinedScore: string

if (useCombinedScore) {
  // Weighted combination
  const valueWeight = await getConfigDecimal('ranking_value_weight')
  const volumeWeight = await getConfigDecimal('ranking_volume_weight')
  
  if (valueMetric === 'Profit') {
    combinedScore = `"TotalProfit" * ${valueWeight} + "TotalPiecesSold" * ${volumeWeight}`
  } else {
    combinedScore = `"TotalValueSold" * ${valueWeight} + "TotalPiecesSold" * ${volumeWeight}`
  }
} else {
  // Pure value metric — no weights, no volume mixing
  if (valueMetric === 'Profit') {
    combinedScore = `"TotalProfit"`
  } else {
    combinedScore = `"TotalValueSold"`
  }
}
```

Use `combinedScore` expression in the RANK() CTE for both overall and StyleNo rankings.

## 1.3 Update Settings Screen — Ranking Tab

File: `components/settings/SystemSettingsPage.tsx`

**Changes to Ranking tab:**

1. Add `use_combined_score` toggle at the top of the Ranking tab:
   ```
   [Toggle] Use Combined Score (Value + Volume weighting)
   ```

2. Value weight input — disabled when `use_combined_score = false`
3. Volume weight input — disabled when `use_combined_score = false`
4. Add visual indicator when disabled:
   - Grey out the weight fields
   - Show helper text: "Enable combined score to configure weights"

**UI logic:**
```typescript
const useCombined = configValues['use_combined_score'] === 'true'

// Weight inputs
<input
  type="number"
  value={configValues['ranking_value_weight']}
  disabled={!useCombined}
  className={!useCombined ? 'opacity-50 cursor-not-allowed' : ''}
  onChange={...}
/>
<p className="text-xs text-gray-400">
  {!useCombined && "Enable combined score to configure weights"}
</p>
```

5. When `use_combined_score` is toggled ON → trigger `recalculateRankings()` automatically
6. When toggled OFF → also trigger `recalculateRankings()` automatically
   (so ranks update immediately to reflect new pure scoring)

**Updated Ranking tab layout:**
```
[Toggle] Use Combined Score
  └─ ON:  "Ranks clients by weighted combination of value and volume"
  └─ OFF: "Ranks clients purely by selected value metric"

Value Metric: [SaleValue ▼] [Profit ▼]

── Weight Configuration (disabled when combined score is OFF) ──
Value Weight:  [0.6____] (greyed if OFF)
Volume Weight: [0.4____] (greyed if OFF, auto-derived)
Helper: "Enable combined score to configure weights" (shown if OFF)

Ranking Period: [All Time ▼]

[Recalculate Rankings Now]  Last calculated: Jan 1 2026 10:30 AM
```

---

# PART 2 — User Management Modal

## 2.1 Update User Management Screen

File: `components/users/UserManagement.tsx`

**Current state:** Table with user list, invite button, no way to edit existing users.

**Changes:**
- Add clickable row or "View" button per user → opens User Profile Modal
- Keep existing invite flow unchanged

## 2.2 New Component: `components/users/UserProfileModal.tsx`

A modal that shows full user profile + role/status management.

### Modal Design

Same design language as the Profile page (`/settings/profile`) but in a modal.

**Header:**
```
[Avatar/Initials]  John Doe
                   john.doe@renaissancejewel.com
                   Member since: Jan 1 2026
                   Last login: Today 10:30 AM (if available)
```

**Body — Two Sections:**

**Section 1 — User Information (read-only)**
```
First Name:   John
Last Name:    Doe  
Username:     john.doe
Email:        john.doe@renaissancejewel.com
Created At:   January 1, 2026
```

**Section 2 — Access Control**
```
Role:         [Member              ▼]   ← dropdown of all roles from /api/roles
Status:       [Active              ▼]   ← dropdown: Active / Deactivated

[Save Changes]  [Cancel]
```

**Status dropdown options:**
- `Active` → `IsActive = true`
- `Deactivated` → `IsActive = false`

**Guards:**
- Cannot change your own role (logged-in user viewing their own profile)
- Cannot deactivate your own account
- Cannot change role of IsSystem users (super_admin)
- Show tooltip explaining why if action is blocked

**Requires permissions:**
- Viewing modal → `users.view`
- Changing role → `users.edit_role`
- Changing status → `users.deactivate`
- If user lacks permission → show field as read-only, no Save button for that field

### Modal Footer
```
[Cancel]                    [Save Changes]
```

Save Changes → PATCH `/api/users` with `{ userId, roleId?, isActive? }`

On success:
- Show success toast "User updated successfully"
- Close modal
- Refresh user list

## 2.3 Update `app/api/users/route.ts` — PATCH

Current PATCH handles role and isActive separately. Verify it handles both in one request:

```typescript
// Body can contain either or both:
{
  userId: string,
  roleId?: string,      // requires users.edit_role
  isActive?: boolean    // requires users.deactivate
}
```

If `isActive = false` → user cannot log in (login route already checks `IsActive`).
If `isActive = true` → account reactivated, user can log in again.

Invalidate RBAC cache for that userId after role change:
```typescript
invalidateUserPermissionCache(userId)
```

## 2.4 Update User Table in UserManagement.tsx

Add to each row:
- Clickable row → opens UserProfileModal
- Status badge: green "Active" / red "Deactivated"
- Role badge showing current role name

**Updated table columns:**
```
Name | Email | Role | Status | Joined | Actions
```

Actions column:
- "View" button → opens UserProfileModal

## 2.5 Verify Login Blocks Deactivated Users

File: `app/api/auth/login/route.ts`

Verify this check exists (add if missing):
```typescript
if (!user.IsActive) {
  return NextResponse.json(
    { error: 'Your account has been deactivated. Please contact your administrator.' },
    { status: 403 }
  )
}
```

---

# PART 3 — Tests to Add

### `tests/unit/rankings.test.ts` — Add new cases
```
- use_combined_score = false + SaleValue → score = TotalValueSold (no weights)
- use_combined_score = false + Profit → score = TotalProfit (no weights)
- use_combined_score = true + SaleValue → score = TotalValueSold × weight + pieces × weight
- Toggling use_combined_score triggers recalculation
```

### `tests/api/users.test.ts` — Add new cases
```
- PATCH /api/users with roleId → updates role, invalidates RBAC cache
- PATCH /api/users with isActive=false → user cannot login (403)
- PATCH /api/users with isActive=true → user can login again
- Cannot deactivate own account
- Cannot change own role
- Cannot change super_admin role (IsSystem guard)
```

### `tests/e2e/users.spec.ts` — New E2E spec
```
- Click user row → modal opens
- Modal shows correct user info
- Role dropdown shows all roles
- Change role → save → table updates
- Deactivate user → status badge turns red
- Deactivated user cannot login (verify in separate browser context)
- Cannot deactivate own account (button disabled with tooltip)
```

---

# PART 4 — Build Order

1. **Part 0** — Run SQL to update karan.davda@renaissancejewel.com to super_admin
2. Verify login works with new role + correct permissions in JWT
3. **Part 1.1** — Add `use_combined_score` to seed + run seed
4. **Part 1.2** — Update `lib/rankings.ts` scoring logic
5. **Part 1.3** — Update Settings screen Ranking tab UI
6. Test: toggle combined score OFF → verify pure SaleValue ranking
7. Test: toggle combined score ON → verify weighted ranking
8. **Part 2.1-2.2** — Build UserProfileModal component
9. **Part 2.3** — Update PATCH /api/users
10. **Part 2.4** — Update user table with badges + click handler
11. **Part 2.5** — Verify deactivated user login block
12. **Part 3** — Add new tests
13. Run full test suite — `npm run test:all`
14. Update docs/PROGRESS.md

---

# Notes for Claude Code

- Part 0 is a direct DB operation — do not write code for it, just run the SQL
- UserProfileModal should reuse existing design tokens and component patterns from the profile page
- Weight inputs must be visually disabled (not just read-only) when use_combined_score is OFF
- Always invalidate RBAC cache after any role change via invalidateUserPermissionCache(userId)
- Deactivation check in login route is critical security — verify it exists before anything else