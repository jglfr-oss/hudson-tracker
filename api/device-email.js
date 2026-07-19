// lib/device-email.js — shared helper: mirrors device push notifications
// to email via Resend, for family members who read email but not pushes.
//
// Env:
//   RESEND_API_KEY   — already set (weekly report uses it)
//   DEVICE_EMAIL_TO  — comma-separated recipients (e.g. wife's address)
//   REPORT_FROM      — optional sender, defaults to Resend's free-tier sender
//
// Fire-and-forget by design: an email failure must never block a push.
export async function sendDeviceEmail(title, bodyText) {
  const apiKey = process.env.RESEND_API_KEY;
  const toRaw  = process.env.DEVICE_EMAIL_TO;
  if (!apiKey || !toRaw) return { sent: false, reason: "not_configured" };

  const to = toRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (to.length === 0) return { sent: false, reason: "no_recipients" };

  const from = process.env.REPORT_FROM || "Hudson Tracker <onboarding@resend.dev>";

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px">
      <h2 style="color:#241773;margin:0 0 4px">${escapeHtml(title)}</h2>
      <p style="font-size:15px;line-height:1.6;color:#333;white-space:pre-line;margin:8px 0 16px">${escapeHtml(bodyText)}</p>
      <a href="https://hudson-tracker.vercel.app/?open=sites"
         style="display:inline-block;background:#241773;color:#fff;text-decoration:none;
                padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px">
        Open Device Management
      </a>
      <p style="font-size:11px;color:#999;margin-top:18px">Hudson Tracker · automated device reminder</p>
    </div>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: title, html, text: bodyText }),
    });
    const j = await r.json().catch(() => ({}));
    return { sent: r.ok, id: j.id, status: r.status };
  } catch (e) {
    return { sent: false, reason: String(e && e.message || e) };
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
