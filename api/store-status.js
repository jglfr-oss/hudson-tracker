// api/store-status.js
// Read-only diagnostic: how much BG data is actually in KV, how far back it goes,
// how big the stored value is, and how many readings exist per month.
// Safe to hit from a browser — returns counts only, never the full array.
import { kv } from "@vercel/kv";

const KEY = "hudson-bg-history";
const TZ  = "America/New_York";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const data = (await kv.get(KEY)) ?? [];

    if (!Array.isArray(data)) {
      return res.status(200).json({
        problem: "stored value is not an array",
        type: typeof data,
      });
    }

    if (data.length === 0) {
      return res.status(200).json({ count: 0, note: "store is empty" });
    }

    const valid  = data.filter(r => r && typeof r.ts === "number");
    const sorted = [...valid].sort((a, b) => a.ts - b.ts);
    const fmt = ts => new Date(ts).toLocaleString("en-US", {
      timeZone: TZ, year: "numeric", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });

    // Readings per month, to show where the gaps are.
    const byMonth = {};
    sorted.forEach(r => {
      const k = new Date(r.ts).toLocaleDateString("en-US", {
        timeZone: TZ, year: "numeric", month: "short",
      });
      byMonth[k] = (byMonth[k] || 0) + 1;
    });

    // Distinct days with data, vs days spanned — reveals sparseness.
    const days = new Set(sorted.map(r =>
      new Date(r.ts).toLocaleDateString("en-US", { timeZone: TZ })));
    const spanDays = Math.max(1,
      Math.round((sorted[sorted.length - 1].ts - sorted[0].ts) / 86400000));

    const bytes = Buffer.byteLength(JSON.stringify(data));

    return res.status(200).json({
      count: data.length,
      malformed: data.length - valid.length,
      oldest: fmt(sorted[0].ts),
      newest: fmt(sorted[sorted.length - 1].ts),
      spanDays,
      daysWithData: days.size,
      coverage: `${Math.round((days.size / spanDays) * 100)}% of days have readings`,
      avgPerDay: Math.round(valid.length / days.size),
      storedBytes: bytes,
      storedMB: (bytes / 1048576).toFixed(2),
      byMonth,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
