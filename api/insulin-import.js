// api/insulin-import.js
// Loads public/insulin-seed.json (built from a Glooko export) and merges it
// into the insulin store. Safe to run repeatedly — merges, never overwrites.
import { kv } from "@vercel/kv";

const KEY = "hudson-insulin";
const MAX_BOLUSES = 20000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    const base = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!base) return res.status(500).json({ error: "Set APP_URL env var" });

    const r = await fetch(`${base}/insulin-seed.json`);
    if (!r.ok) return res.status(500).json({ error: "Could not fetch insulin-seed.json" });
    const seed = await r.json();

    const existing = (await kv.get(KEY)) ?? { boluses: [], dailyTotals: [] };

    const bMap = {};
    [...(existing.boluses || []), ...(seed.boluses || [])]
      .filter(x => x && typeof x.ts === "number")
      .forEach(x => { bMap[x.ts] = x; });
    const boluses = Object.values(bMap).sort((a, b) => a.ts - b.ts).slice(-MAX_BOLUSES);

    const tMap = {};
    [...(existing.dailyTotals || []), ...(seed.dailyTotals || [])]
      .filter(x => x && typeof x.d === "string")
      .forEach(x => { tMap[x.d] = x; });
    const dailyTotals = Object.values(tMap).sort((a, b) => a.d.localeCompare(b.d));

    await kv.set(KEY, { boluses, dailyTotals });

    return res.status(200).json({
      boluses: boluses.length,
      dailyTotals: dailyTotals.length,
      from: boluses.length ? new Date(boluses[0].ts).toLocaleDateString("en-US") : "n/a",
      to:   boluses.length ? new Date(boluses[boluses.length-1].ts).toLocaleDateString("en-US") : "n/a",
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
