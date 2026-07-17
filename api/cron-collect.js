// api/cron-collect.js
// Scheduled collector: pulls the most recent Dexcom readings and merges them
// into the shared KV store, so history keeps filling in even when nobody has
// the app open. It reuses the existing /api/dexcom-history and /api/bg-store
// routes, so it needs no Dexcom credentials of its own.
//
// Trigger it with Vercel Cron (Pro plan) OR any external scheduler (Hobby).

export default async function handler(req, res) {
  // Optional auth. If CRON_SECRET is set in the project's env vars, require it.
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically; an
  // external scheduler should send the same header. If no secret is set, the
  // endpoint runs unprotected (fine to start, better to lock down).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }

  try {
    const base = process.env.APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (!base) return res.status(500).json({ error: "Set APP_URL env var" });

    // 1) Pull the latest readings from the existing (authenticated) Dexcom route.
    const histRes = await fetch(`${base}/api/dexcom-history`);
    if (!histRes.ok) {
      return res.status(502).json({ error: "dexcom-history fetch failed", status: histRes.status });
    }
    const hist = await histRes.json();
    if (!Array.isArray(hist) || hist.length === 0) {
      return res.status(200).json({ collected: 0, note: "no readings returned" });
    }

    // 2) Merge into the store. bg-store dedupes by ts and caps by count, so
    //    re-sending overlapping readings every run is harmless.
    const storeRes = await fetch(`${base}/api/bg-store`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readings: hist }),
    });
    const stored = storeRes.ok ? await storeRes.json() : { error: storeRes.status };

    return res.status(200).json({
      collected: hist.length,
      store: stored,
      at: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
