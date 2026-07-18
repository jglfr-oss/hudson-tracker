// api/daily-status.js
// Daily 8am push to every registered device: when the pod and G7 went on,
// and how much wear time is left. Pods ~3 days, G7 sensors ~10 days.
//
// Triggered by Vercel Cron. Dead subscriptions (404/410) are pruned automatically.
import { kv } from "@vercel/kv";
import webpush from "web-push";

const SUBS_KEY  = "hudson-push-subs";
const SITES_KEY = "hudson-site-log";
const WEAR_DAYS = { pod: 3, sensor: 10 };

// Site options must mirror SITE_OPTIONS in src/App.jsx
const SITE_CHOICES = {
  pod: [
    "Abdomen — L", "Abdomen — R",
    "Lower back — L", "Lower back — R",
    "Upper arm — L", "Upper arm — R",
    "Thigh — L", "Thigh — R",
  ],
  sensor: [
    "Upper arm — L", "Upper arm — R",
    "Abdomen — L", "Abdomen — R",
    "Thigh — L", "Thigh — R",
    "Lower back — L", "Lower back — R",
    "Upper buttock — L", "Upper buttock — R",
  ],
};

// Recommend the next site in fixed rotation order: whatever follows the most
// recently used site in the list above (wrapping around at the end).
function recommendSite(dev, sites) {
  const opts = SITE_CHOICES[dev] || [];
  if (opts.length === 0) return null;
  const used = (sites || [])
    .filter(x => x && x.device === dev && x.site && typeof x.ts === "number")
    .sort((a, b) => b.ts - a.ts);
  if (used.length === 0) return { site: opts[0], note: "start of rotation" };
  const idx = opts.indexOf(used[0].site);
  const next = opts[(idx === -1 ? 0 : idx + 1) % opts.length];
  return { site: next, note: "next in rotation" };
}

const LABEL     = { pod: "Pod", sensor: "G7" };
const ICON      = { pod: "🟠", sensor: "🟢" };
const TZ        = "America/New_York";

function fmtWhen(ts) {
  return new Date(ts).toLocaleString("en-US", {
    timeZone: TZ, weekday: "short", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtLeft(hoursLeft) {
  if (hoursLeft <= 0) {
    const over = Math.abs(hoursLeft);
    return over < 24 ? `OVERDUE by ${Math.round(over)}h`
                     : `OVERDUE by ${(over / 24).toFixed(1)}d`;
  }
  if (hoursLeft < 24) return `${Math.round(hoursLeft)}h left`;
  return `${(hoursLeft / 24).toFixed(1)} days left`;
}

function buildMessage(sites) {
  const lines = [];
  let anyOverdue = false;
  let anySoon = false;

  for (const dev of ["pod", "sensor"]) {
    const list = sites
      .filter(s => s && s.device === dev && typeof s.ts === "number")
      .sort((a, b) => b.ts - a.ts);

    if (list.length === 0) {
      lines.push(`${ICON[dev]} ${LABEL[dev]}: nothing logged yet`);
      continue;
    }

    const cur       = list[0];
    const hoursLeft = WEAR_DAYS[dev] * 24 - (Date.now() - cur.ts) / 3600000;
    if (hoursLeft <= 0) anyOverdue = true;
    else if (hoursLeft <= 24) anySoon = true;

    const where = cur.site ? ` (${cur.site})` : "";
    let line = `${ICON[dev]} ${LABEL[dev]}: on ${fmtWhen(cur.ts)}${where} — ${fmtLeft(hoursLeft)}`;
    if (hoursLeft <= 24) {
      const rec = recommendSite(dev, sites);
      if (rec) line += ` → try ${rec.site} (${rec.note})`;
    }
    lines.push(line);
  }

  const title = anyOverdue ? "⚠️ Device change due"
              : anySoon    ? "⏳ Device change coming up"
              : "☀️ Good morning";

  return { title, body: lines.join("\n") };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    const qkey = (req.query && req.query.key) || "";
    if (auth !== `Bearer ${secret}` && qkey !== secret) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  const publicKey  = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject    = process.env.VAPID_SUBJECT || "mailto:example@example.com";
  if (!publicKey || !privateKey) {
    return res.status(500).json({ error: "VAPID keys not configured" });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  try {
    const sites = (await kv.get(SITES_KEY)) ?? [];
    const subs  = (await kv.get(SUBS_KEY))  ?? [];

    const { title, body } = buildMessage(sites);

    // Preview mode: ?dry=1 shows the message without sending.
    if (req.query && req.query.dry) {
      return res.status(200).json({ dry: true, title, body, devices: subs.length });
    }

    if (subs.length === 0) {
      return res.status(200).json({ sent: 0, reason: "no devices registered", title, body });
    }

    const payload = JSON.stringify({ title, body, url: "/", tag: "daily-device-status" });
    const alive = [];
    let sent = 0, failed = 0, pruned = 0;

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
        alive.push(sub);
      } catch (e) {
        const status = e && e.statusCode;
        if (status === 404 || status === 410) {
          pruned += 1;               // device gone — drop it
        } else {
          failed += 1;
          alive.push(sub);           // transient failure — keep it
        }
      }
    }));

    if (pruned > 0) await kv.set(SUBS_KEY, alive);

    return res.status(200).json({
      sent, failed, pruned, title, body, at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
