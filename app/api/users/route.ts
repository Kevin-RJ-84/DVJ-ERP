import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, isAllowedEmailDomain } from "@/lib/auth";
import { requireAuth } from "@/lib/auth-server";
import { sendEmail } from "@/lib/email";
import {
  buildInviteLink,
  generateInviteToken,
  inviteTokenExpiryDate,
} from "@/lib/invite";
import { deriveNamesFromEmail, generateTempPassword } from "@/lib/users";
import { requirePermission, ForbiddenError, invalidateUserPermissionCache } from "@/lib/rbac";

const inviteSchema = z.object({
  action: z.literal("invite"),
  email: z.string().email(),
  roleId: z.string().uuid(),
});

const updateSchema = z.object({
  action: z.literal("update"),
  userId: z.string().uuid(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

const PENDING_USERNAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomPendingSuffix(length: number) {
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += PENDING_USERNAME_ALPHABET[
      Math.floor(Math.random() * PENDING_USERNAME_ALPHABET.length)
    ];
  }
  return result;
}

async function generatePendingUsername() {
  for (let i = 0; i < 20; i += 1) {
    const candidate = `pending_${randomPendingSuffix(6)}`;
    const existing = await db.users.findUnique({ where: { Username: candidate } });
    if (!existing) {
      return candidate;
    }
  }

  return `pending_${Date.now().toString(36).slice(-6)}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "users.view");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const [users, roles] = await Promise.all([
    db.users.findMany({
      orderBy: { CreatedAt: "desc" },
      select: {
        UserID: true,
        Username: true,
        Email: true,
        FirstName: true,
        LastName: true,
        Role: true,
        RoleID: true,
        IsActive: true,
        AvatarKey: true,
        CreatedAt: true,
        ModifiedAt: true,
        UserRole: { select: { IsSystem: true } },
      },
    }),
    db.roles.findMany({
      orderBy: { RoleName: "asc" },
      select: { RoleID: true, RoleName: true, IsSystem: true },
    }),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({
      UserID: u.UserID,
      Username: u.Username,
      Email: u.Email,
      FirstName: u.FirstName,
      LastName: u.LastName,
      Role: u.Role,
      RoleID: u.RoleID,
      IsActive: u.IsActive,
      AvatarKey: u.AvatarKey,
      CreatedAt: u.CreatedAt.toISOString(),
      ModifiedAt: u.ModifiedAt.toISOString(),
      isSystemRole: u.UserRole?.IsSystem ?? false,
    })),
    roles: roles.map((r) => ({
      roleId: r.RoleID,
      roleName: r.RoleName,
      isSystem: r.IsSystem,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  try {
    await requirePermission(auth.userId, "users.invite");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  const payload = await request.json();
  const inviteResult = inviteSchema.safeParse(payload);
  if (!inviteResult.success) {
    return NextResponse.json({ message: "Invalid invite payload." }, { status: 400 });
  }

  const email = inviteResult.data.email.toLowerCase();
  if (!isAllowedEmailDomain(email)) {
    return NextResponse.json(
      { message: "Email domain is not allowed." },
      { status: 403 },
    );
  }

  const existing = await db.users.findUnique({ where: { Email: email } });
  if (existing) {
    return NextResponse.json(
      { message: "User with this email already exists." },
      { status: 409 },
    );
  }

  const username = await generatePendingUsername();
  const tempPassword = generateTempPassword();
  const inviteToken = generateInviteToken();
  const inviteTokenExpiry = inviteTokenExpiryDate();
  const inviteLink = buildInviteLink(inviteToken);
  const names = deriveNamesFromEmail(email);

  const invitedRole = await db.roles.findFirst({
    where: { RoleID: inviteResult.data.roleId },
    select: { RoleID: true, RoleName: true, IsSystem: true },
  });
  if (!invitedRole) {
    return NextResponse.json({ message: "Role not found." }, { status: 404 });
  }

  const user = await db.users.create({
    data: {
      Username: username,
      Email: email,
      PasswordHash: await hashPassword(tempPassword),
      FirstName: names.firstName,
      LastName: names.lastName,
      Role: invitedRole.RoleName,
      UserRole: {
        connect: { RoleID: invitedRole.RoleID },
      },
      IsFirstLogin: true,
      IsActive: true,
      InviteToken: inviteToken,
      InviteTokenExpiry: inviteTokenExpiry,
      InviteTokenUsed: false,
      ModifiedByUser: {
        connect: { UserID: auth.userId },
      },
    },
    select: {
      UserID: true,
      Username: true,
      Email: true,
      FirstName: true,
      LastName: true,
      Role: true,
      RoleID: true,
      IsActive: true,
      CreatedAt: true,
      ModifiedAt: true,
      UserRole: { select: { IsSystem: true } },
    },
  });

  const emailResult = await sendEmail({
    to: email,
    subject: "DVJ ERP account invitation",
    text: `You have been invited to DVJ ERP.\n\nComplete your setup using this link (expires in 7 days):\n${inviteLink}\n\nEmail: ${email}\nTemporary Password: ${tempPassword}\n\nOpen the link, verify with your temporary password, then set your name and permanent password.`,
  });

  const userPayload = {
    ...user,
    CreatedAt: user.CreatedAt.toISOString(),
    ModifiedAt: user.ModifiedAt.toISOString(),
    isSystemRole: user.UserRole?.IsSystem ?? invitedRole.IsSystem,
  };

  const successBody = {
    message: "User created successfully",
    user: userPayload,
    tempPassword,
    inviteLink,
    emailSent: emailResult.sent,
    ...(emailResult.sent ? {} : { emailError: emailResult.reason }),
  };

  if (!emailResult.sent) {
    return NextResponse.json({
      ...successBody,
      message:
        "User created successfully, but the invitation email could not be sent. Share the invite details below manually.",
    });
  }

  return NextResponse.json(successBody);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const payload = await request.json();
  const updateResult = updateSchema.safeParse(payload);
  if (!updateResult.success) {
    return NextResponse.json({ message: "Invalid update payload." }, { status: 400 });
  }

  const { userId, roleId, isActive } = updateResult.data;
  if (roleId === undefined && isActive === undefined) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  try {
    if (roleId !== undefined) await requirePermission(auth.userId, "users.edit_role");
    if (isActive !== undefined) await requirePermission(auth.userId, "users.deactivate");
  } catch (e) {
    if (e instanceof ForbiddenError) return e.response;
    throw e;
  }

  // Guard: cannot deactivate your own account
  if (isActive === false && userId === auth.userId) {
    return NextResponse.json({ message: "You cannot deactivate your own account." }, { status: 403 });
  }

  // Guard: cannot change your own role
  if (roleId !== undefined && userId === auth.userId) {
    return NextResponse.json({ message: "You cannot change your own role." }, { status: 403 });
  }

  // Resolve new role if changing
  let newRoleName: string | undefined;
  let isSystemTarget = false;

  if (roleId !== undefined) {
    const targetRole = await db.roles.findUnique({
      where: { RoleID: roleId },
      select: { RoleName: true, IsSystem: true },
    });
    if (!targetRole) {
      return NextResponse.json({ message: "Role not found." }, { status: 404 });
    }
    newRoleName = targetRole.RoleName;
  }

  // Guard: cannot change role of a user who has a system role (e.g. super_admin)
  if (roleId !== undefined) {
    const targetUser = await db.users.findUnique({
      where: { UserID: userId },
      select: { UserRole: { select: { IsSystem: true } } },
    });
    isSystemTarget = targetUser?.UserRole?.IsSystem ?? false;
    if (isSystemTarget) {
      return NextResponse.json(
        { message: "Cannot change the role of a system-protected user." },
        { status: 403 },
      );
    }
  }

  const updated = await db.users.update({
    where: { UserID: userId },
    data: {
      ...(roleId !== undefined
        ? {
            Role: newRoleName,
            UserRole: { connect: { RoleID: roleId } },
          }
        : {}),
      ...(isActive !== undefined ? { IsActive: isActive } : {}),
      ModifiedAt: new Date(),
      ModifiedByUser: {
        connect: { UserID: auth.userId },
      },
    },
    select: {
      UserID: true,
      Username: true,
      Email: true,
      FirstName: true,
      LastName: true,
      Role: true,
      RoleID: true,
      IsActive: true,
      CreatedAt: true,
      ModifiedAt: true,
      UserRole: { select: { IsSystem: true } },
    },
  });

  if (roleId !== undefined) {
    invalidateUserPermissionCache(userId);
  }

  return NextResponse.json({
    message: "User updated successfully.",
    user: {
      UserID: updated.UserID,
      Username: updated.Username,
      Email: updated.Email,
      FirstName: updated.FirstName,
      LastName: updated.LastName,
      Role: updated.Role,
      RoleID: updated.RoleID,
      IsActive: updated.IsActive,
      CreatedAt: updated.CreatedAt.toISOString(),
      ModifiedAt: updated.ModifiedAt.toISOString(),
      isSystemRole: updated.UserRole?.IsSystem ?? false,
    },
  });
}
