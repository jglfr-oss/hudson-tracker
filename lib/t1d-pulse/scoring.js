// ═══ T1D Pulse — trending score, news ranking, recency cutoff, dedup ═════════
// Pure functions (no network, no clock unless a `now` is passed) so they are
// fully unit-testable.

import {
  SEVEN_DAYS_MS,
  THIRTY_DAYS_MS,
} from "./config.js";
import {
  relevanceScore,
  canonicalUrl,
  normalizeTitleKey,
} from "./normalize.js";

// ── Per-platform engagement model ────────────────────────────────────────────
// Raw engagement counts are NOT comparable across platforms (a YouTube view is
// not a Bluesky like). For each platform we define:
//   • weights for each engagement type, and
//   • a `reference` value representing a "very strong" weighted engagement for
//     that platform. We normalize each post's weighted engagement against its
//     own platform reference so results combine fairly.
const PLATFORM_MODEL = {
  youtube: { weights: { views: 1, likes: 30, comments: 80, shares: 0 }, reference: 500000 },
  x: { weights: { views: 1, likes: 50, comments: 120, shares: 200 }, reference: 50000 },
  bluesky: { weights: { views: 0, likes: 40, comments: 100, shares: 150 }, reference: 3000 },
  reddit: { weights: { views: 0, likes: 30, comments: 120, shares: 0 }, reference: 8000 },
  default: { weights: { views: 1, likes: 40, comments: 100, shares: 150 }, reference: 10000 },
};

// Recency half-life for the trending decay (hours). A post loses half its
// recency weight every ~36 hours.
const RECENCY_HALF_LIFE_HOURS = 36;

// Blend of engagement vs recency in the final trending score.
const W_ENGAGEMENT = 0.6;
const W_RECENCY = 0.4;

// Recency factor in (0,1]: exp(-ageHours / halfLifeScaled). Uses exponential
// decay so newer posts are preferred and very old posts approach 0.
//   factor = 0.5 ^ (ageHours / RECENCY_HALF_LIFE_HOURS)
export function recencyFactor(publishedAt, now = Date.now(), halfLifeHours = RECENCY_HALF_LIFE_HOURS) {
  if (!publishedAt) return 0.1; // unknown date → small but non-zero
  const ageHours = Math.max(0, (now - publishedAt) / 3_600_000);
  return Math.pow(0.5, ageHours / halfLifeHours);
}

// Weighted, log-scaled, platform-normalized engagement in [0,1].
//
// Formula (documented for transparency):
//   weighted   = Σ (count_i * weight_i)     // per-platform weights
//   scaled     = log10(1 + weighted)         // logarithmic scaling so a single
//                                            // viral post can't dwarf everything
//   normalized = scaled / log10(1 + reference)  // 0..1 vs a platform-strong post
//
// Missing counts are treated as 0. Log scaling is why one viral result does not
// overwhelm every other item.
export function engagementScore(item) {
  const platform = item.platform || "default";
  const model = PLATFORM_MODEL[platform] || PLATFORM_MODEL.default;
  const e = item.engagement || {};
  const weighted =
    (e.views || 0) * model.weights.views +
    (e.likes || 0) * model.weights.likes +
    (e.comments || 0) * model.weights.comments +
    (e.shares || 0) * model.weights.shares;
  const scaled = Math.log10(1 + Math.max(0, weighted));
  const denom = Math.log10(1 + model.reference);
  return denom > 0 ? Math.min(1, scaled / denom) : 0;
}

// Transparent trending score for community/social posts in [0,1].
//   score = W_ENGAGEMENT * engagementScore + W_RECENCY * recencyFactor
export function trendingScore(item, now = Date.now()) {
  const eng = engagementScore(item);
  const rec = recencyFactor(item.publishedAt, now);
  return W_ENGAGEMENT * eng + W_RECENCY * rec;
}

// News ranking score in [0,1]. Ranks primarily by:
//   1. Relevance to Type 1 diabetes
//   2. Source credibility
//   3. Recency
// Weighted so relevance dominates, then credibility, then recency.
export function newsScore(item, now = Date.now()) {
  const relevance = relevanceScore(`${item.title || ""} ${item.excerpt || ""}`);
  const credibility = typeof item.credibility === "number" ? item.credibility : (item.verifiedSource ? 0.6 : 0.3);
  const rec = recencyFactor(item.publishedAt, now, 96); // slower decay for news (4-day half-life)
  return 0.5 * relevance + 0.3 * credibility + 0.2 * rec;
}

// Reject items older than 30 days — UNLESS that would leave nothing, in which
// case keep the newest available. Also drops items with no date only when
// dated items exist. Returns a new array (does not mutate input).
export function applyRecencyCutoff(items, now = Date.now()) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const withinPreferred = items.filter((i) => i.publishedAt && now - i.publishedAt <= SEVEN_DAYS_MS);
  const within30 = items.filter((i) => i.publishedAt && now - i.publishedAt <= THIRTY_DAYS_MS);

  if (withinPreferred.length > 0) {
    // Prefer the 7-day window but include up-to-30-day items so tabs aren't thin.
    return within30;
  }
  if (within30.length > 0) return within30;

  // Nothing within 30 days: fall back to the newest available so the tab isn't
  // empty (spec: reject >30d "unless no newer content exists").
  const dated = items.filter((i) => i.publishedAt);
  if (dated.length > 0) {
    return dated.sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 10);
  }
  return items; // no dates at all — return as-is rather than dropping everything
}

// Token-set Jaccard similarity of two titles in [0,1].
export function titleSimilarity(a, b) {
  const ta = new Set(normalizeTitleKey(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeTitleKey(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

// Deduplicate items by canonical URL, platform post id, exact normalized title,
// and strongly-similar headline text (Jaccard ≥ threshold). When two items
// collide, keep the one with the higher `_rank` (caller-provided), else the
// more-engaged / newer one. Prevents the same article syndicated by several
// publishers from appearing more than once.
export function dedupe(items, { similarityThreshold = 0.82 } = {}) {
  const kept = [];
  const byUrl = new Map();
  const byId = new Map();
  const byTitle = new Map();

  const better = (a, b) => {
    if ((a._rank ?? 0) !== (b._rank ?? 0)) return (a._rank ?? 0) > (b._rank ?? 0) ? a : b;
    if (a.verifiedSource !== b.verifiedSource) return a.verifiedSource ? a : b;
    return (a.publishedAt || 0) >= (b.publishedAt || 0) ? a : b;
  };

  const replaceInKept = (oldItem, newItem) => {
    const idx = kept.indexOf(oldItem);
    if (idx !== -1) kept[idx] = newItem;
  };

  for (const item of items) {
    if (!item) continue;
    const cu = canonicalUrl(item.url);
    const idKey = item.platform && item.id ? `${item.platform}:${item.id}` : null;
    const titleKey = normalizeTitleKey(item.title);

    // Exact URL / id / title collisions.
    let existing = (cu && byUrl.get(cu)) || (idKey && byId.get(idKey)) || (titleKey && byTitle.get(titleKey));

    // Fuzzy title collision against already-kept items.
    if (!existing && titleKey) {
      for (const k of kept) {
        if (titleSimilarity(k.title, item.title) >= similarityThreshold) {
          existing = k;
          break;
        }
      }
    }

    if (existing) {
      const winner = better(existing, item);
      if (winner !== existing) {
        replaceInKept(existing, winner);
        // Re-point index maps to the winner.
        if (cu) byUrl.set(cu, winner);
        if (idKey) byId.set(idKey, winner);
        if (titleKey) byTitle.set(titleKey, winner);
      }
      continue;
    }

    kept.push(item);
    if (cu) byUrl.set(cu, item);
    if (idKey) byId.set(idKey, item);
    if (titleKey) byTitle.set(titleKey, item);
  }

  return kept;
}
