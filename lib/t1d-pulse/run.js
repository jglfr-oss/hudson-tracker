// ═══ T1D Pulse — source orchestration ════════════════════════════════════════
// Runs all source adapters (each individually guarded) and builds the pulse
// payload. Shared by api/t1d-pulse.js and api/t1d-pulse-news-alert.js.

import { buildPulse } from "./aggregate.js";
import { fetchNews } from "./sources/news.js";
import { fetchYouTube } from "./sources/youtube.js";
import { fetchBluesky } from "./sources/bluesky.js";
import { fetchX } from "./sources/x.js";
import { fetchReddit } from "./sources/reddit.js";

// Run one adapter, converting any thrown error into an error status so a single
// failure can never reject the whole aggregation.
async function runSource(fn, now) {
  try {
    const res = await fn(now);
    if (res && Array.isArray(res.items)) return res;
    return { items: [], status: "error" };
  } catch (e) {
    return { items: [], status: "error", detail: String((e && e.message) || e).slice(0, 200) };
  }
}

// Fetch everything and build the full payload (news + community + sourceStatus).
export async function generatePulse(now = Date.now()) {
  const [news, youtube, bluesky, x, reddit] = await Promise.all([
    runSource(fetchNews, now),
    runSource(fetchYouTube, now),
    runSource(fetchBluesky, now),
    runSource(fetchX, now),
    runSource(fetchReddit, now),
  ]);
  return buildPulse({ news, youtube, bluesky, x, reddit }, now);
}
