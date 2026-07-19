// ═══ T1D Pulse — Bluesky adapter ═════════════════════════════════════════════
// Uses Bluesky's PUBLIC AppView search endpoint (app.bsky.feed.searchPosts),
// which requires no authentication. Works immediately without credentials.

import { fetchJson } from "../http.js";
import { makeItem, detectCategory, isType1Relevant } from "../normalize.js";

const PUBLIC_API = "https://public.api.bsky.app";

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
  const since = new Date(fetchedAt - 7 * 24 * 60 * 60 * 1000).toISOString();
  const q = encodeURIComponent("type 1 diabetes");
  const url =
    `${PUBLIC_API}/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=25&sort=top&since=${encodeURIComponent(since)}`;
  const json = await fetchJson(url);
  const items = parseBluesky(json, fetchedAt);
  return { items, ok: true, status: items.length ? "ok" : "empty" };
}
