// ═══ T1D Pulse — YouTube adapter ═════════════════════════════════════════════
// Uses the official YouTube Data API v3 (search.list + videos.list). Requires
// YOUTUBE_API_KEY; without it the adapter reports "not_configured".

import { SOCIAL_SEARCH_TERMS } from "../config.js";
import { fetchJson } from "../http.js";
import { makeItem, detectCategory, isType1Relevant } from "../normalize.js";

// Parse a videos.list response (with contentDetails/statistics/snippet) into
// normalized community items. Pure — testable with fixtures.
export function parseYouTube(json, fetchedAt = Date.now()) {
  const out = [];
  const items = json && Array.isArray(json.items) ? json.items : [];
  for (const v of items) {
    const snippet = v.snippet || {};
    const stats = v.statistics || {};
    const id = typeof v.id === "string" ? v.id : v.id && v.id.videoId;
    if (!id) continue;
    const text = `${snippet.title || ""} ${snippet.description || ""}`;
    if (!isType1Relevant(text)) continue;
    const thumb = snippet.thumbnails && (snippet.thumbnails.medium || snippet.thumbnails.default || snippet.thumbnails.high);
    const item = makeItem(
      {
        type: "community",
        platform: "youtube",
        id,
        title: snippet.title,
        excerpt: snippet.description,
        author: snippet.channelTitle,
        source: snippet.channelTitle || "YouTube",
        url: `https://www.youtube.com/watch?v=${id}`,
        imageUrl: thumb ? thumb.url : "",
        publishedAt: snippet.publishedAt,
        category: detectCategory(text, "community"),
        verifiedSource: false,
        engagement: {
          views: stats.viewCount,
          likes: stats.likeCount,
          comments: stats.commentCount,
        },
      },
      fetchedAt
    );
    if (item) out.push(item);
  }
  return out;
}

export async function fetchYouTube(fetchedAt = Date.now()) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { items: [], ok: false, status: "not_configured" };

  const q = encodeURIComponent(SOCIAL_SEARCH_TERMS.slice(0, 4).join(" | "));
  const publishedAfter = new Date(fetchedAt - 7 * 24 * 60 * 60 * 1000).toISOString();
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount` +
    `&maxResults=15&relevanceLanguage=en&q=${q}&publishedAfter=${encodeURIComponent(publishedAfter)}&key=${key}`;
  const search = await fetchJson(searchUrl);
  const ids = (search.items || []).map((i) => i.id && i.id.videoId).filter(Boolean);
  if (ids.length === 0) return { items: [], ok: true, status: "empty" };

  const videosUrl =
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids.join(",")}&key=${key}`;
  const videos = await fetchJson(videosUrl);
  return { items: parseYouTube(videos, fetchedAt), ok: true, status: "ok" };
}
