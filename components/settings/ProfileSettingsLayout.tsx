import { Clock, KeyRound, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { ProfileIdentityCard } from "@/components/settings/ProfileIdentityCard";

export type ProfileSettingsLayoutProps = {
  userId: string;
  avatarKey: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  issuedAtLabel: string;
  expiresAtLabel: string;
  isFirstLogin: boolean;
  isAdmin: boolean;
};

function ProfileField({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">{label}</p>
      <p
        className={`mt-1.5 border-b border-stone-200/95 pb-2.5 text-[15px] font-medium text-stone-900 dark:border-stone-600/90 dark:text-stone-50 ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function GlassCard({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={`overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/75 shadow-[0_22px_55px_-22px_rgba(15,15,15,0.14)] backdrop-blur-xl ring-1 ring-stone-900/[0.03] dark:border-white/10 dark:bg-[color-mix(in_oklab,var(--glass-surface)_100%,transparent)] dark:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.45)] dark:ring-white/[0.06] ${className}`}
    >
      {children}
    </section>
  );
}

export function ProfileSettingsLayout({
  userId,
  avatarKey,
  firstName,
  lastName,
  email,
  role,
  issuedAtLabel,
  expiresAtLabel,
  isFirstLogin,
  isAdmin,
}: ProfileSettingsLayoutProps) {
  const displayFirst = firstName.trim() || "—";
  const displayLast = lastName.trim() || "—";
  const displayEmail = email.trim() || "—";
  const displayRole = role.trim() || "—";

  return (
    <div className="w-full max-w-none motion-safe:fade-rise">
      <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
        Settings <span className="text-stone-300 dark:text-stone-600">/</span> Profile
      </p>

      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8 lg:items-start">
        {/* Primary profile column */}
        <GlassCard className="lg:col-span-5">
          <ProfileIdentityCard
            userId={userId}
            initialAvatarKey={avatarKey}
            firstName={firstName}
            lastName={lastName}
          />

          <div className="space-y-6 px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
            <div className="flex flex-wrap items-start justify-between gap-3 gap-y-2">
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                My profile
              </h1>
              <div className="text-right text-[11px] leading-snug text-stone-500 dark:text-stone-400">
                <p className="font-medium text-stone-600 dark:text-stone-300">Session</p>
                <p>Issued {issuedAtLabel}</p>
                <p>Renews {expiresAtLabel}</p>
              </div>
            </div>

            <div className="grid gap-5 sm:gap-6">
              <ProfileField label="First name" value={displayFirst} />
              <ProfileField label="Last name" value={displayLast} />
              <ProfileField label="Email" value={displayEmail} />
              <ProfileField label="Role" value={displayRole} capitalize />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/70 bg-stone-50/50 px-4 py-3 dark:border-stone-700/60 dark:bg-stone-900/30">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Account access</p>
                <p className="text-xs text-stone-500 dark:text-stone-400">Role and email updates require an admin.</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200">
                <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" />
                Active
              </span>
            </div>
          </div>
        </GlassCard>

        {/* Supplementary cards */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <GlassCard>
            <div className="border-b border-stone-200/70 px-5 py-4 dark:border-stone-700/60 sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-500/12 text-violet-700 dark:text-violet-300">
                  <KeyRound className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-50">Security</h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">Password and session on this device</p>
                </div>
              </div>
            </div>
            <ul className="divide-y divide-stone-200/60 dark:divide-stone-700/60">
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Password</p>
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Set a new sign-in password for this account.</p>
                </div>
                <Link
                  href="/change-password"
                  className="shrink-0 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-orange-900/15 transition hover:brightness-[1.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 sm:px-5"
                >
                  Change password
                </Link>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-stone-400" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Session length</p>
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">You stay signed in for seven days on this device.</p>
                  </div>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  7 days
                </span>
              </li>
            </ul>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/70 px-5 py-4 dark:border-stone-700/60 sm:px-6">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-sky-500/12 text-sky-700 dark:text-sky-300">
                  <Shield className="size-[18px]" aria-hidden />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-stone-900 dark:text-stone-50">Access & workspace</h2>
                  <p className="text-xs text-stone-500 dark:text-stone-400">What you can do in DV Jewelry ERP</p>
                </div>
              </div>
              {isAdmin ? (
                <Link
                  href="/admin/users"
                  className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:brightness-[1.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
                >
                  User management
                </Link>
              ) : (
                <span className="rounded-full border border-stone-200/80 bg-stone-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-600 dark:bg-stone-900/40 dark:text-stone-400">
                  Member
                </span>
              )}
            </div>
            <ul className="divide-y divide-stone-200/60 dark:divide-stone-700/60">
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${isFirstLogin ? "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.25)]" : "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"}`}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Onboarding</p>
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400">First-login checklist from your administrator.</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    isFirstLogin
                      ? "bg-rose-500/15 text-rose-800 ring-1 ring-rose-500/25 dark:text-rose-200"
                      : "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200"
                  }`}
                >
                  {isFirstLogin ? "Action needed" : "Complete"}
                </span>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <UserRound className="size-5 shrink-0 text-violet-500" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Directory role</p>
                    <p className="truncate text-xs text-stone-500 dark:text-stone-400 capitalize">{displayRole}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-violet-500/12 px-3 py-1 text-xs font-semibold capitalize text-violet-800 ring-1 ring-violet-500/20 dark:text-violet-200">
                  {displayRole}
                </span>
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
