import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const { log } = req.body;
    if (!Array.isArray(log)) {
      return res.status(400).json({ error: "invalid_payload" });
    }
    // Keep max 200 entries
    await kv.set("hudson-log", log.slice(0, 200));
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: String(e) });
  }
}
