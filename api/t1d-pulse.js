// ═══ api/t1d-pulse.js — T1D Pulse aggregation endpoint ═══════════════════════
// Gathers recent Type 1 diabetes news and trending community posts from several
// source adapters, normalizes/dedupes/scores them, and returns a cached payload.
//
// Resilience: every source runs under Promise.allSettled with its own timeout
// and error handling (see lib/t1d-pulse/run.js). One failing platform never
// fails the endpoint — its status is reported in `sourceStatus` instead.
//
// Security: all credentials stay server-side (read from process.env inside the
// adapters). No Hudson/glucose data is ever sent to any news or social platform.

import { CACHE_KEY, CACHE_TTL_SECONDS } from "../lib/t1d-pulse/config.js";
import { getCached, setCached } from "../lib/t1d-pulse/cache.js";
import { generatePulse } from "../lib/t1d-pulse/run.js";

export const maxDuration = 30;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Let the browser/CDN cache briefly but keep it fresh; server cache is 15 min.
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const force = req.query && (req.query.refresh === "1" || req.query.refresh === "true");

  try {
    if (!force) {
      const cached = await getCached(CACHE_KEY);
      if (cached) {
        res.setHeader("X-Cache", "HIT");
        return res.status(200).json(cached);
      }
    }

    const payload = await generatePulse(Date.now());

    // Cache the aggregate for ~15 minutes (KV with in-memory fallback).
    await setCached(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    res.setHeader("X-Cache", force ? "BYPASS" : "MISS");
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String((e && e.message) || e) });
  }
}
