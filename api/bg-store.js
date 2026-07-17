import { kv } from "@vercel/kv";
const MAX_READINGS = 60000; // ~208 days at 1 reading / 5 min; plenty of headroom
const KEY = "hudson-bg-history";
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST") {
    const { readings } = req.body;
    if (!Array.isArray(readings)) return res.status(400).json({ error:"invalid" });
    try {
      const existing = (await kv.get(KEY)) ?? [];
      const map = {};
      [...existing, ...readings]
        .filter(r => r && typeof r.ts === "number")
        .forEach(r => { map[r.ts] = r; });
      // Keep only the most recent MAX_READINGS by timestamp — no rolling date cutoff
      const sorted = Object.values(map).sort((a,b) => a.ts - b.ts);
      const trimmed = sorted.slice(-MAX_READINGS);
      await kv.set(KEY, trimmed);
      return res.status(200).json({ stored: trimmed.length });
    } catch(e) { return res.status(500).json({ error: String(e) }); }
  }
  if (req.method === "GET") {
    try {
      const data = (await kv.get(KEY)) ?? [];
      return res.status(200).json(data);
    } catch(e) { return res.status(500).json({ error: String(e) }); }
  }
  return res.status(405).json({ error:"method_not_allowed" });
}
