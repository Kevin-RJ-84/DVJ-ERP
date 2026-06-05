import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermission, ForbiddenError, invalidateUserPermissionCache } from "@/lib/rbac";

const createSchema = z.object({
  roleName: z.string().min(1).max(100),
  description: z.string().optional(),
  permissionIds: z.array(z.string().uuid()).optional(),
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    roleId: z.string().uuid(),
    roleName: z.string().min(1).max(100).optional(),
    description: z.string().optional(),
  }),
  z.object({
    action: z.literal("assign_permissions"),
    roleId: z.string().uuid(),
    permissionIds: z.array(z.string().uuid()),
  }),
]);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "roles.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const roles = await db.roles.findMany({
    include: {
      Permissions: {
        include: { Permission: true },
      },
      _count: { select: { Users: true } },
    },
    orderBy: { RoleName: "asc" },
  });

  return NextResponse.json({
    roles: roles.map((r) => ({
      roleId: r.RoleID,
      roleName: r.RoleName,
      description: r.Description,
      isSystem: r.IsSystem,
      userCount: r._count.Users,
      permissions: r.Permissions.map((rp) => ({
        permissionId: rp.PermissionID,
        permissionKey: rp.Permission.PermissionKey,
        description: rp.Permission.Description,
        module: rp.Permission.Module,
      })),
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "roles.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Missing or invalid fields.", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { roleName, description, permissionIds } = parsed.data;

  const existing = await db.roles.findUnique({ where: { RoleName: roleName } });
  if (existing) {
    return NextResponse.json({ message: `Role '${roleName}' already exists.` }, { status: 409 });
  }

  const role = await db.roles.create({
    data: {
      RoleName: roleName,
      Description: description ?? null,
      CreatedByID: auth.userId,
      IsSystem: false,
      ...(permissionIds && permissionIds.length > 0
        ? { Permissions: { create: permissionIds.map((id) => ({ PermissionID: id })) } }
        : {}),
    },
  });

  return NextResponse.json({ success: true, roleId: role.RoleID }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Missing or invalid fields.", errors: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  const role = await db.roles.findUnique({ where: { RoleID: data.roleId } });
  if (!role) return NextResponse.json({ message: "Role not found." }, { status: 404 });

  if (data.action === "update") {
    try {
      await requirePermission(auth.userId, "roles.edit");
    } catch (e) {
      if (e instanceof ForbiddenError) return e.response;
      throw e;
    }
    if (role.IsSystem) {
      return NextResponse.json({ message: "Cannot edit system roles." }, { status: 403 });
    }
    await db.roles.update({
      where: { RoleID: data.roleId },
      data: {
        ...(data.roleName !== undefined ? { RoleName: data.roleName } : {}),
        ...(data.description !== undefined ? { Description: data.description } : {}),
      },
    });
    return NextResponse.json({ success: true });
  }

  // action === "assign_permissions"
  try {
    await requirePermission(auth.userId, "roles.assign_permissions");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const deleteOp = db.role_permissions.deleteMany({ where: { RoleID: data.roleId } });
  if (data.permissionIds.length > 0) {
    await db.$transaction([
      deleteOp,
      db.role_permissions.createMany({
        data: data.permissionIds.map((pid) => ({ RoleID: data.roleId, PermissionID: pid })),
      }),
    ]);
  } else {
    await deleteOp;
  }

  invalidateUserPermissionCache();

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "roles.delete");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const { searchParams } = new URL(request.url);
  const roleId = searchParams.get("roleId");
  if (!roleId) {
    return NextResponse.json({ message: "roleId query param required." }, { status: 400 });
  }

  const role = await db.roles.findUnique({ where: { RoleID: roleId } });
  if (!role) return NextResponse.json({ message: "Role not found." }, { status: 404 });
  if (role.IsSystem) {
    return NextResponse.json({ message: "Cannot delete system roles." }, { status: 403 });
  }

  await db.roles.delete({ where: { RoleID: roleId } });

  invalidateUserPermissionCache();

  return NextResponse.json({ success: true });
}
