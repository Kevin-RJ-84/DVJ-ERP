/**
 * Test database fixtures.
 * Import helpers from this module in test files to create consistent test data.
 * These are pure data factories — they do NOT hit the database by themselves;
 * tests mock the Prisma client and pass these objects as mock return values.
 */

import { randomUUID } from "crypto";

// ─── IDs (stable across a test run) ─────────────────────────────────────────

// All IDs use valid RFC 4122 v4 UUID format: xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx
export const TEST_IDS = {
  superAdminRoleId: "00000001-0000-4000-8000-000000000000",
  adminRoleId:      "00000002-0000-4000-8000-000000000000",
  memberRoleId:     "00000003-0000-4000-8000-000000000000",
  viewerRoleId:     "00000004-0000-4000-8000-000000000000",

  superAdminUserId: "00000001-0001-4000-8000-000000000000",
  adminUserId:      "00000002-0001-4000-8000-000000000000",
  memberUserId:     "00000003-0001-4000-8000-000000000000",
  viewerUserId:     "00000004-0001-4000-8000-000000000000",

  client1Id: "00000001-0002-4000-8000-000000000000",
  client2Id: "00000002-0002-4000-8000-000000000000",
  client3Id: "00000003-0002-4000-8000-000000000000",
  client4Id: "00000004-0002-4000-8000-000000000000",
  client5Id: "00000005-0002-4000-8000-000000000000",

  replenishment1Id: "00000001-0003-4000-8000-000000000000",
} as const;

// ─── Permission keys ──────────────────────────────────────────────────────────

export const ALL_PERMISSION_KEYS = [
  "users.view", "users.invite", "users.edit_role", "users.deactivate",
  "roles.view", "roles.create", "roles.edit", "roles.delete", "roles.assign_permissions",
  "replenishment.view", "replenishment.search", "replenishment.override_qty",
  "replenishment.toggle_stock", "replenishment.confirm", "replenishment.export_pdf", "replenishment.undo",
  "replenishment_history.view", "replenishment_history.filter",
  "upload.stock", "upload.sales",
  "excel_config.view", "excel_config.edit",
  "clients.view", "clients.edit_expiry", "clients.edit_pullback",
  "settings.view", "settings.edit",
  "rankings.view", "rankings.recalculate",
];

export const MEMBER_PERMISSIONS = [
  "replenishment.view", "replenishment.search", "replenishment.override_qty",
  "replenishment.toggle_stock", "replenishment.confirm", "replenishment.export_pdf",
  "replenishment_history.view", "replenishment_history.filter",
  "upload.stock", "upload.sales",
  "clients.view",
];

export const VIEWER_PERMISSIONS = [
  "replenishment.view",
  "replenishment_history.view",
  "clients.view",
];

// ─── User factory ─────────────────────────────────────────────────────────────

export function makeUser(overrides: Partial<{
  UserID: string;
  Username: string;
  Email: string;
  PasswordHash: string;
  FirstName: string;
  LastName: string;
  Role: string;
  RoleID: string | null;
  IsFirstLogin: boolean;
  IsActive: boolean;
  UserRole: { RoleName: string; RoleID: string } | null;
}> = {}) {
  return {
    UserID: overrides.UserID ?? randomUUID(),
    Username: overrides.Username ?? "testuser",
    Email: overrides.Email ?? "test@example.com",
    PasswordHash: overrides.PasswordHash ?? "$2b$12$hashedpassword",
    FirstName: overrides.FirstName ?? "Test",
    LastName: overrides.LastName ?? "User",
    Role: overrides.Role ?? "member",
    RoleID: overrides.RoleID ?? TEST_IDS.memberRoleId,
    IsFirstLogin: overrides.IsFirstLogin ?? false,
    IsActive: overrides.IsActive ?? true,
    OtpHash: null,
    OtpExpiresAt: null,
    CreatedAt: new Date("2026-01-01"),
    ModifiedAt: new Date("2026-01-01"),
    ModifiedByID: null,
    UserRole: overrides.UserRole ?? {
      RoleID: TEST_IDS.memberRoleId,
      RoleName: "member",
    },
  };
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function makeClient(overrides: Partial<{
  ClientID: string;
  PartyCode: string | null;
  PartyName: string;
  CloseToExpiryDays: number;
  IsStockPullAllowed: boolean;
  OverallRank: number | null;
  OverallScore: unknown;
  LastRankedAt: Date | null;
}> = {}) {
  return {
    ClientID: overrides.ClientID ?? randomUUID(),
    PartyCode: overrides.PartyCode ?? "C001",
    PartyName: overrides.PartyName ?? "Test Client",
    CloseToExpiryDays: overrides.CloseToExpiryDays ?? 7,
    IsStockPullAllowed: overrides.IsStockPullAllowed ?? true,
    OverallRank: overrides.OverallRank ?? null,
    OverallScore: overrides.OverallScore ?? null,
    LastRankedAt: overrides.LastRankedAt ?? null,
    CreatedAt: new Date("2026-01-01"),
  };
}

// ─── System config entries ────────────────────────────────────────────────────

export const DEFAULT_SYSTEM_CONFIG: Array<{ ConfigKey: string; ConfigValue: string }> = [
  { ConfigKey: "partial_replenishment_visibility", ConfigValue: "true" },
  { ConfigKey: "default_group_by", ConfigValue: "StyleNo" },
  { ConfigKey: "random_pick_method", ConfigValue: "random" },
  { ConfigKey: "ranking_value_metric", ConfigValue: "SaleValue" },
  { ConfigKey: "ranking_value_weight", ConfigValue: "0.6" },
  { ConfigKey: "ranking_volume_weight", ConfigValue: "0.4" },
  { ConfigKey: "ranking_period", ConfigValue: "all_time" },
  { ConfigKey: "ranking_last_calculated", ConfigValue: "" },
  { ConfigKey: "otp_expiry_minutes", ConfigValue: "10" },
  { ConfigKey: "close_to_expiry_default_days", ConfigValue: "7" },
  { ConfigKey: "temp_password_length", ConfigValue: "12" },
];

// ─── Sales factory ────────────────────────────────────────────────────────────

export function makeSale(overrides: Partial<{
  SalesID: string;
  InvoiceNo: string;
  InvoiceDate: Date;
  PartyCode: string | null;
  PartyName: string | null;
  StockNo: string | null;
  StyleNo: string | null;
  SaleValue: unknown;
  CRAmount: unknown;
}> = {}) {
  return {
    SalesID: overrides.SalesID ?? randomUUID(),
    InvoiceNo: overrides.InvoiceNo ?? "INV-001",
    InvoiceDate: overrides.InvoiceDate ?? new Date("2026-01-15"),
    PartyCode: overrides.PartyCode ?? "C001",
    PartyName: overrides.PartyName ?? "Test Client",
    Department: null,
    StockNo: overrides.StockNo ?? "STK-001",
    StyleNo: overrides.StyleNo ?? "3333",
    STShapes: null,
    ProductType: "Ring",
    Metal: "Gold",
    StonePcs: null,
    StoneWT: null,
    MetalType: "18K",
    MetalWT: null,
    Size: null,
    Remarks: null,
    RestockNeeded: false,
    RestockType: null,
    SaleValue: overrides.SaleValue ?? "5000.00",
    CRAmount: overrides.CRAmount ?? "3000.00",
    MemoID: null,
    UploadedAt: new Date("2026-01-15"),
  };
}
