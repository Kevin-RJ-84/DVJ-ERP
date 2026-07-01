"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { alertError, fieldInput, fieldLabel } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

type LoginState = {
  email: string;
  password: string;
};

type LoginFormProps = {
  /** `glass`: pill fields + compact actions for frosted login panel */
  variant?: "default" | "glass" | "erpGlass" | "dashboard";
};

export function LoginForm({ variant = "default" }: LoginFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<LoginState>({ email: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const result = (await response.json()) as {
        message?: string;
        redirectTo?: string;
      };

      if (!response.ok) {
        setError(result.message ?? "Unable to login. Please try again.");
        return;
      }

      router.push(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Unexpected network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (variant === "glass") {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="space-y-2">
          <label htmlFor="email" className="sr-only">
            Work Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            className="h-12 w-full rounded-full border border-white/25 bg-slate-950/35 px-5 text-base text-white outline-none backdrop-blur-md transition placeholder:text-slate-400 focus:border-white/50 focus:ring-2 focus:ring-white/20"
            placeholder="Work email"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              className="h-12 w-full rounded-full border border-white/25 bg-slate-950/35 pl-5 pr-12 text-base text-white outline-none backdrop-blur-md transition placeholder:text-slate-400 focus:border-white/50 focus:ring-2 focus:ring-white/20"
              placeholder="Password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-rose-300/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-100 backdrop-blur-sm">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 min-w-[7.5rem] cursor-pointer rounded-full border border-rose-300/35 bg-gradient-to-r from-rose-500/90 to-orange-500/90 px-8 text-sm font-semibold uppercase tracking-[0.12em] text-white shadow-lg shadow-rose-950/25 backdrop-blur-md transition-colors duration-200 hover:from-rose-400 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-rose-300/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "…" : "Login"}
          </button>
        </div>
      </form>
    );
  }

  if (variant === "dashboard") {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={fieldLabel}>
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            className={cn(fieldInput, "clay-inset mt-2 h-11 rounded-full border-transparent bg-background px-4")}
            placeholder="you@dvjewelrycorp.com"
          />
        </div>

        <div>
          <label htmlFor="password" className={fieldLabel}>
            Password
          </label>
          <div className="relative mt-2">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              className={cn(fieldInput, "clay-inset h-11 rounded-full border-transparent bg-background pl-4 pr-11")}
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? <p className={alertError}>{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="clay-cta mt-1 flex h-11 w-full cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    );
  }

  if (variant === "erpGlass") {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Work email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
            className="h-11 w-full rounded-xl border border-slate-300/30 bg-slate-900/55 px-4 text-sm text-slate-50 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-sky-300/55 focus:ring-2 focus:ring-sky-300/25"
            placeholder="operations@dvjewelrycorp.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
              className="h-11 w-full rounded-xl border border-slate-300/30 bg-slate-900/55 pl-4 pr-11 text-sm text-slate-50 outline-none transition-colors duration-200 placeholder:text-slate-400 focus:border-sky-300/55 focus:ring-2 focus:ring-sky-300/25"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-300/35 bg-rose-950/40 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 h-11 w-full cursor-pointer rounded-xl border border-amber-200/25 bg-gradient-to-r from-amber-500/92 to-sky-500/85 text-sm font-semibold uppercase tracking-[0.14em] text-white shadow-[0_10px_28px_-16px_rgba(2,6,23,0.7)] transition-colors duration-200 hover:from-amber-400 hover:to-sky-400 focus:outline-none focus:ring-2 focus:ring-amber-300/45 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-sm font-medium tracking-wide text-slate-700"
        >
          Work Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, email: event.target.value }))
          }
          className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
          placeholder="you@company.com"
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-sm font-medium tracking-wide text-slate-700"
        >
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={form.password}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, password: event.target.value }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-11 text-base text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
            placeholder="Enter your password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-800"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full cursor-pointer rounded-xl bg-gradient-to-r from-rose-600 to-orange-600 text-sm font-semibold uppercase tracking-[0.15em] text-white shadow-md transition-colors duration-200 hover:from-rose-500 hover:to-orange-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </button>
    </form>
  );
}
