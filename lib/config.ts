import { db } from "@/lib/db";

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000; // 60 seconds

type ConfigCache = {
  data: Record<string, string>;
  expiresAt: number;
} | null;

// Stored on globalThis so the cache survives Next.js hot-reloads in dev.
const globalForConfig = globalThis as unknown as {
  _configCache: ConfigCache;
};

/**
 * Invalidate the in-memory config cache.
 * Call this immediately after any admin update to system_config.
 */
export function invalidateConfigCache() {
  globalForConfig._configCache = null;
}

async function loadAll(): Promise<Record<string, string>> {
  const now = Date.now();
  const cached = globalForConfig._configCache;

  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const rows = await db.system_config.findMany({
    select: { ConfigKey: true, ConfigValue: true },
  });

  const data: Record<string, string> = {};
  for (const row of rows) {
    data[row.ConfigKey] = row.ConfigValue;
  }

  globalForConfig._configCache = { data, expiresAt: now + CACHE_TTL_MS };
  return data;
}

// ─── Typed getters ────────────────────────────────────────────────────────────

/**
 * Get a raw string config value by key.
 * Throws if the key does not exist in system_config.
 */
export async function getConfig(key: string): Promise<string> {
  const data = await loadAll();
  if (!(key in data)) {
    throw new Error(`Config key '${key}' not found in system_config.`);
  }
  return data[key];
}

/**
 * Get a boolean config value ("true" → true, anything else → false).
 */
export async function getConfigBool(key: string): Promise<boolean> {
  const val = await getConfig(key);
  return val.toLowerCase() === "true";
}

/**
 * Get an integer config value.
 * Throws if the stored value cannot be parsed as an integer.
 */
export async function getConfigInt(key: string): Promise<number> {
  const val = await getConfig(key);
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    throw new Error(`Config key '${key}' value '${val}' is not a valid integer.`);
  }
  return parsed;
}

/**
 * Get a decimal (float) config value.
 * Throws if the stored value cannot be parsed as a number.
 */
export async function getConfigDecimal(key: string): Promise<number> {
  const val = await getConfig(key);
  const parsed = parseFloat(val);
  if (isNaN(parsed)) {
    throw new Error(`Config key '${key}' value '${val}' is not a valid decimal.`);
  }
  return parsed;
}
