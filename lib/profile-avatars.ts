import fs from "fs";
import path from "path";
import { PROFILE_AVATAR_PUBLIC_DIR } from "@/lib/profile-avatar-path";

export { PROFILE_AVATAR_PUBLIC_DIR, profileAvatarPublicPath } from "@/lib/profile-avatar-path";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

let cachedKeys: string[] | null = null;

function avatarsDirPath() {
  return path.join(process.cwd(), "public", PROFILE_AVATAR_PUBLIC_DIR);
}

/** Filenames in `public/avtars` (e.g. `h01.png`). */
export function listProfileAvatarKeys(): string[] {
  if (cachedKeys) return cachedKeys;

  const dir = avatarsDirPath();
  if (!fs.existsSync(dir)) {
    cachedKeys = [];
    return cachedKeys;
  }

  cachedKeys = fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXT.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return cachedKeys;
}

export function isValidProfileAvatarKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("..")) return false;
  return listProfileAvatarKeys().includes(trimmed);
}

export function pickRandomProfileAvatarKey(): string | null {
  const keys = listProfileAvatarKeys();
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)] ?? null;
}
