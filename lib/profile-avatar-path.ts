/** Public URL segment — folder is `public/avtars` (project spelling). */
export const PROFILE_AVATAR_PUBLIC_DIR = "avtars";

export function profileAvatarPublicPath(key: string): string {
  return `/${PROFILE_AVATAR_PUBLIC_DIR}/${encodeURIComponent(key.trim())}`;
}
