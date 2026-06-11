// api/weekly-report.js
// Cron: runs every Sunday at 10:00 UTC (≈ 5am–6am ET depending on DST)
// Sends Hudson's weekly BG summary to configured recipients via Resend.
//
// Required env vars:
//   RESEND_API_KEY  — from resend.com (free tier works)
//
// Optional env vars (defaults shown):
//   REPORT_EMAILS   — comma-separated list, default: jon.adderly@gmail.com,jerushaadderly@gmail.com
//   REPORT_FROM     — sender address, default: onboarding@resend.dev (Resend free tier)

import { kv } from "@vercel/kv";

const RECIPIENTS = (process.env.REPORT_EMAILS || "jon.adderly@gmail.com,jerushaadderly@gmail.com")
  .split(",").map(e => e.trim());

const FROM = process.env.REPORT_FROM || "Hudson Tracker <onboarding@resend.dev>";

function fmtH(h) {
  if (h === 0) return "12am";
  if (h < 12)  return `${h}am`;
  if (h === 12) return "12pm";
  return `${h-12}pm`;
}

function mealWindowFor(hour, windows) {
  if (hour >= windows.breakfast.start && hour < windows.breakfast.end) return "breakfast";
  if (hour >= windows.lunch.start     && hour < windows.lunch.end)     return "lunch";
  if (hour >= windows.snack.start     && hour < windows.snack.end)     return "snack";
  if (hour >= windows.dinner.start    && hour < windows.dinner.end)    return "dinner";
  return "overnight";
}

function computeWeekStats(readings, rangeLow, rangeHigh, mealWindows) {
  if (!readings || readings.length === 0) return null;
  const vals    = readings.map(r => r.value);
  const avg     = Math.round(vals.reduce((a,b)=>a+b,0) / vals.length);
  const inRange = readings.filter(r => r.value >= rangeLow && r.value <= rangeHigh).length;
  const low     = readings.filter(r => r.value < rangeLow).length;
  const high    = readings.filter(r => r.value > rangeHigh).length;
  const n       = readings.length;
  const a1c     = ((avg + 46.7) / 28.7).toFixed(1);

  const windows = {};
  readings.forEach(r => {
    const h   = new Date(r.ts).getHours();
    const win = mealWindowFor(h, mealWindows);
    if (!windows[win]) windows[win] = [];
    windows[win].push(r.value);
  });
  const byWindow = {};
  Object.entries(windows).forEach(([k,vs]) => {
    byWindow[k] = Math.round(vs.reduce((a,b)=>a+b,0)/vs.length);
  });

  return {
    avg, a1c,
    tirPct:  Math.round(inRange/n*100),
    highPct: Math.round(high/n*100),
    lowPct:  Math.round(low/n*100),
    byWindow,
    total: n,
  };
}

function recommendation(avg, rangeLow, rangeHigh, currentRatio) {
  if (!avg || !currentRatio) return "Not enough data";
  if (avg > rangeHigh) return `Running high (avg ${avg}) — consider tightening ratio from 1:${currentRatio}g to 1:${Math.max(5,currentRatio-1)}g`;
  if (avg > 150)       return `Slightly elevated (avg ${avg}) — current 1:${currentRatio}g may need small adjustment`;
  if (avg < rangeLow)  return `Running low (avg ${avg}) — consider loosening ratio to 1:${currentRatio+2}g`;
  if (avg < 100)       return `Trending low (avg ${avg}) — consider loosening to 1:${currentRatio+1}g`;
  return `Looking good! Avg ${avg} — current 1:${currentRatio}g is working well`;
}

function colorForAvg(avg, rangeLow, rangeHigh) {
  if (avg < rangeLow)  return "#F5A623";
  if (avg > rangeHigh) return "#E84040";
  return "#27AE60";
}

function buildHtml(stats, ratios, mealWindows, rangeLow, rangeHigh, weekLabel) {
  const mealRows = [
    { key:"breakfast", label:"Breakfast", icon:"☀️"  },
    { key:"lunch",     label:"Lunch",     icon:"🌤️" },
    { key:"snack",     label:"Snack",     icon:"🍎"  },
    { key:"dinner",    label:"Dinner",    icon:"🌙"  },
    { key:"overnight", label:"Overnight", icon:"🌑"  },
  ].filter(m => stats.byWindow[m.key]);

  const mealRowsHtml = mealRows.map(m => {
    const avg  = stats.byWindow[m.key];
    const col  = colorForAvg(avg, rangeLow, rangeHigh);
    const mw   = mealWindows[m.key];
    const time = mw ? `${fmtH(mw.start)}–${fmtH(mw.end)}` : "";
    const rec  = m.key !== "overnight"
      ? recommendation(avg, rangeLow, rangeHigh, ratios[m.key])
      : avg > rangeHigh ? "Running high overnight — discuss basal rate with endo"
        : avg < rangeLow ? "Running low overnight — discuss with endo"
        : "Overnight numbers look solid";
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #E2D5F0;">
          <div style="font-weight:700;color:#1A0033;font-size:15px;">${m.icon} ${m.label}</div>
          <div style="font-size:11px;color:#9B7FBB;">${time}</div>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #E2D5F0;text-align:center;">
          <div style="font-size:24px;font-weight:900;color:${col};">${avg}</div>
          <div style="font-size:10px;color:#9B7FBB;">mg/dL avg</div>
        </td>
        <td style="padding:12px 16px;border-bottom:1px solid #E2D5F0;font-size:12px;color:#5A3A7A;line-height:1.5;">
          ${rec}
        </td>
      </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F0FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:20px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1A0033 0%,#3B0075 60%,#9B3FC8 100%);border-radius:16px;padding:28px 24px;margin-bottom:20px;text-align:center;">
      <div style="color:#FFB612;font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">WEEKLY REPORT</div>
      <div style="color:#fff;font-size:24px;font-weight:900;margin-bottom:4px;">🏈 Hudson's BG Summary</div>
      <div style="color:rgba(255,255,255,0.6);font-size:13px;">${weekLabel}</div>
    </div>

    <!-- Overview -->
    <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;border:1px solid #E2D5F0;">
      <div style="font-weight:800;font-size:16px;color:#1A0033;margin-bottom:16px;">🎯 Week Overview</div>
      <div style="display:flex;gap:0;height:14px;border-radius:7px;overflow:hidden;margin-bottom:16px;">
        <div style="flex:${stats.tirPct};background:#27AE60;"></div>
        <div style="flex:${stats.highPct};background:#E84040;"></div>
        <div style="flex:${stats.lowPct};background:#F5A623;"></div>
      </div>
      <table width="100%" style="border-collapse:collapse;text-align:center;">
        <tr>
          <td><div style="font-size:28px;font-weight:900;color:#27AE60;">${stats.tirPct}%</div><div style="font-size:11px;color:#9B7FBB;">In Range</div></td>
          <td><div style="font-size:28px;font-weight:900;color:#E84040;">${stats.highPct}%</div><div style="font-size:11px;color:#9B7FBB;">High</div></td>
          <td><div style="font-size:28px;font-weight:900;color:#F5A623;">${stats.lowPct}%</div><div style="font-size:11px;color:#9B7FBB;">Low</div></td>
          <td><div style="font-size:28px;font-weight:900;color:#1A0033;">${stats.avg}</div><div style="font-size:11px;color:#9B7FBB;">Avg BG</div></td>
          <td><div style="font-size:28px;font-weight:900;color:#9B3FC8;">${stats.a1c}%</div><div style="font-size:11px;color:#9B7FBB;">Est. A1c</div></td>
        </tr>
      </table>
      <div style="text-align:center;margin-top:14px;font-size:12px;color:#9B7FBB;">Target range: ${rangeLow}–${rangeHigh} mg/dL · ${stats.total.toLocaleString()} readings</div>
    </div>

    <!-- Meal breakdown -->
    <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:16px;border:1px solid #E2D5F0;">
      <div style="font-weight:800;font-size:16px;color:#1A0033;margin-bottom:4px;">💉 Ratio Analysis by Meal</div>
      <div style="font-size:12px;color:#9B7FBB;margin-bottom:16px;">Confirm any ratio changes with Hudson's endocrinologist</div>
      <table width="100%" style="border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:left;font-size:11px;color:#9B7FBB;font-weight:700;padding-bottom:8px;">MEAL</th>
            <th style="text-align:center;font-size:11px;color:#9B7FBB;font-weight:700;padding-bottom:8px;">AVG</th>
            <th style="text-align:left;font-size:11px;color:#9B7FBB;font-weight:700;padding-bottom:8px;padding-left:16px;">RECOMMENDATION</th>
          </tr>
        </thead>
        <tbody>${mealRowsHtml}</tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#9B7FBB;font-size:11px;padding:16px 0;line-height:1.6;">
      💜 Keep going, Hudson — you're doing great<br>
      <a href="${process.env.APP_URL||"https://hudson-tracker.vercel.app"}" style="color:#9B3FC8;">Open Tracker</a>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  // Allow manual trigger via GET (for testing) or Vercel cron (GET with cron header)
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY not set" });

    // Load history from KV
    const allReadings = (await kv.get("hudson-bg-history")) ?? [];

    // Filter last 7 days
    const weekAgo  = Date.now() - 7*24*60*60*1000;
    const readings = allReadings.filter(r => r.ts >= weekAgo);

    if (readings.length < 10) {
      return res.status(200).json({ skipped: true, reason: "Not enough data", count: readings.length });
    }

    // Load settings from KV (stored there by bg-store, or use defaults)
    const ratios      = (await kv.get("hudson-ratios"))       || { breakfast:10, lunch:13, dinner:13, snack:15 };
    const mealWindows = (await kv.get("hudson-meal-windows")) || { breakfast:{start:5,end:10}, lunch:{start:10,end:14}, snack:{start:14,end:17}, dinner:{start:17,end:21} };
    const rangeLow    = (await kv.get("hudson-range-low"))    || 80;
    const rangeHigh   = (await kv.get("hudson-range-high"))   || 180;

    const stats = computeWeekStats(readings, rangeLow, rangeHigh, mealWindows);

    // Date range label
    const from = new Date(weekAgo).toLocaleDateString("en-US",{month:"short",day:"numeric"});
    const to   = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
    const weekLabel = `${from} – ${to}`;

    const html = buildHtml(stats, ratios, mealWindows, rangeLow, rangeHigh, weekLabel);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from:    FROM,
        to:      RECIPIENTS,
        subject: `🏈 Hudson's Weekly BG Report — ${weekLabel}`,
        html,
      }),
    });

    const emailJson = await emailRes.json();

    if (!emailRes.ok) {
      return res.status(500).json({ error: "Resend error", detail: emailJson });
    }

    return res.status(200).json({ sent: true, to: RECIPIENTS, id: emailJson.id, readings: readings.length });

  } catch(e) {
    return res.status(500).json({ error: String(e) });
  }
}
