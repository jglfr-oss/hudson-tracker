import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  try {
    const log = await kv.get("hudson-log");
    res.status(200).json(log ?? []);
  } catch (e) {
    res.status(500).json({ error: "db_error", detail: String(e) });
  }
}
