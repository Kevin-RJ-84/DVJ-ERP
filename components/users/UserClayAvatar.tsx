"use client";

import Image from "next/image";
import { userAvatarApiPath } from "@/lib/user-avatar";
import { profileAvatarPublicPath } from "@/lib/profile-avatar-path";
import { cn } from "@/lib/utils";

type UserClayAvatarProps = {
  /** Stable user id — deterministic DiceBear when no `avatarKey`. */
  seed: string;
  /** Selected profile image filename in `public/avtars` (e.g. `h01.png`). */
  avatarKey?: string | null;
  size?: number;
  className?: string;
  alt?: string;
};

/**
 * Profile avatar: static image from `/avtars/*` when set, else clay DiceBear SVG.
 */
export function UserClayAvatar({
  seed,
  avatarKey,
  size = 40,
  className,
  alt = "",
}: UserClayAvatarProps) {
  const px = Math.min(128, Math.max(32, size));
  const src = avatarKey?.trim()
    ? profileAvatarPublicPath(avatarKey.trim())
    : userAvatarApiPath(seed, px * 2);

  if (avatarKey?.trim()) {
    return (
      <Image
        src={src}
        alt={alt}
        width={px}
        height={px}
        className={cn("shrink-0 rounded-full bg-secondary object-cover", className)}
        unoptimized
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      className={cn("shrink-0 rounded-full bg-secondary object-cover", className)}
      loading="lazy"
      decoding="async"
    />
  );
}
