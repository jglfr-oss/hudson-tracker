// ═══ T1D Pulse — content safety ══════════════════════════════════════════════
// Flags individual items that promote dangerous ideas (stopping insulin, miracle
// cures, deliberate insulin omission, dangerous dosing, unapproved "cures").
// Callers reject flagged ITEMS but must NOT suppress the whole source because of
// one bad item.

import { UNSAFE_PATTERNS } from "./config.js";

// Assess a piece of text. Returns { safe: boolean, reason: string|null }.
export function assessSafety(text) {
  const t = String(text || "");
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(t)) {
      return { safe: false, reason: `matched unsafe pattern: ${pattern}` };
    }
  }
  return { safe: true, reason: null };
}

// Filter a list of normalized items, dropping unsafe ones. Returns
// { safe: [...], rejected: number }. Never throws.
export function filterUnsafe(items) {
  const safe = [];
  let rejected = 0;
  for (const item of items || []) {
    if (!item) continue;
    const verdict = assessSafety(`${item.title || ""} ${item.excerpt || ""}`);
    if (verdict.safe) {
      safe.push(item);
    } else {
      rejected++;
    }
  }
  return { safe, rejected };
}
