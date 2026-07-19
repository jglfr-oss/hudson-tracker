// ═══ T1D Pulse — content safety ══════════════════════════════════════════════
// Flags individual items that promote dangerous ideas (stopping insulin, miracle
// cures, deliberate insulin omission, dangerous dosing, unapproved "cures").
// Callers reject flagged ITEMS but must NOT suppress the whole source because of
// one bad item.

import { UNSAFE_PATTERNS, DISTRESSING_PATTERNS } from "./config.js";

// Assess a piece of text. Returns { safe, reason, category }.
// Two independent checks:
//   "unsafe"      — promotes dangerous ideas (stopping insulin, fake cures)
//   "distressing" — frightening without being useful (near-death, ICU, despair)
// Both are rejected, but the reason is reported separately so the distinction
// stays visible in logs.
export function assessSafety(text) {
  const t = String(text || "");
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(t)) {
      return { safe: false, reason: `matched unsafe pattern: ${pattern}`, category: "unsafe" };
    }
  }
  for (const pattern of DISTRESSING_PATTERNS) {
    if (pattern.test(t)) {
      return { safe: false, reason: `matched distressing pattern: ${pattern}`, category: "distressing" };
    }
  }
  return { safe: true, reason: null, category: null };
}

// Filter a list of normalized items, dropping unsafe ones. Returns
// { safe: [...], rejected: number }. Never throws.
export function filterUnsafe(items) {
  const safe = [];
  let rejected = 0, rejectedUnsafe = 0, rejectedDistressing = 0;
  for (const item of items || []) {
    if (!item) continue;
    const verdict = assessSafety(`${item.title || ""} ${item.excerpt || ""}`);
    if (verdict.safe) {
      safe.push(item);
    } else {
      rejected++;
      if (verdict.category === "distressing") rejectedDistressing++;
      else rejectedUnsafe++;
    }
  }
  return { safe, rejected, rejectedUnsafe, rejectedDistressing };
}
