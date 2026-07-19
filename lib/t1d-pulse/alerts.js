// ═══ T1D Pulse — new-article alert selection ═════════════════════════════════
// Pure logic for deciding which news items deserve a push notification. The
// cron endpoint (api/t1d-pulse-news-alert.js) supplies the current news list
// and the previously-seen article ids from KV; this module decides what's new.

export const SEEN_KEY = "t1d-pulse-seen-news"; // KV: array of article ids
export const PREF_KEY = "t1d-pulse-news-alerts"; // KV: { enabled: boolean }

// At most this many pushes per cron run — a burst of syndicated coverage
// shouldn't buzz the family's phones repeatedly.
export const MAX_ALERTS_PER_RUN = 3;

// Only alert for articles published recently. Feeds sometimes surface older
// items for the first time; those are recorded as seen but not alerted.
export const MAX_ALERT_AGE_MS = 48 * 60 * 60 * 1000;

// Cap the stored seen-list so the KV value can't grow forever.
export const SEEN_CAP = 400;

// Decide which articles to alert on.
//   newsItems : normalized news items (from buildPulse().news)
//   seen      : array of previously-alerted/seen ids, or null on the first run
// Returns { firstRun, fresh, seen }:
//   firstRun : true when there was no seen-list yet — callers must NOT send
//              pushes, only store `seen` (prevents blasting every current
//              article the moment the feature is enabled/deployed)
//   fresh    : items to push, newest first, capped at MAX_ALERTS_PER_RUN
//   seen     : updated id list to store back (includes ALL current unseen ids,
//              even ones skipped for age/cap, so they never alert later)
export function pickNewArticles(newsItems, seen, now = Date.now(),
  { max = MAX_ALERTS_PER_RUN, maxAgeMs = MAX_ALERT_AGE_MS, cap = SEEN_CAP } = {}) {
  const items = (newsItems || []).filter((i) => i && i.id);

  if (!Array.isArray(seen)) {
    return { firstRun: true, fresh: [], seen: items.map((i) => i.id).slice(-cap) };
  }

  const seenSet = new Set(seen);
  const unseen = items.filter((i) => !seenSet.has(i.id));

  const fresh = unseen
    .filter((i) => i.publishedAt && now - i.publishedAt <= maxAgeMs)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, max);

  // Record every unseen id — alerted or not — so nothing alerts twice and
  // age-skipped items don't come back later.
  const merged = [...seen, ...unseen.map((i) => i.id)];

  return { firstRun: false, fresh, seen: merged.slice(-cap) };
}
