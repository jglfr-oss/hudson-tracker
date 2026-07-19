// ═══ T1D Pulse — minimal RSS/Atom parser ═════════════════════════════════════
// A dependency-free, defensive parser for well-formed RSS 2.0 and Atom feeds.
// We only extract the fields we need and never execute or render raw markup —
// downstream code strips any residual HTML. Pure/string-based so it is unit-
// testable with fixtures.

import { stripHtml } from "./normalize.js";

// Pull the inner text of the first <tag>…</tag> within `xml` (namespace-aware
// via optional prefix). Returns "" if absent.
function firstTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : "";
}

// Pull an attribute value from the first matching self-closing/opening tag.
function firstAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(xml);
  return m ? (m[1] ?? m[2] ?? "") : "";
}

// Extract all blocks between <tag> and </tag>.
function blocks(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function stripCdata(s) {
  return String(s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/i, "$1");
}

// Parse an Atom <entry> block into a raw record.
function parseAtomEntry(entry) {
  const title = stripCdata(firstTag(entry, "title"));
  // Prefer rel="alternate" link href; else first <link href>.
  let link = "";
  const altRe = /<link\b[^>]*rel\s*=\s*["']alternate["'][^>]*href\s*=\s*["']([^"']+)["']/i;
  const altM = altRe.exec(entry);
  if (altM) link = altM[1];
  if (!link) link = firstAttr(entry, "link", "href");
  const published = firstTag(entry, "published") || firstTag(entry, "updated");
  const summary = stripCdata(firstTag(entry, "summary") || firstTag(entry, "content"));
  const author = stripHtml(firstTag(firstTag(entry, "author"), "name"));
  return {
    title: stripHtml(title),
    url: link.trim(),
    publishedAt: published.trim(),
    description: summary,
    author: author || null,
    imageUrl: firstAttr(entry, "media:thumbnail", "url") || firstAttr(entry, "media:content", "url") || "",
  };
}

// Parse an RSS <item> block into a raw record.
function parseRssItem(item) {
  const title = stripCdata(firstTag(item, "title"));
  const link = stripCdata(firstTag(item, "link")).trim();
  const pubDate = firstTag(item, "pubDate") || firstTag(item, "dc:date");
  const description = stripCdata(firstTag(item, "description") || firstTag(item, "content:encoded"));
  const author = stripHtml(firstTag(item, "dc:creator") || firstTag(item, "author"));
  const image =
    firstAttr(item, "media:thumbnail", "url") ||
    firstAttr(item, "media:content", "url") ||
    firstAttr(item, "enclosure", "url");
  return {
    title: stripHtml(title),
    url: link,
    publishedAt: pubDate.trim(),
    description,
    author: author || null,
    imageUrl: image || "",
  };
}

// Parse a feed (RSS or Atom) into an array of raw records. Never throws — a
// malformed feed yields [].
export function parseFeed(xml) {
  if (!xml || typeof xml !== "string") return [];
  try {
    const isAtom = /<feed\b[^>]*xmlns\s*=\s*["'][^"']*atom/i.test(xml) || /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
    if (isAtom) {
      return blocks(xml, "entry").map(parseAtomEntry).filter((r) => r.url && r.title);
    }
    return blocks(xml, "item").map(parseRssItem).filter((r) => r.url && r.title);
  } catch {
    return [];
  }
}
