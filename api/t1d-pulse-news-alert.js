// ═══ api/t1d-pulse-news-alert.js — push alerts for new T1D news articles ═════
// Runs hourly via Vercel Cron. Diffs the current T1D Pulse news list against a
// seen-set in KV and pushes a notification to all registered family devices for
// genuinely new articles (max 3 per run). Tapping the notification deep-links
// to the T1D Pulse tab (/?open=pulse).
//
// First run seeds the seen-set WITHOUT sending anything, so enabling the
// feature never blasts a push for every article already on the tab.
//
//   GET  ?pref=1            -> { enabled }            (read the alert toggle)
//   POST { enabled: bool }  -> { enabled }            (set the alert toggle)
//   GET                     -> run the check (cron; CRON_SECRET-protected)
import { kv } from "@vercel/kv";
import webpush from "web-push";

import { CACHE_KEY, CACHE_TTL_SECONDS } from "../lib/t1d-pulse/config.js";
import { getCached, setCached } from "../lib/t1d-pulse/cache.js";
import { generatePulse } from "../lib/t1d-pulse/run.js";
import { pickNewArticles, SEEN_KEY, PREF_KEY } from "../lib/t1d-pulse/alerts.js";

export const maxDuration = 30;

const SUBS_KEY = "hudson-push-subs";

// Same delivery pattern as api/device-check.js: push to every registered
// device, pruning subscriptions the push service reports as gone.
async function pushAll(title, body, tag) {
  const subs = (await kv.get(SUBS_KEY)) ?? [];
  if (subs.length === 0) return { sent: 0 };
  const payload = JSON.stringify({ title, body, url: "/?open=pulse", tag });
  const alive = [];
  let sent = 0, pruned = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++; alive.push(sub);
    } catch (e) {
      const st = e && e.statusCode;
      if (st === 404 || st === 410) pruned++;
      else alive.push(sub);
    }
  }));
  if (pruned > 0) await kv.set(SUBS_KEY, alive);
  return { sent, pruned };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    // ── Toggle: read ──
    if (req.method === "GET" && req.query && req.query.pref) {
      const pref = (await kv.get(PREF_KEY)) ?? { enabled: true };
      return res.status(200).json({ enabled: pref.enabled !== false });
    }

    // ── Toggle: set ──
    if (req.method === "POST") {
      const { enabled } = req.body || {};
      if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled must be boolean" });
      await kv.set(PREF_KEY, { enabled });
      return res.status(200).json({ enabled });
    }

    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

    // ── Cron run (protected like the other cron endpoints) ──
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const auth = req.headers.authorization || "";
      const qkey = (req.query && req.query.key) || "";
      if (auth !== `Bearer ${secret}` && qkey !== secret) {
        return res.status(401).json({ error: "unauthorized" });
      }
    }

    const pref = (await kv.get(PREF_KEY)) ?? { enabled: true };
    if (pref.enabled === false) {
      return res.status(200).json({ skipped: "alerts_disabled" });
    }

    // Reuse the app's cached pulse when fresh; otherwise generate (which also
    // warms the cache for the next app load).
    let payload = await getCached(CACHE_KEY);
    if (!payload) {
      payload = await generatePulse(Date.now());
      await setCached(CACHE_KEY, payload, CACHE_TTL_SECONDS);
    }

    const seen = await kv.get(SEEN_KEY); // null on very first run
    const { firstRun, fresh, seen: nextSeen } = pickNewArticles(payload.news, seen);
    await kv.set(SEEN_KEY, nextSeen);

    if (firstRun) {
      return res.status(200).json({ seeded: nextSeen.length, sent: 0, at: new Date().toISOString() });
    }

    const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject    = process.env.VAPID_SUBJECT || "mailto:example@example.com";
    if (fresh.length > 0) {
      if (!publicKey || !privateKey) return res.status(500).json({ error: "VAPID keys not configured" });
      webpush.setVapidDetails(subject, publicKey, privateKey);
    }

    const results = [];
    for (const item of fresh) {
      results.push(await pushAll(
        "📰 New T1D article",
        `${item.title} — ${item.source}`,
        `t1d-news-${item.id}`
      ));
    }

    return res.status(200).json({
      newArticles: fresh.map((i) => ({ id: i.id, title: i.title, source: i.source })),
      notificationsSent: results.reduce((a, r) => a + (r.sent || 0), 0),
      at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
