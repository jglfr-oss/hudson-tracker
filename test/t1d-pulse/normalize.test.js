import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decodeEntities,
  stripHtml,
  cleanText,
  truncate,
  safeUrl,
  canonicalUrl,
  normalizeTitleKey,
  isType1Relevant,
  relevanceScore,
  detectCategory,
  toCount,
  toTimestamp,
  makeItem,
} from "../../lib/t1d-pulse/normalize.js";

test("decodeEntities handles named and numeric entities", () => {
  assert.equal(decodeEntities("A &amp; B &lt;x&gt; &#39;q&#39; &#x2764;"), "A & B <x> 'q' ❤");
});

test("stripHtml removes tags, scripts, and CDATA", () => {
  assert.equal(stripHtml("<p>Hello <b>world</b></p>"), "Hello world");
  assert.equal(stripHtml("<script>evil()</script>keep"), "keep");
  assert.equal(stripHtml("<![CDATA[cdata text]]>"), "cdata text");
});

test("cleanText strips control characters", () => {
  const withControls = "a" + String.fromCharCode(0) + "b" + String.fromCharCode(7) + "c";
  assert.equal(cleanText(withControls), "abc");
});

test("truncate cuts on a word boundary and adds ellipsis", () => {
  const out = truncate("the quick brown fox jumps over", 12);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 13);
  assert.equal(truncate("short", 100), "short");
});

test("safeUrl rejects non-http(s) and malformed URLs", () => {
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(safeUrl("http://example.com"), "http://example.com/");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<b>x</b>"), "");
  assert.equal(safeUrl("mailto:a@b.com"), "");
  assert.equal(safeUrl("/relative/path"), "");
  assert.equal(safeUrl(null), "");
});

test("canonicalUrl strips tracking params and www and trailing slash", () => {
  assert.equal(
    canonicalUrl("https://www.Example.com/story/?utm_source=x&id=5&fbclid=abc"),
    "https://example.com/story?id=5"
  );
  assert.equal(canonicalUrl("https://example.com/a/#frag"), "https://example.com/a");
});

test("normalizeTitleKey lowercases and strips punctuation", () => {
  assert.equal(normalizeTitleKey("New CGM, Approved!"), "new cgm approved");
});

test("isType1Relevant keeps T1D and excludes Type-2-only pieces", () => {
  assert.equal(isType1Relevant("New type 1 diabetes research"), true);
  assert.equal(isType1Relevant("T1D families rejoice"), true);
  // Shared term (insulin pump) but clearly a Type 2 piece → excluded
  assert.equal(isType1Relevant("Ozempic and metformin for type 2 diabetes insulin resistance"), false);
  // Unrelated
  assert.equal(isType1Relevant("A story about football"), false);
  // Mentions type 1 explicitly even alongside type 2 → kept
  assert.equal(isType1Relevant("Comparing type 1 and type 2 diabetes"), true);
});

test("relevanceScore rewards explicit type 1 mentions", () => {
  assert.ok(relevanceScore("type 1 diabetes CGM insulin pump dexcom") > relevanceScore("cgm sensor"));
  assert.ok(relevanceScore("") === 0);
});

test("detectCategory maps keywords, falls back", () => {
  assert.equal(detectCategory("new stem cell research trial"), "research");
  assert.equal(detectCategory("Dexcom G7 sensor launch"), "devices");
  assert.equal(detectCategory("closed loop algorithm update"), "technology");
  assert.equal(detectCategory("nothing relevant here", "community"), "community");
});

test("toCount and toTimestamp coerce or null out missing data", () => {
  assert.equal(toCount(5), 5);
  assert.equal(toCount("1,234"), 1234);
  assert.equal(toCount(undefined), null);
  assert.equal(toCount(-3), null);
  assert.equal(toTimestamp(1700000000000), 1700000000000);
  assert.equal(toTimestamp("2026-01-01T00:00:00Z"), Date.parse("2026-01-01T00:00:00Z"));
  assert.equal(toTimestamp(undefined), null);
  assert.equal(toTimestamp("not a date"), null);
});

test("makeItem normalizes and applies safe defaults", () => {
  const item = makeItem({
    platform: "rss",
    title: "<b>Type 1</b> breakthrough",
    excerpt: "A <i>study</i> on islet cells",
    url: "https://news.example.com/a?utm_source=x",
    imageUrl: "javascript:bad()",
    publishedAt: "2026-07-01T00:00:00Z",
    source: "Example",
    verifiedSource: true,
  }, 1000);
  assert.equal(item.title, "Type 1 breakthrough");
  assert.equal(item.excerpt, "A study on islet cells");
  assert.equal(item.imageUrl, null); // unsafe image dropped
  assert.equal(item.verifiedSource, true);
  assert.equal(item.fetchedAt, 1000);
  assert.deepEqual(item.engagement, { views: null, likes: null, comments: null, shares: null, score: 0 });
  assert.equal(item.category, "research"); // islet cells
});

test("makeItem returns null without a usable url or title", () => {
  assert.equal(makeItem({ title: "x", url: "javascript:bad()" }), null);
  assert.equal(makeItem({ title: "", url: "https://a.com" }), null);
});

test("makeItem drops the excerpt when it just echoes a community post's title", () => {
  const text = "My type 1 diabetes CGM journey so far";
  const item = makeItem({ type: "community", platform: "bluesky", title: text, excerpt: text, url: "https://bsky.app/x" });
  assert.equal(item.excerpt, "");

  // Long post: title truncated, echo-prefix excerpt also dropped.
  const long = ("type 1 diabetes update " + "word ".repeat(60)).trim();
  const longItem = makeItem({ type: "community", platform: "x", title: long, excerpt: long, url: "https://x.com/1" });
  assert.ok(longItem.title.endsWith("…"));
  assert.ok(longItem.title.length <= 181);
  assert.equal(longItem.excerpt, "");

  // A genuinely different excerpt is kept.
  const diff = makeItem({ type: "community", platform: "reddit", title: "T1D pump question", excerpt: "Does anyone rotate sites weekly?", url: "https://reddit.com/1" });
  assert.equal(diff.excerpt, "Does anyone rotate sites weekly?");
});
