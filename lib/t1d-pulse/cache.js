// ═══ T1D Pulse — cache with KV + in-memory fallback ══════════════════════════
// Uses the repo's existing Vercel KV setup when available. If KV is not
// configured (e.g. local dev) or a call fails, transparently falls back to a
// process-local in-memory cache. Never throws.

let kvClient = null;
let kvLoadAttempted = false;

async function getKv() {
  if (kvLoadAttempted) return kvClient;
  kvLoadAttempted = true;
  // KV only works when its env vars are present; importing is cheap but calls
  // will throw without configuration, so we guard every call below.
  const hasKvEnv =
    process.env.KV_REST_API_URL ||
    process.env.KV_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  if (!hasKvEnv) {
    kvClient = null;
    return null;
  }
  try {
    const mod = await import("@vercel/kv");
    kvClient = mod.kv;
  } catch {
    kvClient = null;
  }
  return kvClient;
}

// Module-scoped in-memory store (per lambda instance / dev process).
const memory = new Map(); // key -> { value, expiresAt }

// Get a cached value or null (also null when expired). ttl is enforced by the
// stored expiresAt for the memory path and by KV's native TTL for the KV path.
export async function getCached(key) {
  const kv = await getKv();
  if (kv) {
    try {
      const v = await kv.get(key);
      if (v !== null && v !== undefined) return v;
    } catch {
      // fall through to memory
    }
  }
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (hit) memory.delete(key);
  return null;
}

// Store a value with a TTL (seconds). Writes to KV when available and always
// mirrors to memory as a resilience layer.
export async function setCached(key, value, ttlSeconds) {
  const kv = await getKv();
  if (kv) {
    try {
      await kv.set(key, value, { ex: ttlSeconds });
    } catch {
      // ignore — memory still holds it
    }
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// Test/helper: clear the in-memory cache.
export function _clearMemory() {
  memory.clear();
}
