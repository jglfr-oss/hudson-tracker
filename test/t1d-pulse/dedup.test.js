import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupe } from "../../lib/t1d-pulse/scoring.js";

test("dedupe collapses same canonical URL", () => {
  const items = [
    { id: "a", platform: "rss", title: "Story One", url: "https://www.example.com/x?utm_source=a", _rank: 0.5 },
    { id: "b", platform: "rss", title: "Story One Different Wording Entirely Here", url: "https://example.com/x", _rank: 0.9 },
  ];
  const out = dedupe(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b"); // higher rank kept
});

test("dedupe collapses same platform post id", () => {
  const items = [
    { id: "123", platform: "x", title: "Post A", url: "https://x.com/u/status/123", _rank: 0.2 },
    { id: "123", platform: "x", title: "Post A copy", url: "https://x.com/u/status/123", _rank: 0.8 },
  ];
  const out = dedupe(items);
  assert.equal(out.length, 1);
  assert.equal(out[0]._rank, 0.8);
});

test("dedupe collapses identical normalized titles across publishers", () => {
  const items = [
    { id: "1", platform: "rss", title: "New CGM Approved!", url: "https://pub1.com/a", _rank: 0.4, verifiedSource: false },
    { id: "2", platform: "rss", title: "new cgm approved", url: "https://pub2.com/b", _rank: 0.4, verifiedSource: true },
  ];
  const out = dedupe(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].verifiedSource, true); // tie broken toward verified
});

test("dedupe collapses strongly-similar headlines (syndication)", () => {
  const items = [
    { id: "1", platform: "rss", title: "FDA approves new insulin pump for children with type 1 diabetes", url: "https://a.com/1", _rank: 0.6 },
    { id: "2", platform: "rss", title: "FDA approves new insulin pump for children with type 1 diabetes today", url: "https://b.com/2", _rank: 0.3 },
  ];
  const out = dedupe(items);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "1");
});

test("dedupe keeps genuinely distinct items", () => {
  const items = [
    { id: "1", platform: "rss", title: "Dexcom launches G7 sensor", url: "https://a.com/1", _rank: 0.6 },
    { id: "2", platform: "reddit", title: "My first week on Omnipod 5", url: "https://reddit.com/2", _rank: 0.5 },
  ];
  const out = dedupe(items);
  assert.equal(out.length, 2);
});
