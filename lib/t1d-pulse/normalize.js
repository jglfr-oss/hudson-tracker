// ═══ T1D Pulse — normalization & sanitization ════════════════════════════════
// Turns raw source payloads into the common item shape and safely sanitizes all
// externally supplied text. No network calls here — everything is pure so it can
// be unit-tested with fixtures.
//
// Common normalized item shape:
// {
//   id, type, platform, title, excerpt, author, source, url, imageUrl,
//   publishedAt, fetchedAt,
//   engagement: { views, likes, comments, shares, score },
//   category, verifiedSource
// }

import {
  T1D_KEYWORDS,
  T2D_KEYWORDS,
  CATEGORY_KEYWORDS,
} from "./config.js";

const NAMED_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
  "&hellip;": "…",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

// Decode the small set of HTML entities that appear in feed text, including
// numeric (&#123; / &#x1F600;) forms.
export function decodeEntities(input) {
  if (!input) return "";
  let out = String(input);
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)));
  out = out.replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)));
  out = out.replace(/&[a-zA-Z]+;/g, (m) => NAMED_ENTITIES[m] ?? m);
  return out;
}

function safeFromCodePoint(cp) {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try {
    return String.fromCodePoint(cp);
  } catch {
    return "";
  }
}

// Remove all HTML tags and collapse whitespace. We never render raw feed HTML,
// so tags are stripped to plain text before display.
export function stripHtml(input) {
  if (!input) return "";
  let text = String(input);
  // Drop script/style blocks entirely.
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Strip CDATA wrappers.
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Remove tags.
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  // Collapse whitespace.
  return text.replace(/\s+/g, " ").trim();
}

// Full cleaning pass for any externally supplied text: strip tags, decode
// entities, drop ASCII control chars, collapse whitespace.
export function cleanText(input) {
  const stripped = stripHtml(input);
  // Drop ASCII control characters (code points < 0x20 and 0x7F) via a
  // code-point loop to avoid embedding literal control bytes in source.
  let out = "";
  for (const ch of stripped) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) continue;
    out += ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

// Truncate to a max length on a word boundary, adding an ellipsis. Safe on
// undefined/empty input.
export function truncate(input, max = 240) {
  const text = cleanText(input);
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.replace(/[\s.,;:!?-]+$/, "") + "…";
}

// Only permit http/https URLs. Returns "" for anything else (javascript:,
// data:, mailto:, relative, malformed).
export function safeUrl(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  let u;
  try {
    u = new URL(trimmed);
  } catch {
    return "";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "";
  return u.toString();
}

// Canonicalize a URL for deduplication: lowercase host, strip tracking params,
// drop trailing slash and fragment. Returns "" if not a valid http(s) URL.
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|cmpid$|oc$)/i;
export function canonicalUrl(input) {
  const safe = safeUrl(input);
  if (!safe) return "";
  try {
    const u = new URL(safe);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.hash = "";
    // Strip a trailing slash from the path (but keep root "/") so
    // ".../story/" and ".../story" canonicalize the same, even with a query.
    if (u.pathname !== "/") u.pathname = u.pathname.replace(/\/+$/, "");
    const keep = [];
    for (const [k, v] of u.searchParams.entries()) {
      if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
    }
    u.search = "";
    keep.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [k, v] of keep) u.searchParams.append(k, v);
    let out = u.toString();
    out = out.replace(/\/$/, "");
    return out;
  } catch {
    return safe;
  }
}

// A normalized key for title-based dedup: lowercase, strip punctuation and
// extra whitespace.
export function normalizeTitleKey(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Does the text look materially about Type 1 diabetes? True when a T1D keyword
// is present. If the text is about Type 2 and never mentions Type 1, exclude it.
export function isType1Relevant(text) {
  const t = String(text || "").toLowerCase();
  // An explicit "type 1" / "t1d" mention always qualifies, even alongside a
  // Type 2 comparison.
  if (/\btype\s*1\b|\bt1d\b/.test(t)) return true;
  // Otherwise require a T1D-associated keyword (device/therapy term).
  const hasT1 = T1D_KEYWORDS.some((k) => t.includes(k));
  if (!hasT1) return false;
  // Matched only on a shared term — reject if it is clearly a Type 2 piece.
  const hasT2 = T2D_KEYWORDS.some((k) => t.includes(k));
  return !hasT2;
}

// Relevance score in [0,1] based on how many distinct T1D keywords appear.
export function relevanceScore(text) {
  const t = String(text || "").toLowerCase();
  let hits = 0;
  for (const k of T1D_KEYWORDS) if (t.includes(k)) hits++;
  // Strong signal for explicit "type 1".
  const explicit = /type\s*1\b|t1d/.test(t) ? 1 : 0;
  const raw = hits + explicit * 2;
  return Math.min(1, raw / 6);
}

// Pick a category from text, falling back to a provided default (or "treatment").
export function detectCategory(text, fallback = "treatment") {
  const t = String(text || "").toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => t.includes(w))) return cat;
  }
  return fallback;
}

// Coerce a value to a non-negative integer or null (for missing engagement).
export function toCount(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Coerce a value to a millisecond timestamp, or null.
export function toTimestamp(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? ms : null;
}

// Build a normalized item, sanitizing all text and URLs and applying safe
// defaults. Returns null if there is no usable URL or title.
export function makeItem(raw, fetchedAt = Date.now()) {
  const url = safeUrl(raw.url);
  const type = raw.type === "community" ? "community" : "news";
  // Community "titles" are the post text itself — keep them card-sized.
  const title = truncate(raw.title, type === "community" ? 180 : 300);
  if (!url || !title) return null;

  let excerpt = truncate(raw.excerpt ?? raw.description ?? "", 280);
  // Social posts often supply the same text as both title and excerpt; drop the
  // echo so cards don't show the post twice.
  if (excerpt && (excerpt === title || excerpt.startsWith(title.replace(/…$/, "")))) {
    excerpt = "";
  }

  const engagement = raw.engagement || {};
  const text = `${raw.title || ""} ${raw.excerpt || raw.description || ""}`;

  return {
    id: String(raw.id || `${raw.platform || "src"}:${canonicalUrl(url) || url}`),
    type,
    platform: String(raw.platform || "unknown"),
    title,
    excerpt,
    author: cleanText(raw.author || "").slice(0, 120) || null,
    source: cleanText(raw.source || "").slice(0, 120) || (raw.platform || "unknown"),
    url,
    imageUrl: safeUrl(raw.imageUrl) || null,
    publishedAt: toTimestamp(raw.publishedAt),
    fetchedAt,
    engagement: {
      views: toCount(engagement.views),
      likes: toCount(engagement.likes),
      comments: toCount(engagement.comments),
      shares: toCount(engagement.shares),
      score: typeof engagement.score === "number" ? engagement.score : 0,
    },
    category: raw.category || detectCategory(text, type === "community" ? "community" : "treatment"),
    verifiedSource: raw.verifiedSource === true,
  };
}
