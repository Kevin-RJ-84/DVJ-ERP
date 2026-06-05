"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Pencil } from "lucide-react";
import {
  alertError,
  btnPrimary,
  btnSecondary,
  fieldInput,
  fieldLabel,
} from "@/lib/ui-styles";
import { profileAvatarPublicPath } from "@/lib/profile-avatar-path";
import { cn } from "@/lib/utils";

type InviteSetupFormProps = {
  token: string;
};

type Step = "verify" | "setup" | "success";

type AvatarOption = { key: string; url: string };

function pickRandomAvatar(avatars: AvatarOption[]): string | null {
  if (avatars.length === 0) return null;
  return avatars[Math.floor(Math.random() * avatars.length)]?.key ?? null;
}

export function InviteSetupForm({ token }: InviteSetupFormProps) {
  const [step, setStep] = useState<Step>("verify");
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([]);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [showTempPassword, setShowTempPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [successUsername, setSuccessUsername] = useState("");
  const [successFirstName, setSuccessFirstName] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadInvite() {
      setLookupLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/auth/invite/lookup?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json()) as { email?: string; message?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.message ?? "Invalid or expired invite link.");
          return;
        }
        setEmail(data.email ?? "");
      } catch {
        if (!cancelled) setError("Unable to load invite. Please try again.");
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }
    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (step !== "setup") return;
    let cancelled = false;
    void fetch("/api/auth/invite/avatars")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { avatars?: AvatarOption[] } | null) => {
        if (cancelled || !data?.avatars?.length) return;
        setAvatarOptions(data.avatars);
        setSelectedAvatar((current) => current ?? pickRandomAvatar(data.avatars!));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [step]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/invite/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, tempPassword }),
      });
      const data = (await res.json()) as { message?: string; success?: boolean };
      if (!res.ok) {
        setError(data.message ?? "Invalid or expired invite link.");
        return;
      }
      setStep("setup");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/invite/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          newPassword,
          ...(selectedAvatar ? { avatarKey: selectedAvatar } : {}),
        }),
      });
      const data = (await res.json()) as {
        message?: string;
        success?: boolean;
        username?: string;
        email?: string;
      };
      if (!res.ok) {
        setError(data.message ?? "Unable to complete setup.");
        return;
      }
      setSuccessUsername(data.username ?? "");
      setSuccessFirstName(firstName.trim());
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (lookupLoading) {
    return (
      <p className="text-sm text-stone-600" role="status">
        Loading invitation…
      </p>
    );
  }

  if (error && step === "verify" && !email) {
    return <p className={alertError}>{error}</p>;
  }

  if (step === "success") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
            🎉 Welcome, {successFirstName}!
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">
            Your account is ready.
          </p>
          <p className="mt-4 text-sm text-stone-600">You can log in with:</p>
          <dl className="mt-3 space-y-2 rounded-xl border border-amber-100/60 bg-white/60 px-4 py-3 text-sm">
            <div className="flex gap-2">
              <dt className="font-medium text-stone-700">Username:</dt>
              <dd className="font-mono text-stone-900">{successUsername}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium text-stone-700">or Email:</dt>
              <dd className="text-stone-900">{email}</dd>
            </div>
          </dl>
        </div>
        <Link href="/login" className={cn(btnPrimary, "inline-flex w-full justify-center")}>
          Go to Login
        </Link>
      </div>
    );
  }

  if (step === "setup") {
    return (
      <>
        <form onSubmit={handleComplete} className="space-y-4">
          <div>
            <h1 className="font-serif text-3xl text-stone-900">Set up your account</h1>
          </div>

          <div className="flex flex-col items-center gap-2 py-2">
            <div className="relative">
              <div className="size-24 overflow-hidden rounded-full bg-stone-100 shadow-[inset_0_2px_8px_rgba(20,20,18,0.08)]">
                {selectedAvatar ? (
                  <Image
                    src={profileAvatarPublicPath(selectedAvatar)}
                    alt="Your profile avatar"
                    width={96}
                    height={96}
                    className="size-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-stone-400">
                    Avatar
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(true)}
                className="clay-raised absolute -right-0.5 -bottom-0.5 flex size-8 items-center justify-center rounded-full text-stone-700 hover:scale-[1.03] transition"
                aria-label="Change avatar"
              >
                <Pencil className="size-3.5" aria-hidden />
              </button>
            </div>
            <p className="text-xs text-stone-500">Tap the pencil to choose your avatar</p>
          </div>

          <div>
            <label htmlFor="invite-first-name" className={fieldLabel}>
              First Name
            </label>
            <input
              id="invite-first-name"
              type="text"
              required
              minLength={2}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldInput}
              autoComplete="given-name"
            />
          </div>
          <div>
            <label htmlFor="invite-last-name" className={fieldLabel}>
              Last Name
            </label>
            <input
              id="invite-last-name"
              type="text"
              required
              minLength={2}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldInput}
              autoComplete="family-name"
            />
          </div>
          <div>
            <label htmlFor="invite-new-password" className={fieldLabel}>
              New Password
            </label>
            <div className="relative">
              <input
                id="invite-new-password"
                type={showNewPassword ? "text" : "password"}
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={cn(fieldInput, "pr-10")}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="invite-confirm-password" className={fieldLabel}>
              Confirm Password
            </label>
            <input
              id="invite-confirm-password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={fieldInput}
              autoComplete="new-password"
            />
          </div>
          {error ? <p className={alertError}>{error}</p> : null}
          <button type="submit" disabled={loading} className={cn(btnPrimary, "w-full")}>
            {loading ? "Saving…" : "Complete Setup"}
          </button>
        </form>

        {avatarPickerOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setAvatarPickerOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="avatar-picker-title"
              className="surface-card max-h-[min(85dvh,28rem)] w-full max-w-md overflow-hidden p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="avatar-picker-title" className="text-lg font-semibold text-foreground">
                Choose your avatar
              </h2>
              <div className="mt-4 grid max-h-[min(60dvh,20rem)] grid-cols-5 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-6">
                {avatarOptions.map((avatar) => {
                  const selected = selectedAvatar === avatar.key;
                  return (
                    <button
                      key={avatar.key}
                      type="button"
                      onClick={() => {
                        setSelectedAvatar(avatar.key);
                        setAvatarPickerOpen(false);
                      }}
                      className={cn(
                        "aspect-square overflow-hidden rounded-full transition hover:scale-[1.03]",
                        selected ? "clay-raised ring-2 ring-foreground/20" : "hover:bg-white/40",
                      )}
                      aria-label={`Select avatar ${avatar.key}`}
                      aria-pressed={selected}
                    >
                      <Image
                        src={avatar.url}
                        alt=""
                        width={64}
                        height={64}
                        className="size-full object-cover"
                        unoptimized
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setAvatarPickerOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <div>
        <h1 className="font-serif text-3xl text-stone-900">
          You&apos;ve been invited to DVJ ERP
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">
          Verify your identity to continue
        </p>
      </div>
      <div>
        <label htmlFor="invite-email" className={fieldLabel}>
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          readOnly
          value={email}
          className={cn(fieldInput, "cursor-not-allowed bg-stone-100 text-stone-500")}
        />
      </div>
      <div>
        <label htmlFor="invite-temp-password" className={fieldLabel}>
          Temp Password
        </label>
        <div className="relative">
          <input
            id="invite-temp-password"
            type={showTempPassword ? "text" : "password"}
            required
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            className={cn(fieldInput, "pr-10")}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={() => setShowTempPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label={showTempPassword ? "Hide password" : "Show password"}
          >
            {showTempPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error ? <p className={alertError}>{error}</p> : null}
      <button
        type="submit"
        disabled={loading || !email}
        className={cn(btnPrimary, "w-full")}
      >
        {loading ? "Verifying…" : "Continue"}
      </button>
    </form>
  );
}
