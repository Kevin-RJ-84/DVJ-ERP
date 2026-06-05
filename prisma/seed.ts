/**
 * Seed script — idempotent, safe to rerun.
 *
 * 1. Upserts all permission keys (grouped by module)
 * 2. Upserts four default roles and assigns their permissions
 * 3. Upserts all system_config defaults
 * 4. Migrates existing users: sets RoleID from their current Role varchar value
 * 5. Creates the first admin user if SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD are set
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../lib/auth";
import { deriveNamesFromEmail, usernameFromEmail } from "../lib/users";

// ─── Permission definitions ───────────────────────────────────────────────────

const PERMISSIONS: { key: string; module: string; description: string }[] = [
  // users
  { key: "users.view",               module: "users",                  description: "View user list" },
  { key: "users.invite",             module: "users",                  description: "Invite new users" },
  { key: "users.edit_role",          module: "users",                  description: "Change a user's role" },
  { key: "users.deactivate",         module: "users",                  description: "Deactivate users" },
  // roles
  { key: "roles.view",               module: "roles",                  description: "View roles and their permissions" },
  { key: "roles.create",             module: "roles",                  description: "Create new roles" },
  { key: "roles.edit",               module: "roles",                  description: "Edit role name / description" },
  { key: "roles.delete",             module: "roles",                  description: "Delete non-system roles" },
  { key: "roles.assign_permissions", module: "roles",                  description: "Assign / remove permissions on a role" },
  // replenishment
  { key: "replenishment.view",         module: "replenishment",        description: "View replenishment page" },
  { key: "replenishment.search",       module: "replenishment",        description: "Search replenishment data" },
  { key: "replenishment.override_qty", module: "replenishment",        description: "Override replenishment quantity" },
  { key: "replenishment.toggle_stock", module: "replenishment",        description: "Toggle stock pill selection" },
  { key: "replenishment.confirm",      module: "replenishment",        description: "Confirm and save a replenishment" },
  { key: "replenishment.export_pdf",   module: "replenishment",        description: "Export replenishment PDF" },
  { key: "replenishment.undo",         module: "replenishment",        description: "Undo a confirmed replenishment" },
  { key: "replenishment.log_pullback_contact", module: "replenishment", description: "Log pullback contact attempts" },
  { key: "replenishment.change_pullback_selection", module: "replenishment", description: "Change pullback selection with reason" },
  { key: "replenishment.view_pending_pullbacks", module: "replenishment", description: "View pending pullbacks screen" },
  { key: "replenishment.view_factory_orders", module: "replenishment", description: "View factory orders screen" },
  { key: "replenishment.mark_factory_ordered", module: "replenishment", description: "Mark factory order as placed" },
  { key: "replenishment.export_confirmed", module: "replenishment", description: "Export confirmed replenishment PDF/Excel" },
  { key: "replenishment.export_factory_orders", module: "replenishment", description: "Export factory orders PDF/Excel" },
  // replenishment_history
  { key: "replenishment_history.view",   module: "replenishment_history", description: "View replenishment history" },
  { key: "replenishment_history.filter", module: "replenishment_history", description: "Filter replenishment history" },
  // upload
  { key: "upload.stock", module: "upload", description: "Upload stock Excel file" },
  { key: "upload.sales", module: "upload", description: "Upload sales Excel file" },
  // excel_config
  { key: "excel_config.view", module: "excel_config", description: "View Excel column mappings" },
  { key: "excel_config.edit", module: "excel_config", description: "Edit Excel column mappings" },
  // clients
  { key: "clients.view",          module: "clients", description: "View client list" },
  { key: "clients.edit_expiry",   module: "clients", description: "Edit client close-to-expiry days" },
  { key: "clients.edit_pullback", module: "clients", description: "Edit client pullback allowed flag" },
  // settings
  { key: "settings.view", module: "settings", description: "View system settings" },
  { key: "settings.edit", module: "settings", description: "Edit system settings" },
  // rankings
  { key: "rankings.view",        module: "rankings", description: "View customer rankings" },
  { key: "rankings.recalculate", module: "rankings", description: "Trigger rankings recalculation" },
  // dashboard
  { key: "dashboard.view", module: "dashboard", description: "View sales dashboard" },
  // stock_replenishment
  { key: "stock_replenishment.view",       module: "stock_replenishment", description: "View stock replenishment alerts" },
  { key: "stock_replenishment.export",     module: "stock_replenishment", description: "Export stock replenishment PDF/Excel" },
  { key: "stock_replenishment.configure",  module: "stock_replenishment", description: "Configure stock replenishment thresholds" },
  // stock_review (missing items)
  { key: "stock_review.view",    module: "stock_review", description: "View missing stock review list" },
  { key: "stock_review.resolve", module: "stock_review", description: "Mark missing stock as resolved" },
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

// Permissions excluded from the admin role
const ADMIN_EXCLUDED = new Set(["settings.edit", "roles.delete", "replenishment.undo"]);

// Permissions for the member role (replenishment.*, replenishment_history.view, upload.*, clients.view)
const MEMBER_KEYS = new Set(
  ALL_KEYS.filter(
    (k) =>
      k.startsWith("replenishment.") ||
      k === "replenishment_history.view" ||
      k.startsWith("upload.") ||
      k === "clients.view" ||
      k === "stock_replenishment.view" ||
      k === "stock_replenishment.export" ||
      k === "dashboard.view" ||
      k === "stock_review.view",
  ),
);

// Permissions for the viewer role
const VIEWER_KEYS = new Set([
  "replenishment.view",
  "replenishment_history.view",
  "replenishment.view_pending_pullbacks",
  "replenishment.view_factory_orders",
  "clients.view",
  "stock_replenishment.view",
  "dashboard.view",
]);

const ROLE_DEFINITIONS = [
  {
    name: "super_admin",
    description: "Full system access — can do everything",
    isSystem: true,
    keys: ALL_KEYS,
  },
  {
    name: "admin",
    description: "Admin access — all permissions except settings.edit, roles.delete, replenishment.undo",
    isSystem: true,
    keys: ALL_KEYS.filter((k) => !ADMIN_EXCLUDED.has(k)),
  },
  {
    name: "member",
    description: "Standard member — replenishment, upload, and client view",
    isSystem: false,
    keys: [...MEMBER_KEYS],
  },
  {
    name: "viewer",
    description: "View-only — replenishment view and history",
    isSystem: false,
    keys: [...VIEWER_KEYS],
  },
];

// ─── System config defaults ───────────────────────────────────────────────────

const SYSTEM_CONFIG = [
  // replenishment
  { key: "partial_replenishment_visibility", value: "true",     type: "boolean", module: "replenishment", description: "Show results per line-item even when some are already replenished" },
  { key: "default_group_by",                 value: "StyleNo",  type: "enum",    module: "replenishment", description: "Default group-by field on the replenishment page" },
  { key: "random_pick_method",               value: "random",   type: "enum",    module: "replenishment", description: "Stock pick method: random | fifo | oldest_memo" },
  // stock_replenishment
  { key: "stock_threshold_mode",           value: "manual", type: "enum",    module: "stock_replenishment", description: "manual | velocity | global" },
  { key: "stock_threshold_global_value",  value: "5",      type: "integer", module: "stock_replenishment", description: "Global minimum stock for all StyleNos when mode=global" },
  { key: "stock_velocity_buffer_months",  value: "3",      type: "integer", module: "stock_replenishment", description: "Buffer months for velocity calculation" },
  { key: "stock_velocity_history_months",  value: "6",      type: "integer", module: "stock_replenishment", description: "Months of sales history window for velocity" },
  // S-Class
  { key: "sclass_min_revenue_per_piece", value: "500", type: "decimal", module: "stock_replenishment", description: "Avg sale value above which a StyleNo is S-class. Checked before ABC ranking." },
  { key: "sclass_fixed_min_stock",       value: "1",   type: "integer", module: "stock_replenishment", description: "Fixed minimum pieces to always keep for S-class. No trend calculation applied." },
  // ABC Distribution
  { key: "abc_a_class_pct", value: "20", type: "integer", module: "stock_replenishment", description: "Top X% of styles by annual revenue = A-class. A+B must not exceed 99." },
  { key: "abc_b_class_pct", value: "30", type: "integer", module: "stock_replenishment", description: "Next X% of styles by annual revenue = B-class. C = 100 - A - B (auto)." },
  // Buffers — global toggle
  { key: "buffer_enabled", value: "true", type: "boolean", module: "stock_replenishment", description: "Master switch — when OFF all class buffers ignored" },
  // Buffers — per class toggle + multiplier
  { key: "buffer_a_enabled",    value: "true", type: "boolean", module: "stock_replenishment", description: "Apply buffer to A-class styles" },
  { key: "buffer_a_multiplier", value: "1.2",  type: "decimal", module: "stock_replenishment", description: "Buffer multiplier for A-class styles (e.g. 1.2 = 20% safety stock)" },
  { key: "buffer_b_enabled",    value: "true",  type: "boolean", module: "stock_replenishment", description: "Apply buffer to B-class styles" },
  { key: "buffer_b_multiplier", value: "1.15",  type: "decimal", module: "stock_replenishment", description: "Buffer multiplier for B-class styles" },
  { key: "buffer_c_enabled",    value: "true",  type: "boolean", module: "stock_replenishment", description: "Apply buffer to C-class styles" },
  { key: "buffer_c_multiplier", value: "1.05",  type: "decimal", module: "stock_replenishment", description: "Buffer multiplier for C-class styles (lean — stay close to prediction)" },
  // Method 1 — YoY Same Month
  { key: "stock_velocity_years_back", value: "3", type: "integer", module: "stock_replenishment", description: "How many past years to look at for same-month sales history" },
  // Method 2 — Seasonal Arc
  { key: "stock_window_enabled",    value: "true",      type: "boolean", module: "stock_replenishment", description: "Use seasonal arc (multi-month window) as Method 2" },
  { key: "stock_window_size",       value: "4",         type: "integer", module: "stock_replenishment", description: "Number of months in window including current month (e.g. 4 = Feb+Mar+Apr+May)" },
  { key: "stock_window_direction",  value: "backward",  type: "enum",    module: "stock_replenishment", description: "backward = preceding months | forward = following months in past years" },
  // Window Weights
  { key: "stock_window_weight_enabled",  value: "true", type: "boolean", module: "stock_replenishment", description: "Apply weights to window months (current month gets more weight)" },
  { key: "stock_window_weight_mode",     value: "auto", type: "enum",    module: "stock_replenishment", description: "auto = current month 50% rest split equally | manual = user sets each weight" },
  { key: "stock_window_weight_current",  value: "50",   type: "integer", module: "stock_replenishment", description: "Weight % for current month in auto mode" },
  { key: "stock_window_weights_manual",  value: "{}",   type: "json",    module: "stock_replenishment", description: "Manual weights per month offset. e.g. {\"0\":50,\"-1\":30,\"-2\":20} must sum to 100" },
  // Blending
  { key: "stock_method1_weight",          value: "50", type: "integer", module: "stock_replenishment", description: "Weight % for Method 1 (YoY same month) in final blend. Method 2 = 100 - this." },
  { key: "stock_confidence_gap_warning",  value: "30", type: "integer", module: "stock_replenishment", description: "If Method 1 and Method 2 differ by more than X% — flag for manual review" },
  // CV Noise Filter
  { key: "stock_cv_trust_threshold",   value: "0.3", type: "decimal", module: "stock_replenishment", description: "CV below this = consistent data = trust growth fully" },
  { key: "stock_cv_dampen_threshold",  value: "0.7", type: "decimal", module: "stock_replenishment", description: "CV between trust and this = dampen growth by 50%. CV above this = ignore growth." },
  // Safety
  { key: "stock_global_minimum", value: "1", type: "integer", module: "stock_replenishment", description: "Absolute minimum stock floor — no style ever goes below this" },
  // Feedback Loop (Phase 2 — built now, activated later)
  { key: "stock_feedback_enabled",          value: "false", type: "boolean", module: "stock_replenishment", description: "Track forecast accuracy for future ML bias correction. OFF until 6+ months data." },
  { key: "stock_bias_correction_enabled",   value: "false", type: "boolean", module: "stock_replenishment", description: "Apply learned bias correction to predictions. OFF until feedback data matures." },
  { key: "stock_bias_window_months",        value: "6",     type: "integer", module: "stock_replenishment", description: "How many months of forecast history to use for bias score calculation" },
  // ERP Sync
  { key: "erp_sync_enabled",           value: "true", type: "boolean", module: "system", description: "Whether auto ERP sync is enabled" },
  { key: "erp_sync_interval_minutes",  value: "30",   type: "integer", module: "system", description: "Auto sync interval in minutes" },
  { key: "erp_last_stock_sync",        value: "",     type: "string",  module: "system", description: "Last successful stock sync timestamp" },
  // ranking
  { key: "use_combined_score",    value: "false",     type: "boolean", module: "ranking", description: "When ON, ranks by weighted combination of value + volume. When OFF, ranks purely by selected value metric." },
  { key: "ranking_value_metric",  value: "SaleValue", type: "enum",    module: "ranking", description: "Value metric used for ranking score: SaleValue | Profit" },
  { key: "ranking_value_weight",  value: "0.6",       type: "decimal", module: "ranking", description: "Weight applied to the value metric (0.0 – 1.0)" },
  { key: "ranking_volume_weight", value: "0.4",       type: "decimal", module: "ranking", description: "Weight applied to volume (pieces sold); should sum to 1.0 with value weight" },
  { key: "ranking_period",        value: "all_time",  type: "enum",    module: "ranking", description: "Period for ranking calculation: all_time | yearly | monthly" },
  // system
  { key: "otp_expiry_minutes",            value: "10", type: "integer", module: "system", description: "OTP validity window in minutes" },
  { key: "close_to_expiry_default_days",  value: "7",  type: "integer", module: "system", description: "Default days before memo end date to flag as close-to-expiry" },
  { key: "temp_password_length",          value: "12", type: "integer", module: "system", description: "Length of generated temporary passwords" },
  // permissions (minimum role required for sensitive actions)
  { key: "perm_undo_replenishment", value: "super_admin", type: "enum",   module: "permissions", description: "Minimum role required to undo a confirmed replenishment" },
  { key: "perm_export_pdf",         value: "member",      type: "enum",   module: "permissions", description: "Minimum role required to export the replenishment PDF" },
  { key: "perm_upload_excel",       value: "admin",       type: "enum",   module: "permissions", description: "Minimum role required to upload stock or sales Excel files" },
  { key: "perm_manage_clients",     value: "member",      type: "enum",   module: "permissions", description: "Minimum role required to manage client settings" },
  // ranking metadata
  { key: "ranking_last_calculated", value: "", type: "string", module: "ranking", description: "ISO timestamp of the most recent ranking recalculation" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUniqueUsername(
  prisma: PrismaClient,
  email: string,
  preferred?: string,
) {
  const base = (preferred?.trim() || usernameFromEmail(email)).slice(0, 10) || "admin";
  for (let i = 0; i < 20; i += 1) {
    const suffix = i === 0 ? "" : `${Math.floor(100 + Math.random() * 900)}`;
    const candidate = `${base}${suffix}`.slice(0, 14);
    const existing = await prisma.users.findUnique({ where: { Username: candidate } });
    if (!existing) return candidate;
  }
  return `${base}${Date.now().toString().slice(-4)}`.slice(0, 14);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured.");

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: ["warn", "error"],
  });

  try {
    // ── 1. Upsert permissions ────────────────────────────────────────────────
    console.log("\n── Seeding permissions ──");
    for (const p of PERMISSIONS) {
      await prisma.permissions.upsert({
        where: { PermissionKey: p.key },
        update: { Description: p.description, Module: p.module },
        create: { PermissionKey: p.key, Description: p.description, Module: p.module },
      });
    }
    console.log(`  ${PERMISSIONS.length} permissions upserted.`);

    // ── 2. Upsert roles and assign permissions ───────────────────────────────
    console.log("\n── Seeding roles ──");
    for (const roleDef of ROLE_DEFINITIONS) {
      // Upsert the role row
      const role = await prisma.roles.upsert({
        where: { RoleName: roleDef.name },
        update: { Description: roleDef.description, IsSystem: roleDef.isSystem },
        create: { RoleName: roleDef.name, Description: roleDef.description, IsSystem: roleDef.isSystem },
      });

      // Resolve PermissionIDs for this role's keys
      const permRows = await prisma.permissions.findMany({
        where: { PermissionKey: { in: roleDef.keys } },
        select: { PermissionID: true },
      });

      // Remove existing assignments, then re-insert — clean diff approach
      await prisma.role_permissions.deleteMany({ where: { RoleID: role.RoleID } });
      if (permRows.length > 0) {
        await prisma.role_permissions.createMany({
          data: permRows.map((p) => ({ RoleID: role.RoleID, PermissionID: p.PermissionID })),
          skipDuplicates: true,
        });
      }

      console.log(`  ${roleDef.name}: ${permRows.length} permissions assigned.`);
    }

    // ── 3. Upsert system_config ──────────────────────────────────────────────
    console.log("\n── Seeding system_config ──");
    for (const cfg of SYSTEM_CONFIG) {
      await prisma.system_config.upsert({
        where: { ConfigKey: cfg.key },
        update: { ConfigType: cfg.type, Module: cfg.module, Description: cfg.description },
        // Only update type/module/description on re-run — do NOT overwrite admin-edited values
        create: {
          ConfigKey: cfg.key,
          ConfigValue: cfg.value,
          ConfigType: cfg.type,
          Module: cfg.module,
          Description: cfg.description,
        },
      });
    }
    console.log(`  ${SYSTEM_CONFIG.length} config entries upserted.`);

    // ── 4. Migrate existing users: set RoleID from Role varchar ─────────────
    console.log("\n── Migrating existing users → RoleID ──");

    // Load the admin and member roles (viewer/super_admin have no legacy match)
    const [adminRole, memberRole] = await Promise.all([
      prisma.roles.findUnique({ where: { RoleName: "admin" } }),
      prisma.roles.findUnique({ where: { RoleName: "member" } }),
    ]);

    const roleMap: Record<string, string | undefined> = {
      admin:  adminRole?.RoleID,
      member: memberRole?.RoleID,
    };

    const usersWithoutRoleID = await prisma.users.findMany({
      where: { RoleID: null },
      select: { UserID: true, Role: true, Email: true },
    });

    let migrated = 0;
    for (const user of usersWithoutRoleID) {
      const targetRoleID = roleMap[user.Role.toLowerCase()];
      if (targetRoleID) {
        await prisma.users.update({
          where: { UserID: user.UserID },
          data: { RoleID: targetRoleID },
        });
        console.log(`  ${user.Email}: Role="${user.Role}" → RoleID set`);
        migrated++;
      } else {
        console.warn(`  ${user.Email}: Role="${user.Role}" has no matching seeded role — skipped`);
      }
    }
    console.log(`  ${migrated} user(s) migrated.`);

    // ── 5. Seed initial admin user (optional, env-gated) ────────────────────
    const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email || !password) {
      console.log("\nSeed admin user skipped: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create one.");
    } else {
      const existing = await prisma.users.findUnique({ where: { Email: email } });
      if (existing) {
        console.log(`\nSeed admin user skipped: ${email} already exists.`);
      } else {
        const names = deriveNamesFromEmail(email);
        const username = await ensureUniqueUsername(prisma, email, process.env.SEED_ADMIN_USERNAME);
        await prisma.users.create({
          data: {
            Username: username,
            Email: email,
            PasswordHash: await hashPassword(password),
            FirstName: names.firstName,
            LastName: names.lastName,
            Role: "admin",
            RoleID: adminRole?.RoleID,
            IsFirstLogin: false,
            IsActive: true,
          },
        });
        console.log(`\nSeeded admin user: ${email} (username: ${username}).`);
      }
    }

    console.log("\n✓ Seed complete.\n");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
