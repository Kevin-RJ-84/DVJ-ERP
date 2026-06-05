import { cookies } from "next/headers";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getJwtCookieName, verifyAuthToken } from "@/lib/auth";

export default async function ChangePasswordPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getJwtCookieName())?.value;
  let isFirstLogin = false;

  if (token) {
    try {
      const payload = await verifyAuthToken(token);
      isFirstLogin = payload.isFirstLogin;
    } catch {
      isFirstLogin = false;
    }
  }

  return (
    <main className="erp-mesh-bg flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-amber-100/50 bg-[#fffdf9]/82 p-8 shadow-[0_16px_48px_-12px_rgba(69,26,3,0.2)] backdrop-blur-2xl sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
          {isFirstLogin ? "First Login Required" : "Security"}
        </p>
        <h1 className="mt-4 font-serif text-3xl text-stone-900">
          {isFirstLogin ? "Complete your account setup" : "Set your permanent password"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">
          {isFirstLogin
            ? "Enter your name and choose a permanent password. You will receive your login username when finished."
            : "You must change your temporary password before accessing the ERP dashboard."}
        </p>
        <div className="mt-8">
          <ResetPasswordForm
            endpoint="/api/auth/change-password"
            submitLabel="Set Password"
            loadingLabel="Saving..."
            successRedirect="/dashboard"
            firstLogin={isFirstLogin}
          />
        </div>
      </section>
    </main>
  );
}
