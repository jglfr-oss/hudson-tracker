// api/push-subscribe.js
// Stores one entry per device in a single KV key. Replaces the Postgres table
// from the spec — this app has no auth or per-user rows, it's one family.
//
// POST { endpoint, p256dh, auth, userAgent, label } -> upsert (dedupes on endpoint)
// DELETE (or POST { endpoint, remove:true })        -> remove that device
// GET                                               -> list registered devices
import { kv } from "@vercel/kv";

const KEY = "hudson-push-subs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const subs = (await kv.get(KEY)) ?? [];

    if (req.method === "GET") {
      // Never return the crypto keys to the client.
      return res.status(200).json(
        subs.map(s => ({ endpoint: s.endpoint, label: s.label, createdAt: s.createdAt }))
      );
    }

    if (req.method === "DELETE") {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      const next = subs.filter(s => s.endpoint !== endpoint);
      await kv.set(KEY, next);
      return res.status(200).json({ removed: subs.length - next.length, total: next.length });
    }

    if (req.method === "POST") {
      const { endpoint, p256dh, auth, userAgent, label, remove } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });

      if (remove) {
        const next = subs.filter(s => s.endpoint !== endpoint);
        await kv.set(KEY, next);
        return res.status(200).json({ removed: subs.length - next.length, total: next.length });
      }

      if (!p256dh || !auth) return res.status(400).json({ error: "incomplete subscription" });

      // Upsert on endpoint so re-subscribing doesn't duplicate the device.
      const next = subs.filter(s => s.endpoint !== endpoint);
      next.push({
        endpoint,
        p256dh,
        auth,
        label: (label || "device").slice(0, 40),
        userAgent: (userAgent || "").slice(0, 300),
        createdAt: new Date().toISOString(),
      });
      await kv.set(KEY, next);
      return res.status(200).json({ ok: true, total: next.length });
    }

    return res.status(405).json({ error: "method_not_allowed" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
