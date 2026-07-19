import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNewArticles, MAX_ALERTS_PER_RUN, SEEN_CAP } from "../../lib/t1d-pulse/alerts.js";

const NOW = Date.parse("2026-07-19T12:00:00Z");
const hoursAgo = (h) => NOW - h * 3_600_000;
const item = (id, publishedAt) => ({ id, title: `Article ${id}`, source: "Src", publishedAt });

test("first run seeds the seen-set and sends nothing", () => {
  const news = [item("a", hoursAgo(1)), item("b", hoursAgo(2))];
  const out = pickNewArticles(news, null, NOW);
  assert.equal(out.firstRun, true);
  assert.deepEqual(out.fresh, []);
  assert.deepEqual(out.seen, ["a", "b"]);
});

test("new recent articles are picked, newest first; already-seen are not", () => {
  const news = [item("a", hoursAgo(5)), item("new1", hoursAgo(3)), item("new2", hoursAgo(1))];
  const out = pickNewArticles(news, ["a"], NOW);
  assert.equal(out.firstRun, false);
  assert.deepEqual(out.fresh.map((i) => i.id), ["new2", "new1"]);
  assert.deepEqual([...out.seen].sort(), ["a", "new1", "new2"]);
});

test("no new articles → nothing to send", () => {
  const news = [item("a", hoursAgo(1))];
  const out = pickNewArticles(news, ["a"], NOW);
  assert.deepEqual(out.fresh, []);
});

test("alerts are capped per run but every unseen id is still recorded", () => {
  const news = Array.from({ length: 6 }, (_, i) => item(`n${i}`, hoursAgo(i + 1)));
  const out = pickNewArticles(news, [], NOW);
  assert.equal(out.fresh.length, MAX_ALERTS_PER_RUN);
  assert.equal(out.seen.length, 6); // all recorded — skipped ones never alert later
});

test("articles older than the alert window are recorded but not alerted", () => {
  const news = [item("old", hoursAgo(72)), item("fresh", hoursAgo(2)), item("undated", null)];
  const out = pickNewArticles(news, [], NOW);
  assert.deepEqual(out.fresh.map((i) => i.id), ["fresh"]);
  assert.deepEqual([...out.seen].sort(), ["fresh", "old", "undated"]);
});

test("seen list is trimmed to the cap, keeping the newest entries", () => {
  const seen = Array.from({ length: SEEN_CAP }, (_, i) => `old${i}`);
  const out = pickNewArticles([item("brand-new", hoursAgo(1))], seen, NOW);
  assert.equal(out.seen.length, SEEN_CAP);
  assert.ok(out.seen.includes("brand-new"));
  assert.ok(!out.seen.includes("old0")); // oldest entry dropped
});

test("items without ids are ignored safely", () => {
  const out = pickNewArticles([{ title: "no id" }, null, item("ok", hoursAgo(1))], [], NOW);
  assert.deepEqual(out.fresh.map((i) => i.id), ["ok"]);
});
