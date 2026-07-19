// ═══ T1D Pulse — Bluesky adapter ═════════════════════════════════════════════
// searchPosts on the public AppView used to work unauthenticated, but Bluesky
// now returns 403 for anonymous search. We authenticate with an app password
// (bsky.app → Settings → App Passwords) and call the authenticated AppView.
//
// Env: BLUESKY_IDENTIFIER (handle, e.g. you.bsky.social) + BLUESKY_APP_PASSWORD

import { fetchJson } from "../http.js";
import { makeItem, detectCategory, isType1Relevant } from "../normalize.js";

const PUBLIC_API = "https://public.api.bsky.app";
const AUTH_API   = "https://api.bsky.app";
const PDS        = "https://bsky.social";

// Access tokens last ~2h; cache in module scope so repeated calls in one
// warm lambda don't re-authenticate.
let session = null; // { jwt, expires }

async function getAccessJwt() {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password   = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !password) return null;

  if (session && session.expires > Date.now() + 60000) return session.jwt;

  const json = await fetchJson(`${PDS}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  if (!json || !json.accessJwt) return null;
  session = { jwt: json.accessJwt, expires: Date.now() + 90 * 60 * 1000 };
  return session.jwt;
}

// Parse a searchPosts response into normalized community items. Pure — testable.
export function parseBluesky(json, fetchedAt = Date.now()) {
  const out = [];
  const posts = json && Array.isArray(json.posts) ? json.posts : [];
  for (const p of posts) {
    const record = p.record || {};
    const text = record.text || "";
    if (!isType1Relevant(text)) continue;
    // Skip pure reposts (no original text). searchPosts returns original posts,
    // but guard anyway.
    if (!text.trim()) continue;
    const author = p.author || {};
    const handle = author.handle || "";
    const rkey = typeof p.uri === "string" ? p.uri.split("/").pop() : "";
    const url = handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : "";
    // Thumbnail from an image embed, if present.
    let imageUrl = "";
    const embed = p.embed || {};
    if (embed.images && embed.images[0]) imageUrl = embed.images[0].thumb || "";
    else if (embed.external && embed.external.thumb) imageUrl = embed.external.thumb;

    const item = makeItem(
      {
        type: "community",
        platform: "bluesky",
        id: p.cid || p.uri,
        title: text,
        excerpt: text,
        author: author.displayName || (handle ? `@${handle}` : "Bluesky user"),
        source: handle ? `@${handle}` : "Bluesky",
        url,
        imageUrl,
        publishedAt: record.createdAt || p.indexedAt,
        category: detectCategory(text, "community"),
        verifiedSource: false,
        engagement: {
          likes: p.likeCount,
          comments: p.replyCount,
          shares: p.repostCount,
        },
      },
      fetchedAt
    );
    if (item) out.push(item);
  }
  return out;
}

export async function fetchBluesky(fetchedAt = Date.now()) {
  const jwt = await getAccessJwt();
  if (!jwt) return { items: [], ok: false, status: "not_configured" };

  const since = new Date(fetchedAt - 7 * 24 * 60 * 60 * 1000).toISOString();
  const q = encodeURIComponent("type 1 diabetes");
  const url =
    `${AUTH_API}/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=25&sort=top&since=${encodeURIComponent(since)}`;

  let json;
  try {
    json = await fetchJson(url, { headers: { Authorization: `Bearer ${jwt}` } });
  } catch (e) {
    // A stale cached token yields 401 — drop it and retry once.
    session = null;
    const retryJwt = await getAccessJwt();
    if (!retryJwt) throw e;
    json = await fetchJson(url, { headers: { Authorization: `Bearer ${retryJwt}` } });
  }

  const items = parseBluesky(json, fetchedAt);
  return { items, ok: true, status: items.length ? "ok" : "empty" };
}
