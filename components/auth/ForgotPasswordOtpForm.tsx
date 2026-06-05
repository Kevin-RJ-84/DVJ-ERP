"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ForgotPasswordOtpForm() {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(result.message ?? "Unable to verify OTP.");
        return;
      }

      router.push("/forgot-password/reset");
    } catch {
      setError("Unexpected network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleVerify} className="space-y-6 text-left">
      <div className="space-y-2">
        <label htmlFor="otp" className="text-sm font-medium text-slate-700">
          Enter 6-digit OTP
        </label>
        <input
          id="otp"
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          required
          value={otp}
          onChange={(event) =>
            setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="h-12 w-full rounded-xl border border-slate-200 px-4 font-mono text-lg tracking-[0.35em] text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-300"
          placeholder="123456"
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting || otp.length !== 6}
        className="h-12 w-full rounded-xl bg-slate-900 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Verifying..." : "Verify OTP"}
      </button>
    </form>
  );
}
