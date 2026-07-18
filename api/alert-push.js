// api/alert-push.js
// Sends urgent BG alerts as push notifications to every registered device.
// Replaces the old Twilio SMS path (/api/notify). Called by the app when
// BG crosses alert thresholds.
//
// Server-side cooldown: the same alert key won't send twice within 10 minutes,
// even if several family phones have the app open and all report the low.
import { kv } from "@vercel/kv";
import webpush from "web-push";

export const maxDuration = 30;

const SUBS_KEY = "hudson-push-subs";
const LAST_KEY = "hudson-alert-last";
const COOLDOWN_MS = 10 * 60 * 1000;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!publicKey || !privateKey) return res.status(500).json({ error: "VAPID keys not configured" });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    const { key, message } = req.body || {};
    if (!key || !message || typeof message !== "string" || message.length > 300) {
      return res.status(400).json({ error: "invalid" });
    }

    // Server-side cooldown across all devices
    const last = await kv.get(LAST_KEY);
    const now = Date.now();
    if (last && last.key === key && now - last.ts < COOLDOWN_MS) {
      return res.status(200).json({ sent: 0, skipped: "cooldown" });
    }
    await kv.set(LAST_KEY, { key, ts: now });

    const subs = (await kv.get(SUBS_KEY)) ?? [];
    if (subs.length === 0) return res.status(200).json({ sent: 0, reason: "no devices registered" });

    const payload = JSON.stringify({
      title: "🚨 BG Alert",
      body: message,
      url: "/",
      tag: "bg-alert-" + key,   // distinct tag so alerts don't replace the daily status
    });

    const alive = [];
    let sent = 0, pruned = 0;
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1; alive.push(sub);
      } catch (e) {
        const status = e && e.statusCode;
        if (status === 404 || status === 410) pruned += 1;
        else alive.push(sub);
      }
    }));
    if (pruned > 0) await kv.set(SUBS_KEY, alive);

    return res.status(200).json({ sent, pruned });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
