"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ModalShell } from "@/components/ui/ModalShell";
import { UserClayAvatar } from "./UserClayAvatar";
import { UserProfileModal } from "./UserProfileModal";
import {
  alertError,
  btnGhost,
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
} from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

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

type UserManagementProps = {
  initialUsers: UserRow[];
  currentUserId: string;
  canInvite: boolean;
  canEditRole: boolean;
  canDeactivate: boolean;
};

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "modified" | "created";

const PAGE_SIZE = 10;

function formatRoleLabel(roleName: string): string {
  return roleName
    .split("_")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function defaultInviteRoleId(roles: RoleOption[]): string {
  const member = roles.find((r) => r.roleName === "member");
  return member?.roleId ?? roles[0]?.roleId ?? "";
}

function fullName(user: UserRow): string {
  const name = `${user.FirstName ?? ""} ${user.LastName ?? ""}`.trim();
  return name || user.Username;
}

function formatTableDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function roleAccessBadge(roleName: string): { label: string; className: string } {
  const key = roleName.toLowerCase();
  if (key === "super_admin" || key === "admin") {
    return {
      label: formatRoleLabel(roleName),
      className: "border border-emerald-200/80 bg-emerald-50 text-emerald-800",
    };
  }
  if (key === "member") {
    return {
      label: formatRoleLabel(roleName),
      className: "border border-blue-200/80 bg-blue-50 text-blue-800",
    };
  }
  if (key === "viewer") {
    return {
      label: formatRoleLabel(roleName),
      className: "border border-violet-200/80 bg-violet-50 text-violet-800",
    };
  }
  return {
    label: formatRoleLabel(roleName),
    className: "border border-border bg-secondary text-foreground",
  };
}

type InviteSuccessDetails = {
  email: string;
  tempPassword: string;
  inviteLink: string;
};

type InviteApiResponse = {
  message?: string;
  user?: UserRow;
  tempPassword?: string;
  temporaryPassword?: string;
  inviteLink?: string;
  invitationCredentials?: {
    email?: string;
    temporaryPassword?: string;
  };
};

function parseInviteSuccess(
  data: InviteApiResponse,
  formEmail: string,
): InviteSuccessDetails | undefined {
  const tempPassword =
    data.tempPassword ??
    data.temporaryPassword ??
    data.invitationCredentials?.temporaryPassword;
  const inviteLink = data.inviteLink?.trim() ?? "";

  if (!tempPassword) return undefined;

  return {
    email:
      data.user?.Email ??
      data.invitationCredentials?.email ??
      formEmail.trim().toLowerCase(),
    tempPassword,
    inviteLink,
  };
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

function InviteSuccessModal({
  open,
  details,
  onDone,
}: {
  open: boolean;
  details: InviteSuccessDetails | null;
  onDone: () => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setCopiedKey(null);
  }, [open]);

  if (!open || !details) return null;

  const allText = `DVJ ERP Invite
Link: ${details.inviteLink}
Email: ${details.email}
Temp Password: ${details.tempPassword}
Link expires in 7 days.`;

  async function handleCopy(key: string, value: string) {
    await copyText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  }

  function copyButton(key: string, value: string, label: string) {
    return (
      <button
        type="button"
        onClick={() => void handleCopy(key, value)}
        className={cn(btnSecondary, "shrink-0 gap-1.5 px-3 py-2 text-xs")}
        aria-label={`Copy ${label}`}
      >
        <Copy className="size-3.5" aria-hidden />
        {copiedKey === key ? "Copied" : "Copy"}
      </button>
    );
  }

  return (
    <ModalShell
      title="✅ User Created Successfully"
      subtitle="Share these details with the user:"
      onClose={onDone}
      zIndex="z-[110]"
      footer={
        <button type="button" onClick={onDone} className={btnPrimary}>
          Done
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className={fieldLabel}>Invite Link</p>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              value={details.inviteLink}
              className={cn(fieldInput, "min-w-0 flex-1 font-mono text-xs")}
            />
            {copyButton("link", details.inviteLink, "invite link")}
          </div>
        </div>
        <div>
          <p className={fieldLabel}>Email</p>
          <div className="mt-1 flex gap-2">
            <input readOnly value={details.email} className={cn(fieldInput, "min-w-0 flex-1")} />
            {copyButton("email", details.email, "email")}
          </div>
        </div>
        <div>
          <p className={fieldLabel}>Temp Password</p>
          <div className="mt-1 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                readOnly
                type={showPassword ? "text" : "password"}
                value={details.tempPassword}
                className={cn(fieldInput, "pr-10 font-mono")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" aria-hidden />
                ) : (
                  <Eye className="size-4" aria-hidden />
                )}
              </button>
            </div>
            {copyButton("password", details.tempPassword, "temporary password")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy("all", allText)}
          className={cn(btnSecondary, "w-full gap-2")}
        >
          <Copy className="size-4" aria-hidden />
          {copiedKey === "all" ? "Copied All" : "Copy All"}
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          This password will not be shown again. Invite link expires in 7 days.
        </p>
      </div>
    </ModalShell>
  );
}

function InviteUserModal({
  open,
  onClose,
  roleOptions,
  rolesLoading,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  roleOptions: RoleOption[];
  rolesLoading: boolean;
  onInvited: (result: {
    message: string;
    user?: UserRow;
    inviteSuccess?: InviteSuccessDetails;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    setRoleId((current) => current || defaultInviteRoleId(roleOptions));
  }, [open, roleOptions]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", email, roleId }),
      });
      const data = (await res.json()) as InviteApiResponse;
      if (!res.ok) {
        setError(data.message ?? "Failed to invite user.");
        return;
      }
      onInvited({
        message: data.message ?? "User created successfully.",
        user: data.user,
        inviteSuccess: parseInviteSuccess(data, email),
      });
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalShell
      title="Add user"
      subtitle="Send an email invitation with a role"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button
            type="submit"
            form="invite-user-form"
            disabled={sending || rolesLoading || !roleId}
            className={btnPrimary}
          >
            {sending ? "Sending…" : "Send invite"}
          </button>
        </>
      }
    >
      <form id="invite-user-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="invite-email-modal" className={fieldLabel}>
            Email
          </label>
          <input
            id="invite-email-modal"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className={fieldInput}
          />
        </div>
        <div>
          <label htmlFor="invite-role-modal" className={fieldLabel}>
            Role
          </label>
          <select
            id="invite-role-modal"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={rolesLoading || roleOptions.length === 0}
            required
            className={cn(fieldInput, "cursor-pointer")}
          >
            {rolesLoading ? (
              <option value="">Loading…</option>
            ) : (
              roleOptions.map((r) => (
                <option key={r.roleId} value={r.roleId}>
                  {formatRoleLabel(r.roleName)}
                  {r.isSystem ? " (system)" : ""}
                </option>
              ))
            )}
          </select>
        </div>
        {error ? <p className={alertError}>{error}</p> : null}
      </form>
    </ModalShell>
  );
}

export function UserManagement({
  initialUsers,
  currentUserId,
  canInvite,
  canEditRole,
  canDeactivate,
}: UserManagementProps) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [modalUser, setModalUser] = useState<UserRow | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{
    message: string;
    userId?: string;
  } | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<InviteSuccessDetails | null>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (statusFilter === "active") list = list.filter((u) => u.IsActive);
    else if (statusFilter === "inactive") list = list.filter((u) => !u.IsActive);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.Email.toLowerCase().includes(q) ||
          u.Username.toLowerCase().includes(q) ||
          fullName(u).toLowerCase().includes(q) ||
          formatRoleLabel(u.Role).toLowerCase().includes(q),
      );
    }
    const sorted = [...list].sort((a, b) => {
      const av = sortKey === "modified" ? a.ModifiedAt : a.CreatedAt;
      const bv = sortKey === "modified" ? b.ModifiedAt : b.CreatedAt;
      const cmp = new Date(av).getTime() - new Date(bv).getTime();
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [users, query, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const allOnPageSelected =
    pageUsers.length > 0 && pageUsers.every((u) => selected.has(u.UserID));

  function applyRolesFromApi(roles: RoleOption[] | undefined) {
    if (!roles?.length) return;
    setRoleOptions(roles);
  }

  async function loadUsers() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/users");
      const result = (await response.json()) as {
        users?: UserRow[];
        roles?: RoleOption[];
        message?: string;
      };
      if (!response.ok) return;
      setUsers(result.users ?? []);
      applyRolesFromApi(result.roles);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      setRolesLoading(true);
      try {
        const response = await fetch("/api/users");
        const result = (await response.json()) as { roles?: RoleOption[] };
        applyRolesFromApi(result.roles);
      } finally {
        setRolesLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!showFilters) return;
    function onDoc(e: MouseEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setShowFilters(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showFilters]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        for (const u of pageUsers) next.delete(u.UserID);
      } else {
        for (const u of pageUsers) next.add(u.UserID);
      }
      return next;
    });
  }

  function handleUserUpdated(updated: UserRow) {
    setUsers((prev) => prev.map((u) => (u.UserID === updated.UserID ? updated : u)));
    setToast({ message: `${fullName(updated)} details updated`, userId: updated.UserID });
  }

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
    return Array.from({ length: 5 }, (_, i) => start + i);
  }, [totalPages, safePage]);

  return (
    <>
      <section className="surface-card flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-border px-6 py-6 sm:px-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">User management</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Manage your team members and their account permissions here.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4 sm:px-8">
          <p className="text-sm text-foreground">
            <span className="font-medium">All users</span>{" "}
            <span className="text-muted-foreground">{filteredUsers.length}</span>
          </p>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2}
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-10 w-full rounded-lg border border-border bg-card py-0 pr-3 pl-9 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/20 focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="relative" ref={filtersRef}>
              <button
                type="button"
                onClick={() => setShowFilters((o) => !o)}
                className={btnSecondary}
              >
                <SlidersHorizontal className="size-4" strokeWidth={2} aria-hidden />
                Filters
              </button>
              {showFilters ? (
                <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-border bg-card p-2 shadow-pop">
                  <p className="px-2 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Status
                  </p>
                  {(
                    [
                      ["all", "All users"],
                      ["active", "Active"],
                      ["inactive", "Deactivated"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setStatusFilter(key);
                        setShowFilters(false);
                      }}
                      className={cn(
                        "flex w-full rounded-lg px-2 py-2 text-left text-sm transition",
                        statusFilter === key
                          ? "bg-secondary font-medium text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {canInvite ? (
              <button type="button" onClick={() => setInviteOpen(true)} className={btnPrimary}>
                <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                Add user
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[800px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="w-10 px-6 py-3 sm:px-8">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    className="size-4 rounded border-border"
                    aria-label="Select all on page"
                  />
                </th>
                <th className="px-2 py-3 text-left text-xs font-medium text-muted-foreground">
                  User name
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Access
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort("modified")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    Last active
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition",
                        sortKey === "modified" && sortDir === "asc" && "rotate-180",
                        sortKey !== "modified" && "opacity-40",
                      )}
                      aria-hidden
                    />
                  </button>
                </th>
                <th className="px-4 py-3 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort("created")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    Date added
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition",
                        sortKey === "created" && sortDir === "asc" && "rotate-180",
                        sortKey !== "created" && "opacity-40",
                      )}
                      aria-hidden
                    />
                  </button>
                </th>
                <th className="w-12 px-4 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Loader2 className="mx-auto size-7 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : pageUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                pageUsers.map((user) => {
                  const access = roleAccessBadge(user.Role);
                  const menuOpen = menuUserId === user.UserID;
                  return (
                    <tr
                      key={user.UserID}
                      className={cn(
                        "border-b border-border transition-colors hover:bg-secondary/30",
                        !user.IsActive && "opacity-60",
                      )}
                    >
                      <td className="px-6 py-4 sm:px-8">
                        <input
                          type="checkbox"
                          checked={selected.has(user.UserID)}
                          onChange={() => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(user.UserID)) next.delete(user.UserID);
                              else next.add(user.UserID);
                              return next;
                            });
                          }}
                          className="size-4 rounded border-border"
                          aria-label={`Select ${fullName(user)}`}
                        />
                      </td>
                      <td className="px-2 py-4">
                        <button
                          type="button"
                          onClick={() => setModalUser(user)}
                          className="flex min-w-0 items-center gap-3 text-left"
                        >
                          <UserClayAvatar
                            seed={user.UserID}
                            avatarKey={user.AvatarKey}
                            size={40}
                            alt={fullName(user)}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {fullName(user)}
                            </p>
                            <p className="truncate text-sm text-muted-foreground">{user.Email}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              access.className,
                            )}
                          >
                            {access.label}
                          </span>
                          {!user.IsActive ? (
                            <span className="inline-flex rounded-md border border-border bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                              Deactivated
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                        {formatTableDate(user.ModifiedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                        {formatTableDate(user.CreatedAt)}
                      </td>
                      <td className="relative px-4 py-4">
                        <button
                          type="button"
                          onClick={() => setMenuUserId(menuOpen ? null : user.UserID)}
                          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                          aria-label="Actions"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                        {menuOpen ? (
                          <div className="absolute right-4 z-20 mt-1 w-36 rounded-lg border border-border bg-card py-1 shadow-pop">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                              onClick={() => {
                                setMenuUserId(null);
                                setModalUser(user);
                              }}
                            >
                              View profile
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <nav
            className="flex items-center justify-center gap-1 border-t border-border py-5"
            aria-label="Pagination"
          >
            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg text-sm font-medium transition",
                  n === safePage
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60",
                )}
              >
                {n}
              </button>
            ))}
          </nav>
        ) : null}
      </section>

      {toast ? (
        <div
          className="fixed bottom-6 right-6 z-[100] flex max-w-md items-start gap-3 rounded-xl bg-foreground px-4 py-3.5 text-background shadow-pop"
          role="status"
        >
          <Check className="mt-0.5 size-5 shrink-0 text-emerald-400" strokeWidth={2.5} aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p>{toast.message}</p>
          </div>
          {toast.userId ? (
            <button
              type="button"
              className="shrink-0 text-sm font-medium underline-offset-2 hover:underline"
              onClick={() => {
                const u = users.find((x) => x.UserID === toast.userId);
                if (u) setModalUser(u);
                setToast(null);
              }}
            >
              View profile
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setToast(null)}
            className="shrink-0 opacity-70 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}

      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleOptions={roleOptions}
        rolesLoading={rolesLoading}
        onInvited={({ message, user, inviteSuccess: success }) => {
          setInviteOpen(false);
          if (success) {
            setInviteSuccess(success);
          } else {
            setToast({ message, userId: user?.UserID });
          }
          if (user) setUsers((prev) => [user, ...prev]);
          else void loadUsers();
        }}
      />

      <InviteSuccessModal
        open={inviteSuccess !== null}
        details={inviteSuccess}
        onDone={() => setInviteSuccess(null)}
      />

      {modalUser ? (
        <UserProfileModal
          user={modalUser}
          currentUserId={currentUserId}
          canEditRole={canEditRole}
          canDeactivate={canDeactivate}
          onClose={() => setModalUser(null)}
          onUpdated={(updated) => {
            handleUserUpdated(updated);
            setModalUser(null);
          }}
        />
      ) : null}
    </>
  );
}
