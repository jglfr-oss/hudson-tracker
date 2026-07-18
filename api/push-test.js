// api/push-test.js
// Diagnostic: sends one test push to every registered device and reports
// the exact status Apple/Google returned for each. Safe to hit from a browser.
import { kv } from "@vercel/kv";
import webpush from "web-push";

export const maxDuration = 30;
const SUBS_KEY = "hudson-push-subs";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:example@example.com";

  const diag = {
    hasPublicKey: !!publicKey,
    hasPrivateKey: !!privateKey,
    publicKeyPreview: publicKey ? publicKey.slice(0, 12) + "…" : null,
    subject,
  };
  if (!publicKey || !privateKey) {
    return res.status(200).json({ ...diag, problem: "VAPID keys missing from env" });
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    return res.status(200).json({ ...diag, problem: "VAPID setup failed: " + String(e && e.message || e) });
  }

  try {
    const subs = (await kv.get(SUBS_KEY)) ?? [];
    diag.devices = subs.length;
    if (subs.length === 0) return res.status(200).json({ ...diag, problem: "no devices registered" });

    const payload = JSON.stringify({
      title: "✅ Test notification",
      body: "Push is working on this device.",
      url: "/", tag: "push-test",
    });

    const results = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        results.push({ label: sub.label, created: sub.createdAt, result: "SENT" });
      } catch (e) {
        results.push({
          label: sub.label,
          created: sub.createdAt,
          result: "FAILED",
          statusCode: e && e.statusCode,
          body: e && e.body ? String(e.body).slice(0, 200) : undefined,
          message: String(e && e.message || e).slice(0, 200),
        });
      }
    }
    return res.status(200).json({ ...diag, results });
  } catch (e) {
    return res.status(500).json({ ...diag, error: String(e && e.message || e) });
  }
}
