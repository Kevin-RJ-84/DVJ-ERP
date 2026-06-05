"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

type LogoutButtonProps = {
  className?: string;
  /** Show icon + flex layout (e.g. dark sidebar) */
  showIcon?: boolean;
};

export function LogoutButton({ className, showIcon }: LogoutButtonProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const base =
    "h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2";

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={className ?? base}
    >
      {showIcon ? (
        <span className="flex items-center justify-center gap-2">
          <LogOut className="size-4 shrink-0 opacity-90" aria-hidden />
          Logout
        </span>
      ) : (
        "Logout"
      )}
    </button>
  );
}
