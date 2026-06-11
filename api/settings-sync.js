import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error:"method_not_allowed" });
  try {
    const { ratios, mealWindows, rangeLow, rangeHigh } = req.body;
    if (ratios)      await kv.set("hudson-ratios",        ratios);
    if (mealWindows) await kv.set("hudson-meal-windows",  mealWindows);
    if (rangeLow)    await kv.set("hudson-range-low",     rangeLow);
    if (rangeHigh)   await kv.set("hudson-range-high",    rangeHigh);
    res.status(200).json({ ok: true });
  } catch(e) { res.status(500).json({ error: String(e) }); }
}
