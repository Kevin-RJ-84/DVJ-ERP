/**
 * Host / origin helpers for LAN access (no hardcoded localhost in runtime checks).
 * Configure via NEXT_PUBLIC_APP_URL and optional ALLOWED_DEV_ORIGINS (comma-separated).
 */

function parseOriginHost(value: string): string[] {
  const out = new Set<string>();
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`http://${trimmed}`);
    out.add(url.hostname.toLowerCase());
    if (url.port) {
      out.add(`${url.hostname.toLowerCase()}:${url.port}`);
    }
    out.add(url.host.toLowerCase());
    out.add(url.origin.toLowerCase());
  } catch {
    out.add(trimmed.toLowerCase());
  }

  return [...out];
}

/** Public app URL (e.g. http://192.168.21.35:3000) — used for dev origin allowlist. */
export function getPublicAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return raw || null;
}

/** Origins allowed to access the Next.js dev server (next.config `allowedDevOrigins`). */
export function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "*.localhost", "127.0.0.1"]);

  const appUrl = getPublicAppUrl();
  if (appUrl) {
    for (const entry of parseOriginHost(appUrl)) {
      origins.add(entry);
    }
  }

  const extra = process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [];
  for (const part of extra) {
    for (const entry of parseOriginHost(part)) {
      origins.add(entry);
    }
  }

  return [...origins];
}

/** Compare request Origin / Host against configured app URL (optional API guard). */
export function isAllowedAppOrigin(originOrHost: string | null | undefined): boolean {
  if (!originOrHost) return true;

  const normalized = originOrHost.trim().toLowerCase();
  if (!normalized || normalized === "null") return true;

  let hostname = normalized;
  try {
    if (normalized.includes("://")) {
      hostname = new URL(normalized).hostname.toLowerCase();
    } else if (normalized.includes(":")) {
      hostname = normalized.split(":")[0] ?? normalized;
    }
  } catch {
    hostname = normalized;
  }

  const allowedHosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const entry of getAllowedDevOrigins()) {
    allowedHosts.add(entry.split(":")[0]?.toLowerCase() ?? entry.toLowerCase());
  }

  return allowedHosts.has(hostname);
}
