// Returns last 3 hours of BG readings for the trend graph
const APP_ID = "d89443d2-327c-4a6f-89e5-496bbb0317db";
const US_HOST  = "https://share2.dexcom.com";
const OUS_HOST = "https://shareous1.dexcom.com";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const username = process.env.DEXCOM_USERNAME;
  const password = process.env.DEXCOM_PASSWORD;
  const region   = (process.env.DEXCOM_REGION || "us").toLowerCase();
  const host     = region === "ous" ? OUS_HOST : US_HOST;

  if (!username || !password) {
    return res.status(500).json({ error: "missing_credentials" });
  }

  try {
    // Step 1: get accountId
    const accountRes = await fetch(
      `${host}/ShareWebServices/Services/General/AuthenticatePublisherAccount`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" },
        body: JSON.stringify({ accountName: username, password, applicationId: APP_ID }),
      }
    );
    const accountId = (await accountRes.text()).replace(/"/g, "");

    // Step 2: get sessionId
    const loginRes = await fetch(
      `${host}/ShareWebServices/Services/General/LoginPublisherAccountById`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" },
        body: JSON.stringify({ accountId, password, applicationId: APP_ID }),
      }
    );
    const sessionId = (await loginRes.text()).replace(/"/g, "");

    // Step 3: get last 3 hours (180 min, max 36 readings at 5-min intervals)
    const bgRes = await fetch(
      `${host}/ShareWebServices/Services/Publisher/ReadPublisherLatestGlucoseValues?sessionId=${sessionId}&minutes=180&maxCount=36`,
      { method: "POST", headers: { "Accept": "application/json", "User-Agent": "Dexcom Share/3.0.2.11" } }
    );
    const readings = await bgRes.json();

    if (!Array.isArray(readings) || readings.length === 0) {
      return res.status(200).json([]);
    }

    // Parse and sort oldest → newest
    const parsed = readings
      .map(r => {
        const tsMatch = /\((\d+)/.exec(r.WT || r.ST || "");
        return { value: r.Value, ts: tsMatch ? parseInt(tsMatch[1], 10) : 0 };
      })
      .filter(r => r.ts > 0)
      .sort((a, b) => a.ts - b.ts);

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: "server_error", detail: String(e) });
  }
}
