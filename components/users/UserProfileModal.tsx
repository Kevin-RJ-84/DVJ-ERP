"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  alertError,
  btnPrimary,
  btnSecondary,
  fieldInput,
  modalCloseBtn,
  modalOverlay,
  modalPanel,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";
import { UserClayAvatar } from "./UserClayAvatar";

type UserRow = {
  UserID: string;
  Username: string;
  Email: string;
  FirstName: string;
  LastName: string;
  Role: string;
  RoleID: string | null;
  AvatarKey: string | null;
  IsActive: boolean;
  CreatedAt: string;
  ModifiedAt: string;
  isSystemRole: boolean;
};

type RoleOption = {
  roleId: string;
  roleName: string;
  isSystem: boolean;
};

type Props = {
  user: UserRow;
  currentUserId: string;
  canEditRole: boolean;
  canDeactivate: boolean;
  onClose: () => void;
  onUpdated: (user: UserRow) => void;
};

export function UserProfileModal({
  user,
  currentUserId,
  canEditRole,
  canDeactivate,
  onClose,
  onUpdated,
}: Props) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(user.RoleID ?? "");
  const [selectedIsActive, setSelectedIsActive] = useState<boolean>(user.IsActive);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isSelf = user.UserID === currentUserId;
  const roleChangeBlocked = !canEditRole || isSelf || user.isSystemRole;
  const statusChangeBlocked = !canDeactivate || isSelf;

  const roleChanged = selectedRoleId !== (user.RoleID ?? "");
  const statusChanged = selectedIsActive !== user.IsActive;
  const hasChanges = roleChanged || statusChanged;

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((data: { roles?: RoleOption[] }) => {
        if (data.roles) setRoles(data.roles);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!hasChanges) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = { action: "update", userId: user.UserID };
      if (roleChanged && selectedRoleId) body.roleId = selectedRoleId;
      if (statusChanged) body.isActive = selectedIsActive;

      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { message?: string; user?: UserRow };
      if (!res.ok) {
        setSaveError(data.message ?? "Failed to save changes.");
        return;
      }
      if (data.user) onUpdated(data.user);
      onClose();
    } catch {
      setSaveError("Unexpected network error.");
    } finally {
      setSaving(false);
    }
  }

  function roleBlockReason(): string | null {
    if (isSelf) return "You cannot change your own role.";
    if (user.isSystemRole) return "System-protected users cannot have their role changed.";
    if (!canEditRole) return "You don't have permission to change roles.";
    return null;
  }

  function statusBlockReason(): string | null {
    if (isSelf) return "You cannot change your own account status.";
    if (!canDeactivate) return "You don't have permission to change account status.";
    return null;
  }

  return (
    <div
      className={cn(modalOverlay, "z-[200]")}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(modalPanel, "flex max-h-[min(92dvh,44rem)] max-w-lg flex-col overflow-hidden")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="flex items-center gap-4">
            <UserClayAvatar
              seed={user.UserID}
              avatarKey={user.AvatarKey}
              size={48}
              alt={`${user.FirstName} ${user.LastName}`}
            />
            <div>
              <p className="text-base font-semibold text-foreground">
                {user.FirstName} {user.LastName}
              </p>
              <p className="text-xs text-muted-foreground">{user.Email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Member since{" "}
                {new Date(user.CreatedAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={modalCloseBtn} aria-label="Close">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto px-6 py-2">
          <div className="py-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              User Information
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">First name</dt>
                <dd className="font-medium text-foreground">{user.FirstName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last name</dt>
                <dd className="font-medium text-foreground">{user.LastName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Username</dt>
                <dd className="font-medium text-foreground">{user.Username}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="truncate font-medium text-foreground" title={user.Email}>
                  {user.Email}
                </dd>
              </div>
            </dl>
          </div>

          <div className="py-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Access Control
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
                {roleChangeBlocked ? (
                  <div>
                    <div className="inline-flex items-center rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                      {user.Role}
                      {user.isSystemRole ? (
                        <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          System
                        </span>
                      ) : null}
                    </div>
                    {roleBlockReason() ? (
                      <p className="mt-1 text-xs text-muted-foreground">{roleBlockReason()}</p>
                    ) : null}
                  </div>
                ) : (
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className={fieldInput}
                  >
                    {!selectedRoleId ? (
                      <option value="" disabled>
                        Select a role…
                      </option>
                    ) : null}
                    {roles.map((r) => (
                      <option key={r.roleId} value={r.roleId}>
                        {r.roleName}
                        {r.isSystem ? " (system)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Status</label>
                {statusChangeBlocked ? (
                  <div>
                    <div
                      className={cn(
                        "inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium",
                        user.IsActive
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-border bg-secondary text-muted-foreground",
                      )}
                    >
                      {user.IsActive ? "Active" : "Deactivated"}
                    </div>
                    {statusBlockReason() ? (
                      <p className="mt-1 text-xs text-muted-foreground">{statusBlockReason()}</p>
                    ) : null}
                  </div>
                ) : (
                  <select
                    value={selectedIsActive ? "active" : "deactivated"}
                    onChange={(e) => setSelectedIsActive(e.target.value === "active")}
                    className={fieldInput}
                  >
                    <option value="active">Active</option>
                    <option value="deactivated">Deactivated</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {saveError ? (
            <div className="py-3">
              <p className={alertError}>{saveError}</p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving || (roleChangeBlocked && statusChangeBlocked)}
            className={btnPrimary}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
