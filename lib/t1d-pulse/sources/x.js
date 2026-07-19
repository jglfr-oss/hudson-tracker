// ═══ T1D Pulse — X (Twitter) adapter ═════════════════════════════════════════
// Uses the official recent-search endpoint (v2/tweets/search/recent). Requires
// X_BEARER_TOKEN; without it the adapter reports "not_configured". Repost-only
// results are excluded via the query and a defensive filter.

import { fetchJson } from "../http.js";
import { makeItem, detectCategory, isType1Relevant } from "../normalize.js";

// Parse a v2 recent-search response ({ data, includes.users }) into normalized
// community items. Pure — testable with fixtures.
export function parseX(json, fetchedAt = Date.now()) {
  const out = [];
  const tweets = json && Array.isArray(json.data) ? json.data : [];
  const users = {};
  if (json && json.includes && Array.isArray(json.includes.users)) {
    for (const u of json.includes.users) users[u.id] = u;
  }
  for (const t of tweets) {
    // Exclude repost-only results (retweets carry referenced_tweets type
    // "retweeted" and text beginning with "RT @").
    const isRetweet =
      /^RT @/.test(t.text || "") ||
      (Array.isArray(t.referenced_tweets) && t.referenced_tweets.some((r) => r.type === "retweeted"));
    if (isRetweet) continue;
    const text = t.text || "";
    if (!isType1Relevant(text)) continue;
    const user = users[t.author_id] || {};
    const handle = user.username || "";
    const url = handle ? `https://x.com/${handle}/status/${t.id}` : `https://x.com/i/status/${t.id}`;
    const m = t.public_metrics || {};
    const item = makeItem(
      {
        type: "community",
        platform: "x",
        id: t.id,
        title: text,
        excerpt: text,
        author: user.name || (handle ? `@${handle}` : "X user"),
        source: handle ? `@${handle}` : "X",
        url,
        publishedAt: t.created_at,
        category: detectCategory(text, "community"),
        verifiedSource: false,
        engagement: {
          likes: m.like_count,
          comments: m.reply_count,
          shares: (m.retweet_count || 0) + (m.quote_count || 0),
          views: m.impression_count,
        },
      },
      fetchedAt
    );
    if (item) out.push(item);
  }
  return out;
}

export async function fetchX(fetchedAt = Date.now()) {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return { items: [], ok: false, status: "not_configured" };

  // -is:retweet excludes reposts; lang:en keeps it readable.
  const query = encodeURIComponent('("type 1 diabetes" OR T1D OR Dexcom OR Omnipod) -is:retweet lang:en');
  const url =
    `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=25` +
    `&tweet.fields=created_at,public_metrics,referenced_tweets,author_id&expansions=author_id&user.fields=name,username`;
  const json = await fetchJson(url, { headers: { Authorization: `Bearer ${token}` } });
  const items = parseX(json, fetchedAt);
  return { items, ok: true, status: items.length ? "ok" : "empty" };
}
