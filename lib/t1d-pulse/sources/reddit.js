// ═══ T1D Pulse — Reddit adapter ══════════════════════════════════════════════
// Uses Reddit's official OAuth API (client-credentials "application only" auth).
// Enabled ONLY when REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and
// REDDIT_USER_AGENT are all set. No unauthenticated scraping fallback.

import { REDDIT_SUBREDDITS } from "../config.js";
import { fetchJson, fetchWithTimeout } from "../http.js";
import { makeItem, detectCategory, isType1Relevant } from "../normalize.js";

// Parse a subreddit listing ({ data: { children: [{ data }] } }) into
// normalized community items. Pure — testable with fixtures.
export function parseReddit(json, fetchedAt = Date.now()) {
  const out = [];
  const children = json && json.data && Array.isArray(json.data.children) ? json.data.children : [];
  for (const c of children) {
    const p = c.data;
    if (!p || p.stickied) continue;
    const text = `${p.title || ""} ${p.selftext || ""}`;
    if (!isType1Relevant(text)) continue;
    // Reddit thumbnails are sometimes "self"/"default"/"nsfw" placeholders.
    const thumb = typeof p.thumbnail === "string" && /^https?:\/\//.test(p.thumbnail) ? p.thumbnail : "";
    const item = makeItem(
      {
        type: "community",
        platform: "reddit",
        id: p.id,
        title: p.title,
        excerpt: p.selftext || "",
        author: p.author ? `u/${p.author}` : "Reddit user",
        source: p.subreddit_name_prefixed || (p.subreddit ? `r/${p.subreddit}` : "Reddit"),
        url: p.permalink ? `https://www.reddit.com${p.permalink}` : p.url,
        imageUrl: thumb,
        publishedAt: typeof p.created_utc === "number" ? p.created_utc * 1000 : null,
        category: detectCategory(text, "community"),
        verifiedSource: false,
        engagement: {
          likes: p.score,
          comments: p.num_comments,
        },
      },
      fetchedAt
    );
    if (item) out.push(item);
  }
  return out;
}

async function getAppToken(clientId, clientSecret, userAgent) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetchWithTimeout("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: "grant_type=client_credentials",
  });
  const json = await res.json();
  return json.access_token;
}

export async function fetchReddit(fetchedAt = Date.now()) {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT;
  if (!clientId || !clientSecret || !userAgent) {
    return { items: [], ok: false, status: "not_configured" };
  }

  const token = await getAppToken(clientId, clientSecret, userAgent);
  if (!token) return { items: [], ok: false, status: "error" };

  const settled = await Promise.allSettled(
    REDDIT_SUBREDDITS.map((sub) =>
      fetchJson(`https://oauth.reddit.com/r/${sub}/hot?limit=10&raw_json=1`, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": userAgent },
      })
    )
  );

  const items = [];
  let anyOk = false;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      anyOk = true;
      items.push(...parseReddit(r.value, fetchedAt));
    }
  }
  return { items, ok: anyOk, status: anyOk ? (items.length ? "ok" : "empty") : "error" };
}
