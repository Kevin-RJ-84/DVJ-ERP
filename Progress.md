# Implementation progress (code-accurate)

## Authentication

| Item | Status | Location |
|------|--------|----------|
| Login API | Done | `app/api/auth/login/route.ts` |
| Logout | Done | `app/api/auth/logout/route.ts` |
| Forgot / reset / OTP | Done | `app/api/auth/forgot-password/route.ts`, `reset-password/route.ts`, `verify-otp/route.ts` |
| Change password | Done | `app/api/auth/change-password/route.ts` |
| Login UI | Done | `app/(auth)/login/page.tsx`, `components/auth/LoginForm.tsx` |

## Users (admin)

| Item | Status | Location |
|------|--------|----------|
| GET / POST invite / PATCH | Done | `app/api/users/route.ts` |
| User management page | Done | `app/(dashboard)/users/page.tsx`, `components/users/UserManagement.tsx` |
| Email | Done | `lib/email.ts` (Resend or SMTP) |

## Clients

| Item | Status | Location |
|------|--------|----------|
| Page + table UI | Done | `app/(dashboard)/clients/page.tsx`, `components/clients/ClientManagement.tsx` |
| API | Done | `app/api/clients/route.ts` |

## Excel mapping

| Item | Status | Location |
|------|--------|----------|
| Page + manager UI | Done | `app/(dashboard)/excel-config/page.tsx`, `components/excel-config/ExcelConfigManager.tsx` |
| Config lib + API | Done | `lib/excel-config.ts`, `app/api/excel-config/route.ts` |

## Replenishment

| Item | Status | Location |
|------|--------|----------|
| V2 UI | Done | `components/replenishment/ReplenishmentV2Page.tsx` |
| Home wiring | Done | `app/(dashboard)/page.tsx` |
| `/replenishment` | Done | `app/(dashboard)/replenishment/page.tsx` |
| V1 legacy | Present | `app/(dashboard)/replenishment-v1/page.tsx` |
| Group fields | Done | `lib/replenishment-v2.ts` |
| API v2 + helpers | Done | `app/api/replenishment/v2/route.ts`, `calculate/route.ts`, `options/route.ts` |
| PDF export | Done | `ReplenishmentV2Page.tsx` |
| MetalType filter on warehouse/pullback | Done | `ReplenishmentV2Page.tsx` |

## Upload

| Item | Status | Location |
|------|--------|----------|
| API | Done | `app/api/upload/route.ts` |
| Modal | Done | `components/replenishment/UploadModal.tsx` |

## Layout

| Item | Status | Location |
|------|--------|----------|
| Shell + layout | Done | `app/(dashboard)/layout.tsx`, `components/layout/DashboardShell.tsx` |
| Sidebar | Done | `components/layout/DashboardSidebar.tsx` |
| PageHeader | Done | `components/layout/PageHeader.tsx` |

## Database

| Item | Status | Location |
|------|--------|----------|
| Schema | Done | `prisma/schema.prisma` |
| Client | Done | `lib/db.ts` |

## CHANGES-2 (RBAC + Rankings + Config + Replenishment Storage + Smart Pick)

| Step | Item | Status | Location |
|------|------|--------|----------|
| 1 | Add `SaleValue` + `CRAmount` to `sales` schema + migrate | Done | `prisma/schema.prisma`, `lib/excel-config.ts`, migration `20260430000000_add_sales_value_columns` |
| 2 | Add RBAC tables (`roles`, `permissions`, `role_permissions`) + `users.RoleID` FK | Done | `prisma/schema.prisma`, migration `20260430000100_add_rbac_tables` |
| 3 | Add `replenishments`, `customer_rankings`, `system_config` tables | Done | `prisma/schema.prisma`, migration `20260430000200_add_replenishments_rankings_config` |
| 4 | Seed permissions, roles, system_config; migrate existing users to RoleID | Done | `prisma/seed.ts` |
| 5 | `lib/rbac.ts` (getUserPermissions, hasPermission, requirePermission + ForbiddenError, 60s cache) | Done | `lib/rbac.ts` |
| 5 | `lib/config.ts` (getConfig, getConfigBool, getConfigInt, getConfigDecimal, 60s cache, invalidate) | Done | `lib/config.ts` |
| 6 | Add `requirePermission()` checks to all existing API routes | Done | `app/api/users/route.ts`, `app/api/clients/route.ts`, `app/api/excel-config/route.ts`, `app/api/upload/route.ts`, `app/api/replenishment/v2/route.ts`, `app/api/replenishment/calculate/route.ts`, `app/api/replenishment/options/route.ts` |
| 7 | `lib/rankings.ts` — `recalculateRankings()` with config-driven scoring, period filter, raw SQL aggregation, partial-index upserts | Done | `lib/rankings.ts` |