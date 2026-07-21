// api/chat.js — family chat with push alerts.
// GET  ?after=<ts>       -> { messages:[{id,ts,name,text}] } (last 200, or newer than after)
// POST { name, text, excludeEndpoint } -> saves message, pushes everyone except sender
import { kv } from "@vercel/kv";
import webpush from "web-push";

const CHAT_KEY = "hudson-chat";
const SUBS_KEY = "hudson-push-subs";
const MAX_MSGS = 200;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try {
      const all = (await kv.get(CHAT_KEY)) ?? [];
      const after = parseInt(req.query?.after || "0", 10) || 0;
      const messages = after ? all.filter(m => m && m.ts > after) : all;
      return res.status(200).json({ messages, count: all.length });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  try {
    const { name, text, excludeEndpoint } = req.body || {};
    const cleanName = String(name || "").trim().slice(0, 24);
    const cleanText = String(text || "").trim().slice(0, 500);
    if (!cleanName || !cleanText) return res.status(400).json({ error: "name and text required" });

    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(), name: cleanName, text: cleanText };

    const all = (await kv.get(CHAT_KEY)) ?? [];
    const next = [...all, msg].slice(-MAX_MSGS);
    await kv.set(CHAT_KEY, next);

    // Push everyone except the sender's own device.
    let sent = 0, pruned = 0;
    const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:example@example.com", publicKey, privateKey);
      const subs = (await kv.get(SUBS_KEY)) ?? [];
      const alive = [];
      const payload = JSON.stringify({
        title: `💬 ${cleanName}`,
        body: cleanText,
        url: "/?open=chat",
        tag: "family-chat",           // newest message replaces older banner
      });
      await Promise.all(subs.map(async (sub) => {
        if (!sub) return;
        if (excludeEndpoint && sub.endpoint === excludeEndpoint) { alive.push(sub); return; }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sent++; alive.push(sub);
        } catch (e) {
          const st = e && e.statusCode;
          if (st === 404 || st === 410) pruned++;
          else alive.push(sub);
        }
      }));
      if (pruned > 0) await kv.set(SUBS_KEY, alive);
    }

    return res.status(200).json({ ok: true, message: msg, pushed: sent, pruned });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
