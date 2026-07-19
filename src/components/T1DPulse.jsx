// ═══ T1D Pulse — recent T1D news + trending community posts ══════════════════
// Mobile-first tab that reads /api/t1d-pulse (server aggregates & sanitizes all
// content). This component only renders already-sanitized text and http(s) URLs;
// it never injects raw HTML.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C, FONT } from "../theme.js";

const INITIAL_VISIBLE = 10;

// Friendly relative time: "just now", "2h ago", "3d ago".
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  const w = d / 7;
  if (w < 5) return `${Math.floor(w)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function compactNum(n) {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`.replace(".0k", "k");
  return `${(n / 1_000_000).toFixed(1)}M`.replace(".0M", "M");
}

// Platform display metadata. `kind` distinguishes source types WITHOUT relying
// on color (an icon + label is always shown).
const PLATFORM = {
  rss: { label: "News", icon: "📰", kind: "news" },
  googlenews: { label: "News", icon: "📰", kind: "news" },
  newsapi: { label: "News", icon: "📰", kind: "news" },
  pubmed: { label: "PubMed", icon: "🔬", kind: "journal" },
  youtube: { label: "YouTube", icon: "▶️", kind: "creator" },
  x: { label: "X", icon: "𝕏", kind: "community" },
  bluesky: { label: "Bluesky", icon: "🦋", kind: "community" },
  reddit: { label: "Reddit", icon: "👽", kind: "community" },
  unknown: { label: "Source", icon: "🔗", kind: "community" },
};

const CATEGORY_FILTERS = [
  ["all", "All"],
  ["research", "Research"],
  ["technology", "Technology"],
  ["treatment", "Treatment"],
  ["devices", "Devices"],
  ["community", "Community"],
];

const SOURCE_LABELS = {
  news: "News",
  youtube: "YouTube",
  bluesky: "Bluesky",
  x: "X",
  reddit: "Reddit",
};

const prefersReducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function T1DPulse() {
  const [tab, setTab] = useState("news"); // news | community
  const [filter, setFilter] = useState("all");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const liveRef = useRef(null);
  const reqSeq = useRef(0); // ignore out-of-order / post-unmount responses

  const load = useCallback(async (force = false) => {
    const seq = ++reqSeq.current;
    force ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/t1d-pulse${force ? "?refresh=1" : ""}`);
      const d = await r.json();
      if (seq !== reqSeq.current) return; // a newer request superseded this one
      if (!r.ok || !d || !Array.isArray(d.news)) {
        setError("Couldn't load the latest — try again in a moment.");
      } else {
        setData(d);
      }
    } catch {
      if (seq !== reqSeq.current) return;
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load(false);
    const seqRef = reqSeq;
    return () => { seqRef.current++; }; // invalidate in-flight request on unmount
  }, [load]);

  // Reset the visible count when switching tab or filter.
  useEffect(() => {
    setVisible(INITIAL_VISIBLE);
  }, [tab, filter]);

  const rawItems = data ? (tab === "news" ? data.news : data.community) : [];
  const items = useMemo(
    () => (filter === "all" ? rawItems : rawItems.filter((i) => i.category === filter)),
    [rawItems, filter]
  );
  const shown = items.slice(0, visible);

  // Which configured sources failed (for the partial-data warning).
  const failedSources = useMemo(() => {
    if (!data || !data.sourceStatus) return [];
    return Object.entries(data.sourceStatus)
      .filter(([, v]) => v === "error")
      .map(([k]) => SOURCE_LABELS[k] || k);
  }, [data]);

  return (
    <div className="slideUp" style={{ marginBottom: 20 }}>
      {/* Header: title + refresh */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, color: C.textDk, fontSize: 18 }}>💓 T1D Pulse</div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          aria-label="Refresh T1D Pulse"
          style={{
            display: "flex", alignItems: "center", gap: 6, background: C.tile, border: "none",
            borderRadius: 20, padding: "7px 13px", fontFamily: "inherit", fontSize: 12, fontWeight: 700,
            color: C.textDk, cursor: refreshing || loading ? "default" : "pointer",
            opacity: refreshing || loading ? 0.5 : 1,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              animation: refreshing && !prefersReducedMotion ? "t1dp-spin 0.8s linear infinite" : "none",
            }}
          >
            ↻
          </span>
          Refresh
        </button>
      </div>

      {/* Updated X ago */}
      <div style={{ fontSize: 11, color: C.textLt, fontWeight: 600, marginBottom: 12 }} aria-live="polite">
        {data ? `Updated ${timeAgo(data.generatedAt)}` : "Loading latest…"}
      </div>

      {/* News / Community sub-tabs */}
      <div role="tablist" aria-label="Pulse sections" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["news", "News"], ["community", "Community"]].map(([id, label]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 20, fontFamily: "inherit", fontWeight: 800,
                fontSize: 14, border: "none", cursor: "pointer",
                background: active ? C.textDk : C.tile, color: active ? "#fff" : C.textMd,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filter chips */}
      <div
        role="group"
        aria-label="Filter by category"
        style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 12, WebkitOverflowScrolling: "touch" }}
      >
        {CATEGORY_FILTERS.map(([id, label]) => {
          const active = filter === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(id)}
              style={{
                flex: "0 0 auto", padding: "6px 13px", borderRadius: 16, fontFamily: "inherit",
                fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                border: active ? `2px solid ${C.ravens}` : "2px solid transparent",
                background: active ? C.ravens + "14" : C.tile, color: active ? C.ravens : C.textMd,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Partial-data warning */}
      {!loading && failedSources.length > 0 && (
        <div
          role="status"
          style={{
            background: C.low + "14", border: `1.5px solid ${C.low}33`, borderRadius: 12,
            padding: "9px 12px", fontSize: 12, fontWeight: 600, color: "#9A6100", marginBottom: 12, lineHeight: 1.4,
          }}
        >
          ⚠️ Some sources didn’t respond ({failedSources.join(", ")}). Showing what loaded.
        </div>
      )}

      {/* Community safety disclaimer */}
      {tab === "community" && (
        <div
          style={{
            background: C.high + "0E", border: `1.5px solid ${C.high}33`, borderRadius: 12,
            padding: "10px 12px", fontSize: 11.5, fontWeight: 600, color: C.high, marginBottom: 12, lineHeight: 1.45,
          }}
        >
          ⚠️ Community posts are unverified and may contain incorrect medical information.
        </div>
      )}

      {/* Content */}
      <div ref={liveRef} aria-live="polite">
        {loading && <SkeletonList />}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "36px 16px", color: C.textMd }}>
            <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden="true">📡</div>
            <div style={{ fontWeight: 700, color: C.textDk, marginBottom: 8 }}>{error}</div>
            <button
              type="button"
              onClick={() => load(true)}
              style={{
                marginTop: 4, background: C.ravens, color: "#fff", border: "none", borderRadius: 12,
                padding: "9px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && shown.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.textMd }}>
            <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">
              {tab === "news" ? "📰" : "💬"}
            </div>
            <div style={{ fontWeight: 700, color: C.textDk, fontSize: 15 }}>
              Nothing to show{filter !== "all" ? " in this category" : ""} right now
            </div>
            <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              {filter !== "all"
                ? "Try “All”, or check back after the next refresh."
                : tab === "community"
                ? "No configured community sources returned recent posts yet."
                : "No recent Type 1 articles matched. Check back soon."}
            </div>
          </div>
        )}

        {!loading && !error && shown.map((item) => <PulseCard key={item.id} item={item} />)}

        {!loading && !error && items.length > visible && (
          <button
            type="button"
            onClick={() => setVisible((v) => v + INITIAL_VISIBLE)}
            style={{
              width: "100%", marginTop: 6, background: C.tile, border: "none", borderRadius: 14,
              padding: "12px 0", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: C.textDk, cursor: "pointer",
            }}
          >
            Show more ({items.length - visible} more)
          </button>
        )}
      </div>

      {/* Standing medical disclaimer */}
      <div
        style={{
          marginTop: 16, background: C.tile, borderRadius: 12, padding: "11px 13px",
          fontSize: 11, color: C.textMd, fontWeight: 600, lineHeight: 1.5,
        }}
      >
        Never change insulin, pump, CGM, or treatment settings based only on a news article or social post. Confirm
        treatment decisions with Hudson’s endocrinology team.
      </div>

      <style>{`
        @keyframes t1dp-spin { to { transform: rotate(360deg); } }
        @keyframes t1dp-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .t1dp-skel { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── One item card ────────────────────────────────────────────────────────────
function PulseCard({ item }) {
  const meta = PLATFORM[item.platform] || PLATFORM.unknown;
  const isCommunity = item.type === "community";
  const eng = item.engagement || {};
  const metrics = [];
  if (eng.views != null) metrics.push(["👁", compactNum(eng.views), "views"]);
  if (eng.likes != null) metrics.push(["❤", compactNum(eng.likes), "likes"]);
  if (eng.comments != null) metrics.push(["💬", compactNum(eng.comments), "comments"]);
  if (eng.shares != null) metrics.push(["🔁", compactNum(eng.shares), "shares"]);

  // Source-type label — text + icon, never color alone.
  const verified = item.verifiedSource;
  const trust = verified
    ? { icon: "✓", label: meta.kind === "journal" ? "Peer-reviewed" : "Verified source", color: C.inRange }
    : { icon: "•", label: meta.kind === "creator" ? "Creator" : "Community · unverified", color: C.textLt };

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${item.title} — ${item.source}, ${timeAgo(item.publishedAt)}. Opens in a new tab.`}
      style={{
        display: "flex", gap: 12, textDecoration: "none", background: C.white,
        border: `1px solid ${C.border}`, borderRadius: 14, padding: 12, marginBottom: 10, color: "inherit",
      }}
    >
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={`Thumbnail for “${item.title}”`}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{ width: 68, height: 68, borderRadius: 10, objectFit: "cover", flex: "0 0 auto", background: C.tile }}
        />
      )}

      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Badges row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 4, background: C.tile, borderRadius: 12,
              padding: "2px 8px", fontSize: 10.5, fontWeight: 800, color: C.textMd,
            }}
          >
            <span aria-hidden="true">{meta.icon}</span>
            {meta.label}
          </span>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700, color: trust.color,
            }}
          >
            <span aria-hidden="true">{trust.icon}</span>
            {trust.label}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: C.textLt, fontWeight: 700 }}>
            {timeAgo(item.publishedAt)}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontWeight: 800, color: C.textDk, fontSize: 14, lineHeight: 1.3, marginBottom: 3 }}>
          {item.title}
          <span aria-hidden="true" style={{ color: C.textLt, fontWeight: 700, marginLeft: 5, fontSize: 12 }}>↗</span>
        </div>

        {/* Excerpt */}
        {item.excerpt && (
          <div style={{ fontSize: 12, color: C.textMd, lineHeight: 1.4, marginBottom: 6,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.excerpt}
          </div>
        )}

        {/* Source + engagement */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: isCommunity ? C.ravens : C.textMd, minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
            {item.source}
          </span>
          {metrics.map(([icon, val, label]) => (
            <span key={label} aria-label={`${val} ${label}`} style={{ fontSize: 11, color: C.textLt, fontWeight: 700 }}>
              <span aria-hidden="true">{icon}</span> {val}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}

// ── Loading skeletons ────────────────────────────────────────────────────────
function SkeletonList() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="t1dp-skel"
          style={{
            display: "flex", gap: 12, background: C.white, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: 12, marginBottom: 10,
            animation: prefersReducedMotion ? "none" : "t1dp-pulse 1.4s ease-in-out infinite",
          }}
        >
          <div style={{ width: 68, height: 68, borderRadius: 10, background: C.tile, flex: "0 0 auto" }} />
          <div style={{ flex: 1 }}>
            <div style={{ width: "40%", height: 12, borderRadius: 6, background: C.tile, marginBottom: 8 }} />
            <div style={{ width: "90%", height: 14, borderRadius: 6, background: C.tile, marginBottom: 6 }} />
            <div style={{ width: "70%", height: 14, borderRadius: 6, background: C.tile, marginBottom: 10 }} />
            <div style={{ width: "50%", height: 10, borderRadius: 6, background: C.tile }} />
          </div>
        </div>
      ))}
    </div>
  );
}
