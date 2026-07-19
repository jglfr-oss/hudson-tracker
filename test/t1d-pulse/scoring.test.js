import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recencyFactor,
  engagementScore,
  trendingScore,
  newsScore,
  applyRecencyCutoff,
  titleSimilarity,
} from "../../lib/t1d-pulse/scoring.js";

const NOW = Date.parse("2026-07-19T12:00:00Z");
const hoursAgo = (h) => NOW - h * 3_600_000;
const daysAgo = (d) => NOW - d * 24 * 3_600_000;

test("recencyFactor decays with age (half-life)", () => {
  assert.equal(recencyFactor(NOW, NOW), 1);
  const f36 = recencyFactor(hoursAgo(36), NOW); // one half-life
  assert.ok(Math.abs(f36 - 0.5) < 1e-9);
  assert.ok(recencyFactor(hoursAgo(72), NOW) < f36);
  assert.equal(recencyFactor(null, NOW), 0.1);
});

test("engagementScore is log-scaled and platform-normalized to [0,1]", () => {
  const bigYt = engagementScore({ platform: "youtube", engagement: { views: 400000, likes: 10000, comments: 2000 } });
  const smallYt = engagementScore({ platform: "youtube", engagement: { views: 100, likes: 3, comments: 0 } });
  assert.ok(bigYt > smallYt);
  assert.ok(bigYt <= 1 && smallYt >= 0);

  // Log scaling: a 100x jump in raw engagement is far less than 100x in score.
  const a = engagementScore({ platform: "bluesky", engagement: { likes: 10 } });
  const b = engagementScore({ platform: "bluesky", engagement: { likes: 1000 } });
  assert.ok(b < a * 100);

  // Missing engagement → 0, never NaN.
  assert.equal(engagementScore({ platform: "x", engagement: {} }), 0);
  assert.equal(engagementScore({ platform: "x" }), 0);
});

test("trendingScore blends engagement and recency; recent beats stale at equal engagement", () => {
  const eng = { likes: 100, comments: 20, shares: 10 };
  const fresh = trendingScore({ platform: "bluesky", engagement: eng, publishedAt: hoursAgo(2) }, NOW);
  const stale = trendingScore({ platform: "bluesky", engagement: eng, publishedAt: daysAgo(20) }, NOW);
  assert.ok(fresh > stale);
  assert.ok(fresh <= 1 && stale >= 0);
});

test("trendingScore: one viral post does not dwarf a fresh modest post entirely", () => {
  const viral = trendingScore({ platform: "youtube", engagement: { views: 5_000_000, likes: 200000 }, publishedAt: daysAgo(6) }, NOW);
  const modestFresh = trendingScore({ platform: "bluesky", engagement: { likes: 40, comments: 12 }, publishedAt: hoursAgo(1) }, NOW);
  // The modest-but-fresh post remains competitive (recency floor), not ~0.
  assert.ok(modestFresh > viral * 0.4);
});

test("newsScore ranks by relevance, credibility, recency", () => {
  const strong = newsScore({ title: "type 1 diabetes CGM insulin pump trial", excerpt: "dexcom", verifiedSource: true, credibility: 1, publishedAt: hoursAgo(3) }, NOW);
  const weak = newsScore({ title: "cgm sensor", excerpt: "", verifiedSource: false, credibility: 0.3, publishedAt: daysAgo(20) }, NOW);
  assert.ok(strong > weak);
});

test("applyRecencyCutoff drops >30d but falls back when nothing newer", () => {
  const items = [
    { publishedAt: daysAgo(2) },
    { publishedAt: daysAgo(10) },
    { publishedAt: daysAgo(40) },
  ];
  const out = applyRecencyCutoff(items, NOW);
  assert.equal(out.length, 2); // the 40-day item is dropped
  assert.ok(out.every((i) => NOW - i.publishedAt <= 30 * 24 * 3_600_000));

  // All old → keep newest available rather than returning empty.
  const allOld = [{ publishedAt: daysAgo(60) }, { publishedAt: daysAgo(45) }];
  const fallback = applyRecencyCutoff(allOld, NOW);
  assert.equal(fallback.length, 2);

  assert.deepEqual(applyRecencyCutoff([], NOW), []);
});

test("titleSimilarity detects near-duplicate headlines", () => {
  assert.ok(titleSimilarity("FDA approves new insulin pump for type 1", "FDA approves new insulin pump for type 1 diabetes") > 0.8);
  assert.ok(titleSimilarity("Dexcom launches G7", "Reddit meme about pizza") < 0.2);
});
