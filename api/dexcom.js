// Vercel Serverless Function
// Proxies Dexcom Share API calls so we can access live BG from the browser.
// The Dexcom Share API isn't officially documented but is stable and widely
// used by community apps (xDrip+, Nightscout, Sugarmate, etc.)

const APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db"; // Public Dexcom Share app ID
const US_HOST = "https://share2.dexcom.com";
const OUS_HOST = "https://shareous1.dexcom.com";

export default async function handler(req, res) {
  // CORS (same-origin on Vercel, but safe for local dev)
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
    // Step 1: login by username (returns an accountId GUID)
    const accountRes = await fetch(
      `${host}/ShareWebServices/Services/General/AuthenticatePublisherAccount`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" },
        body:    JSON.stringify({ accountName: username, password, applicationId: APP_ID }),
      }
    );
    const accountText = await accountRes.text();
    if (!accountRes.ok) {
      return res.status(accountRes.status).json({ error: "auth_failed", detail: accountText });
    }
    const accountId = accountText.replace(/"/g, "");

    // Step 2: exchange accountId for a sessionId
    const loginRes = await fetch(
      `${host}/ShareWebServices/Services/General/LoginPublisherAccountById`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" },
        body:    JSON.stringify({ accountId, password, applicationId: APP_ID }),
      }
    );
    const loginText = await loginRes.text();
    if (!loginRes.ok) {
      return res.status(loginRes.status).json({ error: "login_failed", detail: loginText });
    }
    const sessionId = loginText.replace(/"/g, "");

    // Step 3: latest glucose reading (last 10 min)
    const bgRes = await fetch(
      `${host}/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=10&maxCount=1`,
      { method: "POST", headers: { "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" } }
    );
    const bgData = await bgRes.json();

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
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
