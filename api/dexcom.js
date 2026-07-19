// Vercel Serverless Function
// Proxies Dexcom Share API calls so we can access live BG from the browser.
// The Dexcom Share API isn't officially documented but is stable and widely
// used by community apps (xDrip+, Nightscout, Sugarmate, etc.)
//
// Session caching: the full auth handshake is two extra round trips per call.
// Share sessions stay valid for hours, so we cache the sessionId in KV and
// only re-authenticate when Dexcom rejects it.
import { kv } from "@vercel/kv";

const APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db"; // Public Dexcom Share app ID
const US_HOST = "https://share2.dexcom.com";
const OUS_HOST = "https://shareous1.dexcom.com";
const SESSION_KEY = "dexcom-session";
const HDRS = { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" };

async function login(host, username, password) {
  const accountRes = await fetch(
    `${host}/ShareWebServices/Services/General/AuthenticatePublisherAccount`,
    { method: "POST", headers: HDRS,
      body: JSON.stringify({ accountName: username, password, applicationId: APP_ID }) }
  );
  const accountText = await accountRes.text();
  if (!accountRes.ok) throw new Error("auth_failed: " + accountText.slice(0, 200));
  const accountId = accountText.replace(/"/g, "");

  const loginRes = await fetch(
    `${host}/ShareWebServices/Services/General/LoginPublisherAccountById`,
    { method: "POST", headers: HDRS,
      body: JSON.stringify({ accountId, password, applicationId: APP_ID }) }
  );
  const loginText = await loginRes.text();
  if (!loginRes.ok) throw new Error("login_failed: " + loginText.slice(0, 200));
  const sessionId = loginText.replace(/"/g, "");

  await kv.set(SESSION_KEY, sessionId, { ex: 6 * 3600 }).catch(() => {});
  return sessionId;
}

async function readLatest(host, sessionId) {
  const bgRes = await fetch(
    `${host}/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=10&maxCount=1`,
    { method: "POST", headers: { "Accept": "application/json", "User-Agent": HDRS["User-Agent"] } }
  );
  if (!bgRes.ok) {
    const t = await bgRes.text().catch(() => "");
    const stale = bgRes.status === 401 || /SessionIdNotFound|SessionNotValid/i.test(t);
    const err = new Error(stale ? "stale_session" : "read_failed: " + t.slice(0, 200));
    err.stale = stale;
    throw err;
  }
  return bgRes.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const username = process.env.DEXCOM_USERNAME;
  const password = process.env.DEXCOM_PASSWORD;
  const region   = (process.env.DEXCOM_REGION || "us").toLowerCase();
  const host     = region === "ous" ? OUS_HOST : US_HOST;

  if (!username || !password) {
    return res.status(500).json({
      error: "missing_credentials",
      message: "DEXCOM_USERNAME and DEXCOM_PASSWORD must be set in Vercel environment variables.",
    });
  }

  try {
    let sessionId = await kv.get(SESSION_KEY).catch(() => null);
    let bgData;

    if (sessionId) {
      try {
        bgData = await readLatest(host, sessionId);
      } catch (e) {
        if (!e.stale) throw e;
        sessionId = null;             // cached session expired — fall through
      }
    }
    if (!sessionId) {
      sessionId = await login(host, username, password);
      bgData = await readLatest(host, sessionId);
    }

    if (!Array.isArray(bgData) || bgData.length === 0) {
      return res.status(200).json({ error: "no_reading", message: "No recent reading from Dexcom (last 10 min)." });
    }

    const r = bgData[0];
    // r.WT is like "/Date(1712345678000)/"
    const tsMatch = /\((\d+)/.exec(r.WT || r.ST || "");
    const ts = tsMatch ? parseInt(tsMatch[1], 10) : Date.now();

    return res.status(200).json({
      value: r.Value,
      trend: r.Trend,          // string like "Flat" or number 1–9
      timestamp: ts,
      ageMinutes: Math.round((Date.now() - ts) / 60000),
    });
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e && e.message || e) });
  }
}
