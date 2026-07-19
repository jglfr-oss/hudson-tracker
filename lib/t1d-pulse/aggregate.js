// ═══ T1D Pulse — aggregation pipeline ════════════════════════════════════════
// Pure: given already-fetched per-source results, produce the final API payload
// (news[], community[], sourceStatus). No network here so it is fully testable.

import { MAX_ITEMS_PER_TAB, CACHE_TTL_SECONDS } from "./config.js";
import { filterUnsafe } from "./safety.js";
import {
  applyRecencyCutoff,
  dedupe,
  trendingScore,
  newsScore,
} from "./scoring.js";

// Prepare one tab's list: drop unsafe items, apply recency cutoff, score, rank,
// dedupe (keeping the higher-ranked of any collision), sort by score, and cap.
function buildList(items, scorer, now, limit = MAX_ITEMS_PER_TAB) {
  const { safe } = filterUnsafe(items);
  const recent = applyRecencyCutoff(safe, now);

  // Attach score + a dedupe rank so the strongest of any duplicate survives.
  for (const it of recent) {
    const score = scorer(it, now);
    it.engagement = it.engagement || {};
    it.engagement.score = Math.round(score * 1000) / 1000;
    it._rank = score;
  }

  const deduped = dedupe(recent);
  deduped.sort((a, b) => (b._rank ?? 0) - (a._rank ?? 0));

  // Drop the internal fields from the public payload.
  return deduped.slice(0, limit).map(({ _rank, credibility, ...rest }) => rest);
}

// results: { news, youtube, bluesky, x, reddit } where each is
// { items: [], status: "ok"|"empty"|"error"|"not_configured" }.
export function buildPulse(results, now = Date.now()) {
  const r = results || {};
  const get = (k) => (r[k] && Array.isArray(r[k].items) ? r[k].items : []);
  const statusOf = (k) => (r[k] && r[k].status ? r[k].status : "error");

  const newsItems = get("news");
  const communityItems = [
    ...get("youtube"),
    ...get("bluesky"),
    ...get("x"),
    ...get("reddit"),
  ];

  const news = buildList(newsItems, newsScore, now);
  const community = buildList(communityItems, trendingScore, now);

  const sourceStatus = {
    news: statusOf("news"),
    youtube: statusOf("youtube"),
    bluesky: statusOf("bluesky"),
    x: statusOf("x"),
    reddit: statusOf("reddit"),
  };

  return {
    generatedAt: now,
    cacheExpiresAt: now + CACHE_TTL_SECONDS * 1000,
    news,
    community,
    sourceStatus,
  };
}
