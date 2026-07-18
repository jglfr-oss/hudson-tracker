// api/ask.js
// "Ask Claude" — answers questions about Hudson's BG and site data.
// Builds a compact daily digest from KV and sends it to the Anthropic API.
// Requires ANTHROPIC_API_KEY in Vercel env vars.
import { kv } from "@vercel/kv";

export const maxDuration = 60; // model calls can exceed the default timeout

const TZ = "America/New_York";
const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year:"numeric", month:"2-digit", day:"2-digit" });
const HOUR_FMT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour:"numeric", hour12:false });

function buildDigest(readings, sites, settings) {
  const { rangeLow = 80, rangeHigh = 180, mealWindows } = settings;
  const mw = mealWindows || { breakfast:{start:5,end:10}, lunch:{start:10,end:14}, snack:{start:14,end:17}, dinner:{start:17,end:21} };
  const isOvernight = h =>
    !((h>=mw.breakfast.start&&h<mw.breakfast.end)||(h>=mw.lunch.start&&h<mw.lunch.end)||
      (h>=mw.snack.start&&h<mw.snack.end)||(h>=mw.dinner.start&&h<mw.dinner.end));

  // Group by local day
  const byDay = {};
  for (const r of readings) {
    if (!r || typeof r.ts !== "number") continue;
    const d = new Date(r.ts);
    const key = DAY_FMT.format(d);
    const h = parseInt(HOUR_FMT.format(d), 10) % 24;
    if (!byDay[key]) byDay[key] = { vals:[], hi:0, lo:0, onHi:0, onLo:0, onVals:[] };
    const b = byDay[key];
    b.vals.push(r.value);
    if (r.value > rangeHigh) { b.hi++; if (isOvernight(h)) b.onHi++; }
    if (r.value < rangeLow)  { b.lo++; if (isOvernight(h)) b.onLo++; }
    if (isOvernight(h)) b.onVals.push(r.value);
  }

  const lines = Object.keys(byDay).sort().map(k => {
    const b = byDay[k];
    const avg = Math.round(b.vals.reduce((a,v)=>a+v,0)/b.vals.length);
    const min = Math.min(...b.vals), max = Math.max(...b.vals);
    const onMin = b.onVals.length ? Math.min(...b.onVals) : "-";
    return `${k} n=${b.vals.length} avg=${avg} min=${min} max=${max} high=${b.hi} low=${b.lo} overnightHigh=${b.onHi} overnightLow=${b.onLo} overnightMin=${onMin}`;
  });

  const siteLines = (sites||[])
    .filter(x => x && typeof x.ts === "number")
    .sort((a,b)=>a.ts-b.ts)
    .map(x => `${DAY_FMT.format(new Date(x.ts))} ${new Date(x.ts).toLocaleTimeString("en-US",{timeZone:TZ,hour:"numeric",minute:"2-digit"})} ${x.device} ${x.site||""}`);

  return { lines, siteLines };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  try {
    const { question, history, fromTs, toTs } = req.body || {};
    if (!question || typeof question !== "string" || question.length > 2000) {
      return res.status(400).json({ error: "invalid question" });
    }

    const [readings, sites, ratios, mealWindows, rangeLow, rangeHigh] = await Promise.all([
      kv.get("hudson-bg-history"),
      kv.get("hudson-site-log"),
      kv.get("hudson-ratios"),
      kv.get("hudson-meal-windows"),
      kv.get("hudson-range-low"),
      kv.get("hudson-range-high"),
    ]);

    const { lines, siteLines } = buildDigest(
      Array.isArray(readings) ? readings : [],
      Array.isArray(sites) ? sites : [],
      { rangeLow, rangeHigh, mealWindows }
    );

    const selNote = (fromTs && toTs)
      ? `The user's app currently has the date filter set to ${DAY_FMT.format(new Date(fromTs))} through ${DAY_FMT.format(new Date(toTs))}. If their question says "this period" or similar, that's the range they mean.`
      : "";

    const system = `You are the data assistant inside a family-built insulin tracking app for a child named Hudson, who has type 1 diabetes and uses an Omnipod pump and Dexcom G7 CGM. You answer questions from Hudson's parents (and sometimes Hudson) about his glucose data.

DATA (one line per day, local Eastern time; high = readings above ${rangeHigh ?? 180} mg/dL, low = below ${rangeLow ?? 80} mg/dL; ~288 readings = a complete day; overnight = hours outside meal windows):
${lines.join("\n")}

POD & SENSOR CHANGE LOG (manually logged; may be incomplete):
${siteLines.length ? siteLines.join("\n") : "(none logged yet)"}

CONTEXT: Insulin-to-carb ratios: ${JSON.stringify(ratios || {})}. Known history: he was on injections (not the pump) roughly Jul 7-16, 2026; on the pump otherwise. The store has a few small collection gaps; days with n well below 288 are partially recorded — say so rather than over-concluding from them.
${selNote}

RULES:
- Answer from the data above. Cite actual numbers and dates. If the data can't answer the question, say so plainly.
- Keep answers short and conversational — a few sentences, plain prose. No headers or bullet walls.
- NEVER recommend insulin dose changes, ratio changes, basal changes, or specific treatment adjustments. When patterns suggest something is off, describe the pattern and say it's worth discussing with Hudson's endocrinologist.
- If asked something requiring urgent judgment (current low, symptoms), remind them to act on the CGM and their care plan, not on this chat.`;

    const msgs = [];
    if (Array.isArray(history)) {
      for (const m of history.slice(-8)) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          msgs.push({ role: m.role, content: m.content.slice(0, 4000) });
        }
      }
    }
    msgs.push({ role: "user", content: question });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system,
        messages: msgs,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(()=> "");
      return res.status(502).json({ error: "model_error", status: resp.status, detail: detail.slice(0, 300) });
    }

    const data = await resp.json();
    const answer = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n").trim();

    return res.status(200).json({ answer: answer || "I couldn't generate an answer — try rephrasing." });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
