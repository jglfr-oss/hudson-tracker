// ═══ T1D Pulse — HTTP helpers with per-request timeouts ══════════════════════
import { SOURCE_TIMEOUT_MS } from "./config.js";

const UA = "HudsonTracker-T1DPulse/1.0 (+family health dashboard)";

// fetch() with an AbortController timeout. Throws on network error / non-2xx /
// timeout so callers can catch per-source.
export async function fetchWithTimeout(url, opts = {}, timeoutMs = SOURCE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { "User-Agent": UA, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${hostOf(url)}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url, opts, timeoutMs) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  return res.text();
}

export async function fetchJson(url, opts, timeoutMs) {
  const res = await fetchWithTimeout(url, opts, timeoutMs);
  return res.json();
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "url";
  }
}
