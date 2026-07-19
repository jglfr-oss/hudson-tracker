// ═══ api/t1d-pulse.js — T1D Pulse aggregation endpoint ═══════════════════════
// Gathers recent Type 1 diabetes news and trending community posts from several
// source adapters, normalizes/dedupes/scores them, and returns a cached payload.
//
// Resilience: every source runs under Promise.allSettled with its own timeout
// and error handling. One failing platform never fails the endpoint — its
// status is reported in `sourceStatus` instead.
//
// Security: all credentials stay server-side (read from process.env inside the
// adapters). No Hudson/glucose data is ever sent to any news or social platform.

import { CACHE_KEY, CACHE_TTL_SECONDS } from "../lib/t1d-pulse/config.js";
import { getCached, setCached } from "../lib/t1d-pulse/cache.js";
import { buildPulse } from "../lib/t1d-pulse/aggregate.js";
import { fetchNews } from "../lib/t1d-pulse/sources/news.js";
import { fetchYouTube } from "../lib/t1d-pulse/sources/youtube.js";
import { fetchBluesky } from "../lib/t1d-pulse/sources/bluesky.js";
import { fetchX } from "../lib/t1d-pulse/sources/x.js";
import { fetchReddit } from "../lib/t1d-pulse/sources/reddit.js";

export const maxDuration = 30;

// Run one adapter, converting any thrown error into an error status so a single
// failure can never reject the whole aggregation.
async function runSource(name, fn, now) {
  try {
    const res = await fn(now);
    if (res && Array.isArray(res.items)) return res;
    return { items: [], status: "error" };
  } catch (e) {
    return { items: [], status: "error", detail: String((e && e.message) || e).slice(0, 200) };
  }
}

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

    const now = Date.now();
    const [news, youtube, bluesky, x, reddit] = await Promise.all([
      runSource("news", fetchNews, now),
      runSource("youtube", fetchYouTube, now),
      runSource("bluesky", fetchBluesky, now),
      runSource("x", fetchX, now),
      runSource("reddit", fetchReddit, now),
    ]);

    const payload = buildPulse({ news, youtube, bluesky, x, reddit }, now);

    // Cache the aggregate for ~15 minutes (KV with in-memory fallback).
    await setCached(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    res.setHeader("X-Cache", force ? "BYPASS" : "MISS");
    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String((e && e.message) || e) });
  }
}
