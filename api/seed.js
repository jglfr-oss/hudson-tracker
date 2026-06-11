// api/seed.js
// One-time endpoint to (re)load the 90-day Sugarmate export into KV.
// Fetches bg-seed.json from the app's own static files and stores it.

import { kv } from "@vercel/kv";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Determine app base URL
    const base = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    if (!base) return res.status(500).json({ error: "Set APP_URL env var" });

    // Fetch the seed file from static hosting
    const seedRes = await fetch(`${base}/bg-seed.json`);
    if (!seedRes.ok) return res.status(500).json({ error: "Could not fetch bg-seed.json" });

    const seed = await seedRes.json();

    // Filter to 90 days and deduplicate
    const cutoff = Date.now() - NINETY_DAYS_MS;
    const map = {};
    seed.filter(r => r.ts > cutoff).forEach(r => { map[r.ts] = r; });
    const sorted = Object.values(map).sort((a,b) => a.ts - b.ts);

    await kv.set("hudson-bg-history", sorted);

    const oldest = sorted.length ? new Date(sorted[0].ts).toLocaleDateString() : "n/a";
    const newest = sorted.length ? new Date(sorted[sorted.length-1].ts).toLocaleDateString() : "n/a";

    return res.status(200).json({
      stored: sorted.length,
      from: oldest,
      to: newest,
    });
  } catch(e) {
    return res.status(500).json({ error: String(e) });
  }
}
