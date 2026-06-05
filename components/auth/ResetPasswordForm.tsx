"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
};

type ResetPasswordFormProps = {
  endpoint: "/api/auth/reset-password" | "/api/auth/change-password";
  submitLabel: string;
  loadingLabel: string;
  successRedirect: string;
  firstLogin?: boolean;
};

type SetupComplete = {
  username: string;
  email: string;
};

export function ResetPasswordForm({
  endpoint,
  submitLabel,
  loadingLabel,
  successRedirect,
  firstLogin = false,
}: ResetPasswordFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState<SetupComplete | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, string> = {
        password: form.password,
        confirmPassword: form.confirmPassword,
      };
      if (firstLogin) {
        payload.firstName = form.firstName.trim();
        payload.lastName = form.lastName.trim();
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        message?: string;
        redirectTo?: string;
        success?: boolean;
        username?: string;
        email?: string;
      };

      if (!response.ok) {
        setError(result.message ?? "Unable to update password.");
        return;
      }

      if (firstLogin && result.success && result.username && result.email) {
        setSetupComplete({
          username: result.username,
          email: result.email,
        });
        return;
      }

      router.push(result.redirectTo ?? successRedirect);
      router.refresh();
    } catch {
      setError("Unexpected network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (setupComplete) {
    return (
      <div className="flex flex-col gap-6 text-left">
        <p className="text-lg font-semibold text-emerald-800">✅ Account setup complete!</p>
        <p className="text-sm text-stone-600">You can log in with:</p>
        <div className="rounded-xl border border-stone-200/80 bg-white/80 px-4 py-3 text-sm text-stone-800">
          <p>
            <span className="font-medium text-stone-600">Username:</span>{" "}
            <span className="font-mono font-semibold">{setupComplete.username}</span>
          </p>
          <p className="mt-2">
            <span className="font-medium text-stone-600">or Email:</span>{" "}
            <span className="font-mono font-semibold">{setupComplete.email}</span>
          </p>
        </div>
        <Link
          href="/login"
          className="flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 text-sm font-semibold uppercase tracking-[0.15em] text-white shadow-md transition-colors duration-200 hover:from-rose-500 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 text-left">
      {firstLogin ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="firstName" className="text-sm font-medium text-slate-700">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              autoComplete="given-name"
              required
              minLength={2}
              value={form.firstName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, firstName: event.target.value }))
              }
              className="h-12 w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 text-slate-900 outline-none backdrop-blur-sm transition-colors duration-200 focus:border-rose-600/50 focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="lastName" className="text-sm font-medium text-slate-700">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              autoComplete="family-name"
              required
              minLength={2}
              value={form.lastName}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, lastName: event.target.value }))
              }
              className="h-12 w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 text-slate-900 outline-none backdrop-blur-sm transition-colors duration-200 focus:border-rose-600/50 focus:ring-2 focus:ring-rose-500/20"
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-700">
          {firstLogin ? "New password" : "New password"}
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, password: event.target.value }))
          }
          className="h-12 w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 text-slate-900 outline-none backdrop-blur-sm transition-colors duration-200 focus:border-rose-600/50 focus:ring-2 focus:ring-rose-500/20"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-slate-700"
        >
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
          }
          className="h-12 w-full rounded-xl border border-slate-200/80 bg-white/70 px-4 text-slate-900 outline-none backdrop-blur-sm transition-colors duration-200 focus:border-rose-600/50 focus:ring-2 focus:ring-rose-500/20"
        />
      </div>

      <p className="text-sm text-slate-500">
        Password must be at least 8 characters with one letter and one number.
      </p>

      {error ? (
        <p className="rounded-xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 backdrop-blur-sm">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full cursor-pointer rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 text-sm font-semibold uppercase tracking-[0.15em] text-white shadow-md transition-colors duration-200 hover:from-rose-500 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? loadingLabel : firstLogin ? "Save & Continue" : submitLabel}
      </button>
    </form>
  );
}
