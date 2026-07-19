import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "../../lib/t1d-pulse/feed.js";
import { normalizeFeedRecords, parsePubmed, parseNewsApi } from "../../lib/t1d-pulse/sources/news.js";
import { parseYouTube } from "../../lib/t1d-pulse/sources/youtube.js";
import { parseBluesky } from "../../lib/t1d-pulse/sources/bluesky.js";
import { parseX } from "../../lib/t1d-pulse/sources/x.js";
import { parseReddit } from "../../lib/t1d-pulse/sources/reddit.js";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item>
    <title><![CDATA[New insulin pump for type 1 diabetes approved]]></title>
    <link>https://news.example.com/pump?utm_source=rss</link>
    <description>The FDA cleared a new automated insulin delivery system.</description>
    <pubDate>Tue, 15 Jul 2026 10:00:00 GMT</pubDate>
    <dc:creator>Jane Reporter</dc:creator>
    <enclosure url="https://img.example.com/p.jpg" type="image/jpeg"/>
  </item>
  <item>
    <title>A story about type 2 diabetes and metformin</title>
    <link>https://news.example.com/t2</link>
    <description>Only about type 2.</description>
    <pubDate>Tue, 15 Jul 2026 10:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Dexcom CGM update for T1D users</title>
    <link rel="alternate" href="https://atom.example.com/dexcom"/>
    <published>2026-07-16T09:00:00Z</published>
    <summary>New features for continuous glucose monitoring.</summary>
    <author><name>Atom Author</name></author>
  </entry>
</feed>`;

test("parseFeed parses RSS items", () => {
  const recs = parseFeed(RSS);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].title, "New insulin pump for type 1 diabetes approved");
  assert.equal(recs[0].url, "https://news.example.com/pump?utm_source=rss");
  assert.equal(recs[0].author, "Jane Reporter");
  assert.equal(recs[0].imageUrl, "https://img.example.com/p.jpg");
});

test("parseFeed parses Atom entries", () => {
  const recs = parseFeed(ATOM);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].url, "https://atom.example.com/dexcom");
  assert.equal(recs[0].author, "Atom Author");
});

test("parseFeed returns [] for garbage", () => {
  assert.deepEqual(parseFeed("not xml"), []);
  assert.deepEqual(parseFeed(null), []);
});

test("normalizeFeedRecords keeps T1D items and excludes type-2-only", () => {
  const meta = { source: "Example", platform: "rss", verifiedSource: true, credibility: 0.7, defaultCategory: "devices" };
  const items = normalizeFeedRecords(parseFeed(RSS), meta, 1000);
  assert.equal(items.length, 1); // type 2 item excluded
  assert.equal(items[0].source, "Example");
  assert.equal(items[0].verifiedSource, true);
  assert.equal(items[0].credibility, 0.7);
  assert.equal(items[0].type, "news");
});

test("parsePubmed normalizes esummary payloads", () => {
  const json = {
    result: {
      uids: ["111", "222"],
      "111": { title: "Type 1 diabetes islet transplant study", fulljournalname: "Diabetes Care", sortpubdate: "2026/07/10", authors: [{ name: "A. Author" }] },
      "222": { title: "Unrelated cardiology paper", fulljournalname: "Cardio J", sortpubdate: "2026/07/09" },
    },
  };
  const items = parsePubmed(json, 1000);
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "pubmed");
  assert.equal(items[0].verifiedSource, true);
  assert.equal(items[0].url, "https://pubmed.ncbi.nlm.nih.gov/111/");
  assert.equal(items[0].credibility, 0.9);
});

test("parseNewsApi normalizes and filters", () => {
  const json = {
    articles: [
      { title: "CGM helps type 1 diabetes kids", description: "study", url: "https://n.com/a", publishedAt: "2026-07-15T00:00:00Z", source: { name: "Reuters" }, urlToImage: "https://n.com/i.jpg" },
      { title: "Type 2 diabetes and diet", description: "metformin", url: "https://n.com/b", publishedAt: "2026-07-15T00:00:00Z", source: { name: "X" } },
    ],
  };
  const items = parseNewsApi(json, 1000);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Reuters");
});

test("parseYouTube normalizes videos.list with statistics", () => {
  const json = {
    items: [
      {
        id: "vid123",
        snippet: { title: "My type 1 diabetes Dexcom review", description: "T1D life", channelTitle: "T1D Creator", publishedAt: "2026-07-17T00:00:00Z", thumbnails: { medium: { url: "https://i.ytimg.com/x.jpg" } } },
        statistics: { viewCount: "15000", likeCount: "800", commentCount: "42" },
      },
      { id: "vid999", snippet: { title: "cooking pasta", description: "food", channelTitle: "Chef" }, statistics: {} },
    ],
  };
  const items = parseYouTube(json, 1000);
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "youtube");
  assert.equal(items[0].engagement.views, 15000);
  assert.equal(items[0].engagement.likes, 800);
  assert.equal(items[0].url, "https://www.youtube.com/watch?v=vid123");
  assert.equal(items[0].imageUrl, "https://i.ytimg.com/x.jpg");
});

test("parseBluesky normalizes searchPosts with engagement", () => {
  const json = {
    posts: [
      {
        uri: "at://did:plc:abc/app.bsky.feed.post/rkey1",
        cid: "cid1",
        author: { handle: "mom.bsky.social", displayName: "T1D Mom" },
        record: { text: "Hudson's first week on Omnipod 5 with type 1 diabetes!", createdAt: "2026-07-18T00:00:00Z" },
        likeCount: 34, replyCount: 5, repostCount: 8,
      },
      { uri: "at://x/y/z", cid: "c2", author: { handle: "a.b" }, record: { text: "unrelated football post" }, likeCount: 1 },
    ],
  };
  const items = parseBluesky(json, 1000);
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "bluesky");
  assert.equal(items[0].engagement.likes, 34);
  assert.equal(items[0].engagement.shares, 8);
  assert.equal(items[0].url, "https://bsky.app/profile/mom.bsky.social/post/rkey1");
});

test("parseX normalizes and excludes retweets", () => {
  const json = {
    data: [
      { id: "1", text: "Loving my new CGM for type 1 diabetes management", author_id: "u1", created_at: "2026-07-18T00:00:00Z", public_metrics: { like_count: 50, reply_count: 4, retweet_count: 6, quote_count: 2, impression_count: 9000 } },
      { id: "2", text: "RT @someone: type 1 diabetes news", author_id: "u1", created_at: "2026-07-18T00:00:00Z", public_metrics: {}, referenced_tweets: [{ type: "retweeted", id: "9" }] },
    ],
    includes: { users: [{ id: "u1", username: "t1dparent", name: "T1D Parent" }] },
  };
  const items = parseX(json, 1000);
  assert.equal(items.length, 1); // retweet excluded
  assert.equal(items[0].engagement.likes, 50);
  assert.equal(items[0].engagement.shares, 8); // retweet + quote
  assert.equal(items[0].url, "https://x.com/t1dparent/status/1");
});

test("parseReddit normalizes listings and skips stickied + irrelevant", () => {
  const json = {
    data: {
      children: [
        { data: { id: "p1", title: "Newly diagnosed type 1 diabetes — tips?", selftext: "help", author: "user1", subreddit_name_prefixed: "r/diabetes_t1", permalink: "/r/diabetes_t1/comments/p1/x", score: 120, num_comments: 45, created_utc: 1752800000, thumbnail: "self" } },
        { data: { id: "p2", title: "Pinned rules", stickied: true, author: "mod", subreddit: "diabetes_t1", score: 5, num_comments: 0, created_utc: 1752800000 } },
        { data: { id: "p3", title: "random meme", selftext: "", author: "u", subreddit: "funny", score: 3, num_comments: 1, created_utc: 1752800000 } },
      ],
    },
  };
  const items = parseReddit(json, 1000);
  assert.equal(items.length, 1);
  assert.equal(items[0].platform, "reddit");
  assert.equal(items[0].engagement.likes, 120);
  assert.equal(items[0].engagement.comments, 45);
  assert.equal(items[0].url, "https://www.reddit.com/r/diabetes_t1/comments/p1/x");
  assert.equal(items[0].imageUrl, null); // "self" placeholder dropped
});
