"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { btnSecondary } from "@/lib/ui-styles";
import { cn } from "@/lib/utils";

type AvatarOption = { key: string; url: string };

type AvatarPickerModalProps = {
  open: boolean;
  selectedKey: string | null;
  saving?: boolean;
  onClose: () => void;
  onSelect: (key: string) => void;
};

export function AvatarPickerModal({
  open,
  selectedKey,
  saving = false,
  onClose,
  onSelect,
}: AvatarPickerModalProps) {
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/auth/invite/avatars")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { avatars?: AvatarOption[] } | null) => {
        if (!cancelled && data?.avatars) setAvatarOptions(data.avatars);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-[2px]"
      role="presentation"
      onClick={() => {
        if (!saving) onClose();
      }}
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
        <p className="mt-1 text-sm text-muted-foreground">Select one of 30 workspace avatars.</p>
        <div className="mt-4 grid max-h-[min(60dvh,20rem)] grid-cols-5 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-6">
          {avatarOptions.map((avatar) => {
            const selected = selectedKey === avatar.key;
            return (
              <button
                key={avatar.key}
                type="button"
                disabled={saving}
                onClick={() => onSelect(avatar.key)}
                className={cn(
                  "aspect-square overflow-hidden rounded-full transition hover:scale-[1.03] disabled:opacity-50",
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
          <button type="button" className={btnSecondary} disabled={saving} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
