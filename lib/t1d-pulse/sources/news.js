// ═══ T1D Pulse — News adapter ════════════════════════════════════════════════
// Aggregates several always-available news sources (curated RSS/Atom feeds,
// Google News topic queries, PubMed E-utilities) plus an OPTIONAL commercial
// provider gated on T1D_NEWS_API_KEY. Every sub-source is individually guarded;
// one failing feed never fails the adapter.
//
// Pure parse/normalize helpers are exported for fixture-based tests; the network
// orchestrator `fetchNews` is the runtime entry point.

import { NEWS_FEEDS } from "../config.js";
import { fetchText, fetchJson } from "../http.js";
import { parseFeed } from "../feed.js";
import { makeItem, isType1Relevant, detectCategory } from "../normalize.js";

// Turn raw feed records (from parseFeed) into normalized, Type-1-relevant items.
// Pure — testable with fixtures.
export function normalizeFeedRecords(records, feedMeta, fetchedAt = Date.now()) {
  const out = [];
  for (const r of records || []) {
    const text = `${r.title || ""} ${r.description || ""}`;
    if (!isType1Relevant(text)) continue;
    const item = makeItem(
      {
        type: "news",
        platform: feedMeta.platform || "rss",
        title: r.title,
        excerpt: r.description,
        author: r.author,
        source: feedMeta.source,
        url: r.url,
        imageUrl: r.imageUrl,
        publishedAt: r.publishedAt,
        category: detectCategory(text, feedMeta.defaultCategory || "treatment"),
        verifiedSource: feedMeta.verifiedSource !== false,
      },
      fetchedAt
    );
    if (item) {
      item.credibility = feedMeta.credibility ?? 0.5;
      out.push(item);
    }
  }
  return out;
}

// Parse a PubMed esummary JSON payload into normalized items. Pure — testable.
export function parsePubmed(json, fetchedAt = Date.now()) {
  const out = [];
  const result = json && json.result;
  if (!result || !Array.isArray(result.uids)) return out;
  for (const uid of result.uids) {
    const rec = result[uid];
    if (!rec) continue;
    const title = rec.title || "";
    const journal = rec.fulljournalname || rec.source || "PubMed";
    const text = `${title} ${journal}`;
    if (!isType1Relevant(text)) continue;
    const item = makeItem(
      {
        type: "news",
        platform: "pubmed",
        title,
        excerpt: journal ? `Published in ${journal}.` : "",
        author: Array.isArray(rec.authors) && rec.authors[0] ? rec.authors[0].name : null,
        source: "PubMed",
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        publishedAt: rec.sortpubdate || rec.pubdate || rec.epubdate,
        category: detectCategory(text, "research"),
        verifiedSource: true,
      },
      fetchedAt
    );
    if (item) {
      item.credibility = 0.9;
      out.push(item);
    }
  }
  return out;
}

// Parse a NewsAPI /v2/everything payload into normalized items. Pure — testable.
export function parseNewsApi(json, fetchedAt = Date.now()) {
  const out = [];
  const articles = json && Array.isArray(json.articles) ? json.articles : [];
  for (const a of articles) {
    const text = `${a.title || ""} ${a.description || ""}`;
    if (!isType1Relevant(text)) continue;
    const item = makeItem(
      {
        type: "news",
        platform: "newsapi",
        title: a.title,
        excerpt: a.description,
        author: a.author,
        source: a.source && a.source.name ? a.source.name : "News",
        url: a.url,
        imageUrl: a.urlToImage,
        publishedAt: a.publishedAt,
        category: detectCategory(text, "treatment"),
        verifiedSource: true,
      },
      fetchedAt
    );
    if (item) {
      item.credibility = 0.6;
      out.push(item);
    }
  }
  return out;
}

function googleNewsUrl(query) {
  const q = encodeURIComponent(`${query} when:14d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

async function fetchOneFeed(feed, fetchedAt) {
  const url = feed.url || (feed.platform === "googlenews" ? googleNewsUrl(feed.query) : null);
  if (!url) return [];
  const xml = await fetchText(url);
  return normalizeFeedRecords(parseFeed(xml), feed, fetchedAt);
}

async function fetchPubmed(fetchedAt) {
  // E-utilities: no API key required (rate-limited). Search recent T1D articles,
  // then summarize. Encoded query, restricted to last 30 days, humans.
  const term = encodeURIComponent('"diabetes mellitus, type 1"[MeSH] AND (english[lang])');
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=15&sort=date&datetype=pdat&reldate=30&term=${term}`;
  const search = await fetchJson(searchUrl);
  const ids = search && search.esearchresult && Array.isArray(search.esearchresult.idlist)
    ? search.esearchresult.idlist
    : [];
  if (ids.length === 0) return [];
  const sumUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`;
  const summary = await fetchJson(sumUrl);
  return parsePubmed(summary, fetchedAt);
}

async function fetchNewsApi(fetchedAt) {
  const key = process.env.T1D_NEWS_API_KEY;
  if (!key) return [];
  const q = encodeURIComponent('"type 1 diabetes" OR "insulin pump" OR "artificial pancreas"');
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=20`;
  const json = await fetchJson(url, { headers: { "X-Api-Key": key } });
  return parseNewsApi(json, fetchedAt);
}

// Runtime entry point. Returns { items, ok, detail }. `ok` is true if at least
// one sub-source returned successfully.
export async function fetchNews(fetchedAt = Date.now()) {
  const tasks = [
    ...NEWS_FEEDS.map((feed) => () => fetchOneFeed(feed, fetchedAt)),
    () => fetchPubmed(fetchedAt),
    () => fetchNewsApi(fetchedAt),
  ];

  const settled = await Promise.allSettled(tasks.map((t) => t()));
  const items = [];
  let anyOk = false;
  let anyData = false;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      anyOk = true;
      if (r.value && r.value.length) anyData = true;
      items.push(...(r.value || []));
    }
  }
  return {
    items,
    ok: anyOk,
    status: !anyOk ? "error" : anyData ? "ok" : "empty",
  };
}
