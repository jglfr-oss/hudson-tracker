// api/site-log.js
// Shared log of pod and CGM sensor changes (device, timestamp, body location).
// Same pattern as log-get/log-save: one KV key, visible to all family members.
import { kv } from "@vercel/kv";

const KEY = "hudson-site-log";
const MAX_ENTRIES = 500;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const data = (await kv.get(KEY)) ?? [];
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  if (req.method === "POST") {
    const { sites } = req.body || {};
    if (!Array.isArray(sites)) return res.status(400).json({ error: "invalid" });
    try {
      // Newest first, dedupe by id, cap the list.
      const map = {};
      sites
        .filter(s => s && typeof s.ts === "number" && s.device)
        .forEach(s => { map[s.id ?? s.ts] = s; });
      const sorted = Object.values(map).sort((a, b) => b.ts - a.ts).slice(0, MAX_ENTRIES);
      await kv.set(KEY, sorted);
      return res.status(200).json({ stored: sorted.length });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  return res.status(405).json({ error: "method_not_allowed" });
}
