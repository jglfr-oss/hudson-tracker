// api/device-check.js
// Escalating device-change reminders, pushed to all registered devices.
// Runs every 15 minutes via Vercel Cron.
//
// Schedule per device (pod ~3d wear, G7 sensor ~10d):
//   • ~3 hours before expiry  → one push
//   • ~1 hour before expiry   → one push
//   • overdue                 → one push per hour until a new change is logged
//
// State lives in KV keyed to the specific change entry, so logging a new
// change automatically resets the escalation.
import { kv } from "@vercel/kv";
import webpush from "web-push";

export const maxDuration = 30;

const SUBS_KEY  = "hudson-push-subs";
const SITES_KEY = "hudson-site-log";
const STATE_KEY = "hudson-device-alerts";
const WEAR_DAYS = { pod: 3, sensor: 10 };
const LABEL     = { pod: "Pod", sensor: "G7 sensor" };
const ICON      = { pod: "🟠", sensor: "🟢" };

async function pushAll(title, body, tag) {
  const subs = (await kv.get(SUBS_KEY)) ?? [];
  if (subs.length === 0) return { sent: 0 };
  const payload = JSON.stringify({ title, body, url: "/", tag });
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

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
  }

  const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!publicKey || !privateKey) return res.status(500).json({ error: "VAPID keys not configured" });
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    const sites = (await kv.get(SITES_KEY)) ?? [];
    const state = (await kv.get(STATE_KEY)) ?? {};
    const now = Date.now();
    const actions = [];

    for (const dev of ["pod", "sensor"]) {
      const list = sites
        .filter(x => x && x.device === dev && typeof x.ts === "number")
        .sort((a, b) => b.ts - a.ts);
      if (list.length === 0) continue;           // nothing logged — nothing to remind about

      const cur = list[0];
      const hoursLeft = WEAR_DAYS[dev] * 24 - (now - cur.ts) / 3600000;

      // Reset escalation when the tracked change entry is new
      if (!state[dev] || state[dev].anchor !== cur.ts) {
        state[dev] = { anchor: cur.ts, sent3h: false, sent1h: false, lastOverdue: 0 };
      }
      const st = state[dev];
      const where = cur.site ? ` (${cur.site})` : "";

      if (hoursLeft <= 0) {
        // Overdue: hourly
        if (now - st.lastOverdue >= 55 * 60 * 1000) {
          const overBy = Math.abs(hoursLeft);
          const overTxt = overBy < 24 ? `${Math.round(overBy)}h` : `${(overBy/24).toFixed(1)}d`;
          actions.push(pushAll(
            `🔴 ${LABEL[dev]} overdue`,
            `${ICON[dev]} ${LABEL[dev]} is ${overTxt} past its ${WEAR_DAYS[dev]}-day wear${where}. Change it and log it in the app.`,
            `device-${dev}-overdue`
          ));
          st.lastOverdue = now;
        }
      } else if (hoursLeft <= 1 && !st.sent1h) {
        actions.push(pushAll(
          `⚠️ ${LABEL[dev]} change in ~1 hour`,
          `${ICON[dev]} Current ${LABEL[dev].toLowerCase()}${where} hits ${WEAR_DAYS[dev]} days in about an hour.`,
          `device-${dev}-1h`
        ));
        st.sent1h = true;
        st.sent3h = true;                        // don't send the 3h one late
      } else if (hoursLeft <= 3 && !st.sent3h) {
        actions.push(pushAll(
          `⏳ ${LABEL[dev]} change in ~3 hours`,
          `${ICON[dev]} Current ${LABEL[dev].toLowerCase()}${where} hits ${WEAR_DAYS[dev]} days in about 3 hours — good time to plan the swap.`,
          `device-${dev}-3h`
        ));
        st.sent3h = true;
      }
    }

    const results = await Promise.all(actions);
    await kv.set(STATE_KEY, state);

    return res.status(200).json({
      checked: ["pod","sensor"],
      notificationsSent: results.reduce((a,r)=>a+(r.sent||0),0),
      state,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
