import { createHash } from "crypto";

import { db } from "@/lib/db";

/**
 * TTL cache over the ApiCache table — the app's substitute for a vector
 * store. Raw merged API results are cached against a hash of the normalized
 * query so repeat searches skip the external APIs entirely.
 */

export function makeCacheKey(parts: Record<string, unknown>): string {
  const normalized = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash("sha256").update(normalized).digest("hex");
}

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const entry = await db.apiCache.findUnique({ where: { cacheKey } });
  if (!entry) return null;
  if (entry.expiresAt < new Date()) {
    // Expired — delete lazily and treat as a miss.
    await db.apiCache.delete({ where: { cacheKey } }).catch(() => {});
    return null;
  }
  try {
    return JSON.parse(entry.payload) as T;
  } catch {
    return null;
  }
}

export async function setCached(
  cacheKey: string,
  source: string,
  payload: unknown,
  ttlHours: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const data = {
    cacheKey,
    source,
    payload: JSON.stringify(payload),
    expiresAt,
  };
  await db.apiCache
    .upsert({ where: { cacheKey }, create: data, update: data })
    .catch((error) => {
      // Caching must never break a search.
      console.error("Failed to write ApiCache entry:", error);
    });
}
