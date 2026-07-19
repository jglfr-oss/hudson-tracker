import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPulse } from "../../lib/t1d-pulse/aggregate.js";

const NOW = Date.parse("2026-07-19T12:00:00Z");
const daysAgo = (d) => NOW - d * 24 * 3_600_000;

function newsItem(over = {}) {
  return {
    id: over.id || Math.random().toString(36),
    type: "news",
    platform: "rss",
    title: over.title || "Type 1 diabetes CGM breakthrough",
    excerpt: "insulin pump islet cells",
    url: over.url || `https://n.com/${Math.random()}`,
    imageUrl: null,
    publishedAt: over.publishedAt ?? daysAgo(2),
    fetchedAt: NOW,
    engagement: { views: null, likes: null, comments: null, shares: null, score: 0 },
    category: over.category || "research",
    verifiedSource: true,
    credibility: 0.9,
    ...over,
  };
}

function communityItem(over = {}) {
  return {
    id: over.id || Math.random().toString(36),
    type: "community",
    platform: over.platform || "bluesky",
    title: over.title || "My type 1 diabetes Dexcom journey",
    excerpt: "t1d life",
    url: over.url || `https://c.com/${Math.random()}`,
    imageUrl: null,
    publishedAt: over.publishedAt ?? daysAgo(1),
    fetchedAt: NOW,
    engagement: { likes: 40, comments: 10, shares: 5, views: null, score: 0 },
    category: over.category || "community",
    verifiedSource: false,
    ...over,
  };
}

test("buildPulse produces news + community and a full sourceStatus", () => {
  const out = buildPulse(
    {
      news: { items: [newsItem()], status: "ok" },
      youtube: { items: [], status: "not_configured" },
      bluesky: { items: [communityItem()], status: "ok" },
      x: { items: [], status: "not_configured" },
      reddit: { items: [], status: "error" },
    },
    NOW
  );
  assert.equal(out.news.length, 1);
  assert.equal(out.community.length, 1);
  assert.deepEqual(out.sourceStatus, {
    news: "ok",
    youtube: "not_configured",
    bluesky: "ok",
    x: "not_configured",
    reddit: "error",
  });
  assert.equal(out.generatedAt, NOW);
  assert.ok(out.cacheExpiresAt > NOW);
  // Internal fields stripped from payload.
  assert.equal(out.news[0]._rank, undefined);
  assert.equal(out.news[0].credibility, undefined);
  // Score attached.
  assert.ok(typeof out.news[0].engagement.score === "number");
});

test("buildPulse handles a totally missing result object (partial failure)", () => {
  const out = buildPulse({ news: { items: [newsItem()], status: "ok" } }, NOW);
  assert.equal(out.news.length, 1);
  assert.equal(out.community.length, 0);
  assert.equal(out.sourceStatus.bluesky, "error"); // absent → error
});

test("buildPulse drops unsafe items from output", () => {
  const out = buildPulse(
    {
      news: {
        items: [newsItem({ id: "safe" }), newsItem({ id: "bad", title: "Stop insulin and cure type 1 with cinnamon" })],
        status: "ok",
      },
    },
    NOW
  );
  assert.equal(out.news.length, 1);
  assert.equal(out.news[0].id, "safe");
});

test("buildPulse dedupes syndicated news across the merged set", () => {
  const shared = "FDA approves new automated insulin delivery system for type 1 diabetes";
  const out = buildPulse(
    {
      news: {
        items: [
          newsItem({ id: "a", title: shared, url: "https://pub1.com/a" }),
          newsItem({ id: "b", title: shared, url: "https://pub2.com/b" }),
        ],
        status: "ok",
      },
    },
    NOW
  );
  assert.equal(out.news.length, 1);
});

test("buildPulse sorts news newest-first regardless of score", () => {
  const out = buildPulse(
    {
      news: {
        items: [
          // The oldest item gets the highest credibility so score order and
          // date order disagree — date order must win in the output.
          newsItem({ id: "old", title: "Type 1 diabetes CGM story from last week", publishedAt: daysAgo(6), credibility: 1 }),
          newsItem({ id: "newest", title: "Type 1 diabetes artificial pancreas news from today", publishedAt: daysAgo(0.1), credibility: 0.3 }),
          newsItem({ id: "mid", title: "Type 1 diabetes islet research from two days ago", publishedAt: daysAgo(2), credibility: 0.5 }),
        ],
        status: "ok",
      },
    },
    NOW
  );
  assert.deepEqual(out.news.map((i) => i.id), ["newest", "mid", "old"]);
});

test("buildPulse caps each tab at the max and sorts by score", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    communityItem({ id: `c${i}`, url: `https://c.com/${i}`, title: `T1D post number ${i}`, engagement: { likes: i * 10, comments: i, shares: i, views: null, score: 0 } })
  );
  const out = buildPulse({ bluesky: { items: many, status: "ok" } }, NOW);
  assert.ok(out.community.length <= 30);
  // Sorted descending by score.
  for (let i = 1; i < out.community.length; i++) {
    assert.ok(out.community[i - 1].engagement.score >= out.community[i].engagement.score);
  }
});

test("buildPulse empty everywhere yields empty tabs, not errors", () => {
  const out = buildPulse({}, NOW);
  assert.deepEqual(out.news, []);
  assert.deepEqual(out.community, []);
  assert.equal(out.sourceStatus.news, "error");
});
