# AUDIT.md — Deep Clean Plan

Last updated: May 2026
Status: PENDING APPROVAL — reviewed, fixes applied, ready to execute when you say "Approved — run AUDIT.md"

---

## 1. ROUTE CHANGES (URL restructuring)

### Pages to MOVE/RENAME

| Current Route | New Route | Action |
|---|---|---|
| `/client-replenishment` | `/replenishment/client` | Move + rename |
| `/stock-replenishment` | `/replenishment/stock` | Move + rename |
| `/users` | `/admin/users` | Move |
| `/roles` | `/admin/roles` | Move |
| `/` (root) | Redirect → `/dashboard` | Update redirect |

### Pages to DELETE

| Route | Reason |
|---|---|
| `/replenishment` | Legacy — replaced by `/replenishment/client` |
| `/replenishment-v1` | Legacy V1 — never used |
| `/replenishment-history` | Merged as tab inside client replenishment |

### API Routes to MOVE

| Current | New | Reason |
|---|---|---|
| `/api/stock-replenishment` | `/api/stock/replenishment` | Domain grouping |
| `/api/stock-replenishment/thresholds` | `/api/stock/replenishment/thresholds` | Domain grouping |
| `/api/stock-review` | `/api/stock/review` | Domain grouping |
| `/api/stock-review/count` | `/api/stock/review/count` | Domain grouping |
| `/api/stock-review/resolve` | `/api/stock/review/resolve` | Domain grouping |

---

## 2. FILE/FOLDER STRUCTURE — TARGET STATE

```
dvj-erp/
├── .claudeignore
├── .cursorignore
├── .gitignore
├── .env.example              ← safe template, no real values
├── CLAUDE.md                 ← stays in root
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── change-password/page.tsx
│   │   └── forgot-password/
│   │       ├── page.tsx
│   │       ├── otp/page.tsx
│   │       └── reset/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              ← redirect to /dashboard
│   │   ├── dashboard/page.tsx
│   │   ├── replenishment/
│   │   │   ├── client/page.tsx
│   │   │   └── stock/page.tsx
│   │   ├── stock-review/page.tsx
│   │   ├── clients/page.tsx
│   │   ├── excel-config/page.tsx
│   │   ├── settings/
│   │   │   ├── page.tsx
│   │   │   └── profile/page.tsx
│   │   └── admin/
│   │       ├── users/page.tsx
│   │       └── roles/page.tsx
│   └── api/
│       ├── auth/
│       │   ├── login/route.ts
│       │   ├── logout/route.ts
│       │   ├── forgot-password/route.ts
│       │   ├── reset-password/route.ts
│       │   ├── verify-otp/route.ts
│       │   └── change-password/route.ts
│       ├── clients/route.ts
│       ├── dashboard/
│       │   ├── metrics/route.ts
│       │   ├── monthly-sales/route.ts
│       │   ├── top-clients/route.ts
│       │   ├── top-styles/route.ts
│       │   └── expiring-memos/route.ts
│       ├── excel-config/route.ts
│       ├── permissions/route.ts
│       ├── rankings/recalculate/route.ts
│       ├── replenishment/
│       │   ├── v2/route.ts
│       │   ├── calculate/route.ts
│       │   ├── confirm/route.ts
│       │   ├── undo/route.ts
│       │   ├── history/
│       │   │   ├── route.ts
│       │   │   └── replenishers/route.ts
│       │   └── options/route.ts
│       ├── roles/route.ts
│       ├── settings/route.ts
│       ├── stock/
│       │   ├── replenishment/
│       │   │   ├── route.ts
│       │   │   └── thresholds/route.ts
│       │   └── review/
│       │       ├── route.ts
│       │       ├── count/route.ts
│       │       └── resolve/route.ts
│       ├── upload/route.ts
│       └── users/route.ts
├── components/
│   ├── auth/
│   ├── clients/
│   ├── dashboard/
│   ├── excel-config/
│   ├── layout/
│   ├── replenishment/
│   ├── roles/
│   ├── settings/
│   ├── stock/
│   ├── users/
│   └── ui/
├── lib/
│   ├── auth.ts
│   ├── auth-server.ts
│   ├── auth-session.ts
│   ├── config.ts
│   ├── db.ts
│   ├── email.ts
│   ├── excel.ts
│   ├── excel-config.ts
│   ├── nav-permissions.ts
│   ├── password.ts
│   ├── rankings.ts
│   ├── rbac.ts
│   ├── replenishment.ts
│   ├── replenishment-v2.ts
│   └── users.ts
├── docs/
│   ├── SCHEMA.md
│   ├── PROGRESS.md
│   ├── PERMISSIONS.md
│   ├── AUDIT.md
│   ├── SPEC.md               ← moved from root
│   └── changes/
│       ├── CHANGES-2.md
│       ├── CHANGES-3.md
│       ├── CHANGES-4.md
│       ├── CHANGES-5.md
│       └── CHANGES-6.md
└── tests/
    ├── unit/
    ├── api/
    ├── security/
    ├── e2e/
    ├── load/
    └── fixtures/
```

---

## 3. FILES TO DELETE

### Legacy pages
```
app/(dashboard)/replenishment/page.tsx          ← legacy route
app/(dashboard)/replenishment-v1/page.tsx       ← V1 never used
app/(dashboard)/replenishment-history/page.tsx  ← merged as tab
app/(dashboard)/client-replenishment/           ← moving to replenishment/client
app/(dashboard)/stock-replenishment/            ← moving to replenishment/stock
```

### Legacy API routes (after moving to new paths)
```
app/api/stock-replenishment/                    ← moving to api/stock/replenishment
app/api/stock-review/                           ← moving to api/stock/review
```

### Root level docs (moving to docs/)
```
SPEC.md          → docs/SPEC.md
CHANGES-2.md     → docs/changes/CHANGES-2.md
CHANGES-3.md     → docs/changes/CHANGES-3.md
CHANGES-4.md     → docs/changes/CHANGES-4.md
CHANGES-5.md     → docs/changes/CHANGES-5.md
CHANGES-6.md     → docs/changes/CHANGES-6.md
```

---

## 4. FILES TO CREATE

### .claudeignore
```
# Secrets
.env
.env.local
.env.production
.env.development
.env.*
!.env.example

# Build output
.next/
out/

# Dependencies
node_modules/

# Sensitive docs (business logic history)
docs/changes/
docs/AUDIT.md
docs/PERMISSIONS.md

# Test fixtures (may contain real data)
tests/fixtures/

# OS
.DS_Store
Thumbs.db
*.log
```

### .cursorignore
```
# Secrets
.env
.env.local
.env.production
.env.development
.env.*
!.env.example

# Build output
.next/
out/

# Dependencies
node_modules/

# Sensitive docs
docs/changes/
docs/AUDIT.md
docs/PERMISSIONS.md

# Test fixtures
tests/fixtures/

# OS
.DS_Store
Thumbs.db
*.log
```

### .env.example
```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dvj_erp

# Auth
JWT_SECRET=your-secret-here

# Email — use one of these paths:
# Option 1: Resend
RESEND_API_KEY=
RESEND_FROM=

# Option 2: SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# App
ALLOWED_EMAIL_DOMAIN=yourcompany.com
SEED_ADMIN_EMAIL=admin@yourcompany.com
SEED_ADMIN_PASSWORD=
SEED_ADMIN_USERNAME=
```

---

## 5. SIDEBAR + NAVIGATION UPDATES

All of these must be updated after route changes:

### components/layout/DashboardSidebar.tsx
```
/client-replenishment  → /replenishment/client
/stock-replenishment   → /replenishment/stock
/users                 → /admin/users
/roles                 → /admin/roles
```

### app/(dashboard)/page.tsx
```
Change root redirect from current page to:
redirect('/dashboard')
```

### middleware.ts
```
Update any route matching for:
/client-replenishment → /replenishment/client
/stock-replenishment  → /replenishment/stock
/users                → /admin/users
/roles                → /admin/roles
```

### CLAUDE.md (update after cleanup)
```
Update folder structure section
Update key routes table
```

---

## 6. COMPONENTS — NO CHANGES NEEDED

All components stay in their current locations.
Only page.tsx files and API routes move.
Component imports don't change.

---

## 7. BUILD ORDER FOR CLEANUP

Execute in this exact order to avoid breaking the app:

**PRE-FLIGHT — Before touching anything:**
1. Grep entire codebase for all hardcoded old paths:
   Search for: `/client-replenishment`, `/stock-replenishment`,
   `/replenishment-history`, `/users`, `/roles`,
   `/api/stock-replenishment`, `/api/stock-review`
   List every file that contains these strings — do not change yet

2. Create .claudeignore + .cursorignore + .env.example

3. Move docs to correct locations:
   SPEC.md (or Spec.md — match exact casing) → docs/SPEC.md
   CHANGES-2.md → docs/changes/CHANGES-2.md
   CHANGES-3.md → docs/changes/CHANGES-3.md
   CHANGES-4.md → docs/changes/CHANGES-4.md
   CHANGES-5.md → docs/changes/CHANGES-5.md
   CHANGES-6.md → docs/changes/CHANGES-6.md

**ROUTE MIGRATION:**
4. Create new page folders + copy files:
   app/(dashboard)/replenishment/client/page.tsx
     ← copy from client-replenishment/page.tsx
   app/(dashboard)/replenishment/stock/page.tsx
     ← copy from stock-replenishment/page.tsx
   app/(dashboard)/admin/users/page.tsx
     ← copy from users/page.tsx
   app/(dashboard)/admin/roles/page.tsx
     ← copy from roles/page.tsx

5. Create new API folders + copy files:
   app/api/stock/replenishment/route.ts
     ← copy from api/stock-replenishment/route.ts
   app/api/stock/replenishment/thresholds/route.ts
     ← copy from api/stock-replenishment/thresholds/route.ts
   app/api/stock/review/route.ts
     ← copy from api/stock-review/route.ts
   app/api/stock/review/count/route.ts
     ← copy from api/stock-review/count/route.ts
   app/api/stock/review/resolve/route.ts
     ← copy from api/stock-review/resolve/route.ts

**UPDATE ALL REFERENCES:**
6. Update every fetch() call in components:
   '/api/stock-replenishment' → '/api/stock/replenishment'
   '/api/stock-review'        → '/api/stock/review'

7. Update sidebar navigation:
   /client-replenishment  → /replenishment/client
   /stock-replenishment   → /replenishment/stock
   /users                 → /admin/users
   /roles                 → /admin/roles

8. Update middleware.ts — replace all old route references

9. Update post-login redirect:
   Find where login success redirects (lib/auth-session.ts or
   app/api/auth/login/route.ts)
   Change redirect from /client-replenishment → /dashboard
   (Exception to Section 8 — only this one line)

10. Update root page.tsx:
    app/(dashboard)/page.tsx → redirect('/dashboard')

11. Add legacy redirects (instead of dead links):
    /client-replenishment      → /replenishment/client
    /stock-replenishment       → /replenishment/stock
    /replenishment-history     → /replenishment/client
    /replenishment             → /replenishment/client
    /users                     → /admin/users
    /roles                     → /admin/roles
    Add these as Next.js redirects in next.config.ts

12. Update CLAUDE.md with new folder structure and routes

**VERIFY:**
13. Run npm run build — must pass before any deletions
    Show full output — do not proceed if any errors

**DELETE OLD FILES (only after Step 13 passes):**
14. Delete old page folders:
    app/(dashboard)/client-replenishment/
    app/(dashboard)/stock-replenishment/
    app/(dashboard)/replenishment/page.tsx   ← flat legacy
    app/(dashboard)/replenishment-v1/
    app/(dashboard)/replenishment-history/
    app/(dashboard)/users/                   ← old location
    app/(dashboard)/roles/                   ← old location

15. Delete old API route folders:
    app/api/stock-replenishment/
    app/api/stock-review/

16. Run npm run build again — must pass clean

17. Update docs/PROGRESS.md

---

## 8. WHAT NOT TO TOUCH

```
prisma/schema.prisma      ← do not touch
prisma/seed.ts            ← do not touch
lib/                      ← do not touch any lib files
components/               ← do not move any components
tests/                    ← do not touch
app/api/replenishment/    ← do not touch existing replenishment APIs
app/api/auth/             ← do not touch EXCEPT:
                             ONE exception: update post-login redirect
                             from /client-replenishment → /dashboard
```