// api/store-status.js
// Read-only diagnostic: how much BG data is in KV, how far back it goes,
// how big the stored value is, and readings per month.
// Returns counts only — never the full array.
import { kv } from "@vercel/kv";

const KEY = "hudson-bg-history";

// One formatter, reused. Building an Intl formatter per reading is slow
// enough to blow the function timeout on a large store.
const DAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});
const FULL_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit",
});

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const data = (await kv.get(KEY)) ?? [];

    if (!Array.isArray(data)) {
      return res.status(200).json({ problem: "stored value is not an array", type: typeof data });
    }
    if (data.length === 0) {
      return res.status(200).json({ count: 0, note: "store is empty" });
    }

    // Single pass: min/max, per-day set, per-month tally. No sorting, no copies.
    let min = Infinity, max = -Infinity, malformed = 0;
    const days = new Set();
    const byMonth = {};

    for (const r of data) {
      if (!r || typeof r.ts !== "number") { malformed++; continue; }
      if (r.ts < min) min = r.ts;
      if (r.ts > max) max = r.ts;
      const key = DAY_FMT.format(new Date(r.ts)); // MM/DD/YYYY
      days.add(key);
      const mk = key.slice(6) + "-" + key.slice(0, 2); // YYYY-MM
      byMonth[mk] = (byMonth[mk] || 0) + 1;
    }

    const valid = data.length - malformed;
    if (valid === 0) {
      return res.status(200).json({ count: data.length, problem: "no readings have a numeric ts" });
    }

    const spanDays = Math.max(1, Math.round((max - min) / 86400000));

    let storedMB = null;
    try { storedMB = (Buffer.byteLength(JSON.stringify(data)) / 1048576).toFixed(2); }
    catch { storedMB = "too large to measure"; }

    return res.status(200).json({
      count: data.length,
      malformed,
      oldest: FULL_FMT.format(new Date(min)),
      newest: FULL_FMT.format(new Date(max)),
      spanDays,
      daysWithData: days.size,
      coverage: Math.round((days.size / spanDays) * 100) + "% of days have readings",
      avgPerDay: Math.round(valid / days.size),
      storedMB,
      byMonth: Object.fromEntries(Object.entries(byMonth).sort()),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
