import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export default function ForgotPasswordResetPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-10 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          Forgot Password
        </p>
        <h1 className="mt-4 font-serif text-3xl text-slate-900">
          Set new password
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Create a new password for your account and sign in again.
        </p>

        <div className="mt-8">
          <ResetPasswordForm
            endpoint="/api/auth/reset-password"
            submitLabel="Save Password"
            loadingLabel="Saving..."
            successRedirect="/login"
          />
        </div>

        <Link
          href="/login"
          className="mt-8 inline-flex h-11 items-center rounded-xl border border-slate-200 px-6 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
        >
          Back to Login
        </Link>
      </section>
    </main>
  );
}
