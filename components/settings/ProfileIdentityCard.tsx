"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarPickerModal } from "@/components/users/AvatarPickerModal";
import { UserClayAvatar } from "@/components/users/UserClayAvatar";

type ProfileIdentityCardProps = {
  userId: string;
  initialAvatarKey: string | null;
  firstName: string;
  lastName: string;
};

export function ProfileIdentityCard({
  userId,
  initialAvatarKey,
  firstName,
  lastName,
}: ProfileIdentityCardProps) {
  const router = useRouter();
  const [avatarKey, setAvatarKey] = useState(initialAvatarKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarKey(initialAvatarKey);
  }, [initialAvatarKey]);

  const displayName = `${firstName.trim()} ${lastName.trim()}`.trim() || "User";

  async function handleSelect(key: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/users/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarKey: key }),
      });
      const data = (await res.json()) as { message?: string; avatarKey?: string };
      if (!res.ok) {
        setError(data.message ?? "Could not update avatar.");
        return;
      }
      setAvatarKey(data.avatarKey ?? key);
      setPickerOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="relative isolate overflow-hidden rounded-t-[1.75rem] bg-gradient-to-br from-stone-800 via-stone-700 to-zinc-900 px-6 py-10 sm:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-12deg, transparent, transparent 2px, rgba(255,255,255,0.06) 2px, rgba(255,255,255,0.06) 3px)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center text-center">
          <div className="relative">
            <div className="size-28 overflow-hidden rounded-full shadow-[0_0_0_4px_#ffffff,0_0_28px_rgba(255,255,255,0.28)]">
              <UserClayAvatar
                seed={userId}
                avatarKey={avatarKey}
                size={112}
                alt={displayName}
                className="size-28"
              />
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={saving}
              className="absolute -right-0.5 -bottom-0.5 flex size-9 items-center justify-center rounded-full bg-white text-stone-800 shadow-[0_4px_14px_rgba(0,0,0,0.18)] transition hover:scale-[1.03] disabled:opacity-60"
              aria-label="Change avatar"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>

          <h2 className="mt-5 font-serif text-2xl font-semibold tracking-tight text-white sm:text-[1.65rem]">
            {displayName}
          </h2>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">
            Workspace identity
          </p>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-stone-900 shadow-[0_4px_22px_rgba(255,255,255,0.22)]">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
            Active session
          </span>

          {error ? (
            <p className="mt-4 max-w-xs text-xs text-rose-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>

      <AvatarPickerModal
        open={pickerOpen}
        selectedKey={avatarKey}
        saving={saving}
        onClose={() => setPickerOpen(false)}
        onSelect={(key) => void handleSelect(key)}
      />
    </>
  );
}
