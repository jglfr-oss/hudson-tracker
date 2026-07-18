// api/insulin-store.js
// Bolus and daily-total insulin records from Glooko exports.
// GET  -> { boluses:[{ts,u,c,r,bg}], dailyTotals:[{d,bolus,basal,total}] }
// POST -> merges new records in (dedupes boluses by ts, totals by date)
import { kv } from "@vercel/kv";

const KEY = "hudson-insulin";
const MAX_BOLUSES = 20000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    if (req.method === "GET") {
      const data = (await kv.get(KEY)) ?? { boluses: [], dailyTotals: [] };
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const { boluses, dailyTotals } = req.body || {};
      if (!Array.isArray(boluses) && !Array.isArray(dailyTotals)) {
        return res.status(400).json({ error: "invalid" });
      }
      const existing = (await kv.get(KEY)) ?? { boluses: [], dailyTotals: [] };

      const bMap = {};
      [...(existing.boluses || []), ...(boluses || [])]
        .filter(r => r && typeof r.ts === "number")
        .forEach(r => { bMap[r.ts] = r; });
      const mergedB = Object.values(bMap).sort((a, b) => a.ts - b.ts).slice(-MAX_BOLUSES);

      const tMap = {};
      [...(existing.dailyTotals || []), ...(dailyTotals || [])]
        .filter(r => r && typeof r.d === "string")
        .forEach(r => { tMap[r.d] = r; });
      const mergedT = Object.values(tMap).sort((a, b) => a.d.localeCompare(b.d));

      await kv.set(KEY, { boluses: mergedB, dailyTotals: mergedT });
      return res.status(200).json({ boluses: mergedB.length, dailyTotals: mergedT.length });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
