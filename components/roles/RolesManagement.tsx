"use client";

import { useState, useEffect, useCallback } from "react";
import { Lock, Plus, Trash2, Users } from "lucide-react";

type Permission = {
  permissionId: string;
  permissionKey: string;
  description: string;
  module: string;
};

type Role = {
  roleId: string;
  roleName: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissions: Permission[];
};

function moduleLabel(module: string) {
  return module.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (): Promise<Role[] | null> => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, permsRes] = await Promise.all([
        fetch("/api/roles"),
        fetch("/api/permissions"),
      ]);
      const [rolesData, permsData] = await Promise.all([
        rolesRes.json() as Promise<{ roles?: Role[]; message?: string }>,
        permsRes.json() as Promise<{ permissions?: Permission[]; message?: string }>,
      ]);
      if (!rolesRes.ok) throw new Error(rolesData.message ?? "Failed to load roles.");
      if (!permsRes.ok) throw new Error(permsData.message ?? "Failed to load permissions.");
      const freshRoles = rolesData.roles ?? [];
      setRoles(freshRoles);
      setAllPerms(permsData.permissions ?? []);
      return freshRoles;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  function pickRole(roleId: string, freshRoles?: Role[]) {
    const list = freshRoles ?? roles;
    const role = list.find((r) => r.roleId === roleId);
    if (!role) return;
    setSelectedRoleId(roleId);
    setCheckedPerms(new Set(role.permissions.map((p) => p.permissionId)));
    setDirty(false);
    setConfirmDeleteId(null);
  }

  const selectedRole = roles.find((r) => r.roleId === selectedRoleId) ?? null;
  const canEdit = selectedRole ? !selectedRole.isSystem : false;

  function togglePerm(permissionId: string) {
    if (!canEdit) return;
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
    setDirty(true);
  }

  async function savePermissions() {
    if (!selectedRoleId || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_permissions",
          roleId: selectedRoleId,
          permissionIds: [...checkedPerms],
        }),
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to save permissions.");
      setNotice("Permissions saved.");
      setDirty(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleName: newRoleName.trim(),
          description: newRoleDesc.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { message?: string; roleId?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to create role.");
      setNotice(`Role '${newRoleName.trim()}' created.`);
      setNewRoleName("");
      setNewRoleDesc("");
      setShowCreate(false);
      const freshRoles = await load();
      if (freshRoles && data.roleId) pickRole(data.roleId, freshRoles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(roleId: string) {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/roles?roleId=${encodeURIComponent(roleId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Failed to delete role.");
      setNotice("Role deleted.");
      setSelectedRoleId(null);
      setConfirmDeleteId(null);
      setCheckedPerms(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error.");
    } finally {
      setDeleting(false);
    }
  }

  const permsByModule = Object.entries(
    allPerms.reduce<Record<string, Permission[]>>((acc, p) => {
      (acc[p.module] ??= []).push(p);
      return acc;
    }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  if (loading && roles.length === 0) {
    return (
      <div className="w-full rounded-[1.75rem] border border-white/55 bg-white/65 p-10 text-sm text-slate-500 shadow-[0_20px_50px_-18px_rgba(15,15,15,0.08)] backdrop-blur-xl">
        Loading roles...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 backdrop-blur-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-800 backdrop-blur-sm">
          {notice}
        </div>
      ) : null}

      <div className="flex min-h-[min(720px,calc(100vh-12rem))] w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        {/* Left panel — role list */}
        <aside className="flex max-h-[min(40vh,320px)] w-full shrink-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/55 bg-white/65 shadow-[0_20px_50px_-18px_rgba(15,15,15,0.08)] backdrop-blur-xl lg:max-h-none lg:h-auto lg:w-72 xl:w-80">
          <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Roles
            </p>
            <button
              type="button"
              onClick={() => {
                setShowCreate((o) => !o);
                setError(null);
              }}
              title="Create role"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200/80 bg-white/80 text-slate-500 transition-colors duration-200 hover:border-violet-300/60 hover:text-violet-700"
            >
              <Plus className="size-3.5" aria-hidden />
            </button>
          </div>

          {showCreate ? (
            <form
              onSubmit={handleCreate}
              className="space-y-2.5 border-b border-slate-200/60 bg-slate-50/80 p-4"
            >
              <input
                type="text"
                required
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="Role name"
                className="h-9 w-full rounded-lg border border-slate-200/80 bg-white/90 px-3 text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
              />
              <input
                type="text"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
                placeholder="Description (optional)"
                className="h-9 w-full rounded-lg border border-slate-200/80 bg-white/90 px-3 text-sm text-slate-900 outline-none transition-colors duration-200 focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="h-8 flex-1 cursor-pointer rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="h-8 cursor-pointer rounded-lg border border-slate-200/80 px-3 text-xs text-slate-600 transition-colors duration-200 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <ul className="flex-1 overflow-y-auto overscroll-contain p-2 lg:min-h-0">
            {roles.map((role) => (
              <li key={role.roleId}>
                <button
                  type="button"
                  onClick={() => pickRole(role.roleId)}
                  className={[
                    "w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-200",
                    selectedRoleId === role.roleId
                      ? "bg-violet-600/10 text-stone-900"
                      : "text-stone-700 hover:bg-white/70 hover:text-stone-900",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm font-semibold">{role.roleName}</span>
                    {role.isSystem ? (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <Lock className="size-2.5" aria-hidden />
                        System
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="size-3" aria-hidden />
                    {role.userCount} user{role.userCount !== 1 ? "s" : ""}
                  </div>
                  {role.description ? (
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{role.description}</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Right panel — permission editor */}
        <div className="flex min-h-[min(520px,calc(100vh-14rem))] min-w-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-white/55 bg-white/65 shadow-[0_20px_50px_-18px_rgba(15,15,15,0.08)] backdrop-blur-xl lg:min-h-0 lg:flex-1">
          {!selectedRole ? (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400 lg:min-h-[280px]">
              Select a role to view its permissions
            </div>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/60 px-5 py-3.5 sm:px-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      {selectedRole.roleName}
                    </h2>
                    {selectedRole.isSystem ? (
                      <span className="flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        <Lock className="size-2.5" aria-hidden />
                        System — read only
                      </span>
                    ) : null}
                  </div>
                  {selectedRole.description ? (
                    <p className="mt-0.5 text-xs text-slate-500">{selectedRole.description}</p>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {canEdit && dirty ? (
                    <button
                      type="button"
                      onClick={savePermissions}
                      disabled={saving}
                      className="h-9 cursor-pointer rounded-full bg-gradient-to-r from-violet-600 to-sky-600 px-5 text-xs font-semibold text-white shadow-sm transition-colors duration-200 hover:from-violet-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? "Saving..." : "Save Permissions"}
                    </button>
                  ) : null}

                  {canEdit ? (
                    confirmDeleteId === selectedRole.roleId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">Confirm delete?</span>
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedRole.roleId)}
                          disabled={deleting}
                          className="h-8 cursor-pointer rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition-colors duration-200 hover:bg-rose-500 disabled:opacity-60"
                        >
                          {deleting ? "Deleting..." : "Yes, delete"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="h-8 cursor-pointer rounded-lg border border-slate-200/80 px-3 text-xs text-slate-600 transition-colors duration-200 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(selectedRole.roleId)}
                        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-rose-200/80 px-3 text-xs font-medium text-rose-600 transition-colors duration-200 hover:border-rose-300 hover:bg-rose-50/80"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Delete Role
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
                {permsByModule.map(([module, perms]) => (
                  <div key={module}>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      {moduleLabel(module)}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                      {perms.map((perm) => {
                        const checked = checkedPerms.has(perm.permissionId);
                        return (
                          <label
                            key={perm.permissionId}
                            className={[
                              "flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors duration-200",
                              canEdit ? "cursor-pointer" : "cursor-default",
                              checked
                                ? "border-violet-200/80 bg-violet-50/60"
                                : "border-slate-200/60 bg-white/60",
                              canEdit && !checked
                                ? "hover:border-slate-300/60 hover:bg-slate-50/60"
                                : "",
                            ].join(" ")}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePerm(perm.permissionId)}
                              disabled={!canEdit}
                              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-violet-600 disabled:cursor-default"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-800">
                                {perm.permissionKey}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                                {perm.description}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
