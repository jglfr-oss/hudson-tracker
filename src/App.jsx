import { useState, useEffect, useRef } from "react";

// ═══ Palette ═══════════════════════════════════════════════════════════════
const C = {
  navy:    "#0B2A4A",
  navyDk:  "#071C32",
  blue:    "#0076BE",
  teal:    "#00B4D8",
  white:   "#FFFFFF",
  offWhite:"#F0F6FB",
  border:  "#D6E8F5",
  textDk:  "#0B2A4A",
  textMd:  "#3A5F7D",
  textLt:  "#7FA8C4",
  low:     "#F5A623",
  high:    "#E84040",
  inRange: "#27AE60",
};

// ═══ Config ════════════════════════════════════════════════════════════════
const MEALS = [
  { id: "breakfast", label: "Breakfast", icon: "☀️",  defaultRatio: 10 },
  { id: "lunch",     label: "Lunch",     icon: "🌤️", defaultRatio: 12 },
  { id: "dinner",    label: "Dinner",    icon: "🌙",  defaultRatio: 12 },
  { id: "snack",     label: "Snack",     icon: "🍎",  defaultRatio: 15 },
];

const TARGET_LOW        = 80;
const TARGET_HIGH       = 180;
const CORRECTION_FACTOR = 50;
const TARGET_BG         = 120;
const DEXCOM_POLL_MS    = 5 * 60 * 1000; // 5 min

// ═══ Quotes ════════════════════════════════════════════════════════════════
const QUOTES = [
  { text: "You're stronger than any number on that meter.", attr: "Every single day" },
  { text: "Managing this takes more courage than most people will ever know.", attr: "Keep going" },
  { text: "Small steps every day add up to something extraordinary.", attr: "One meal at a time" },
  { text: "Diabetes doesn't define you — how you handle it does.", attr: "You've got this" },
  { text: "Every correct dose is a victory. Count them all.", attr: "Daily wins matter" },
  { text: "Hard days build the strongest people.", attr: "Hudson's journey" },
  { text: "You do something brave every single day that most never will.", attr: "Unsung strength" },
  { text: "Resilience isn't the absence of struggle — it's showing up anyway.", attr: "Keep showing up" },
  { text: "Champions are made in the moments nobody else sees.", attr: "Like every check and dose" },
  { text: "Your consistency today is your freedom tomorrow.", attr: "Stay the course" },
  { text: "The numbers are data, not judgment. Adjust and move forward.", attr: "Stay curious" },
  { text: "You handle more before breakfast than most handle all day.", attr: "True strength" },
  { text: "Worry less about perfect. Aim for consistent.", attr: "Progress beats perfection" },
  { text: "Your future self is proud of the choices you're making right now.", attr: "Trust the process" },
  { text: "You are not alone in this. Not even close.", attr: "We're all in your corner" },
  { text: "Every sunrise is a fresh start. Make it count.", attr: "New day, new chance" },
  { text: "One number doesn't tell your whole story.", attr: "You are so much more" },
  { text: "Take care of your body — it's the only place you have to live.", attr: "Jim Rohn" },
  { text: "It always seems impossible until it's done.", attr: "Nelson Mandela" },
  { text: "You were given this life because you are strong enough to live it.", attr: "Keep proving it" },
  { text: "Believe you can and you're halfway there.", attr: "Theodore Roosevelt" },
  { text: "Do what you can, with what you have, where you are.", attr: "Theodore Roosevelt" },
  { text: "Success is the sum of small efforts repeated day in and day out.", attr: "Robert Collier" },
  { text: "Life is tough, but so are you.", attr: "Without question" },
  { text: "Fall seven times, stand up eight.", attr: "Japanese proverb" },
  { text: "In the middle of difficulty lies opportunity.", attr: "Albert Einstein" },
  { text: "You have been assigned this mountain to show others it can be moved.", attr: "Keep climbing" },
  { text: "Every expert was once a beginner. You're becoming an expert.", attr: "At your own health" },
  { text: "Strength doesn't come from what you can do easily.", attr: "It comes from this" },
  { text: "The body you're in is fighting for you. Fight back with it.", attr: "Team effort" },
  { text: "You are braver than you believe and stronger than you seem.", attr: "A.A. Milne" },
  { text: "What you do every day matters more than what you do once in a while.", attr: "Gretchen Rubin" },
  { text: "Courage is not the absence of fear — it's choosing to act anyway.", attr: "Daily bravery" },
  { text: "Your only limit is the one you set in your mind.", attr: "Push past it" },
  { text: "Keep going. Everything you need will come to you at the right time.", attr: "Patience + persistence" },
  { text: "You've survived 100% of your hardest days so far.", attr: "That's a perfect record" },
];

// ═══ Dexcom trend helpers ═══════════════════════════════════════════════════
function trendArrow(trend) {
  // Dexcom returns either a number 1–9 or a string
  const map = {
    1: "↑↑", DoubleUp:       "↑↑",
    2: "↑",  SingleUp:       "↑",
    3: "↗",  FortyFiveUp:    "↗",
    4: "→",  Flat:           "→",
    5: "↘",  FortyFiveDown:  "↘",
    6: "↓",  SingleDown:     "↓",
    7: "↓↓", DoubleDown:     "↓↓",
    8: "?",  NotComputable:  "?",
    9: "⚠",  RateOutOfRange: "⚠",
  };
  return map[trend] ?? "→";
}

// ═══ Helpers ════════════════════════════════════════════════════════════════
function roundHalf(n) { return Math.round(n * 2) / 2; }

function getDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

function getBGStatus(bg) {
  if (!bg) return null;
  if (bg < TARGET_LOW)  return { label: "Low",      color: C.low     };
  if (bg > TARGET_HIGH) return { label: "High",     color: C.high    };
  return                       { label: "In Range", color: C.inRange };
}

function timeLabel() {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

function calcDose({ carbs, bg, mealId, ratios }) {
  const ratio      = ratios[mealId] ?? 12;
  const carbDose   = carbs / ratio;
  const correction = bg ? Math.max(0, (bg - TARGET_BG) / CORRECTION_FACTOR) : 0;
  return {
    carbDose:   roundHalf(carbDose),
    correction: roundHalf(correction),
    total:      Math.max(0, roundHalf(carbDose + correction)),
  };
}

// Ratios stored locally per device (each person can have their own)
const localStore = {
  get: (k, fallback = null) => {
    try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// Shared log stored on server so all devices see the same history
const sharedLog = {
  get: async () => {
    try {
      const r = await fetch("/api/log-get");
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  },
  save: async (log) => {
    try {
      await fetch("/api/log-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log }),
      });
    } catch {}
  },
};

// ═══ Atoms ═════════════════════════════════════════════════════════════════
function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.white, borderRadius: 18, border: `1px solid ${C.border}`,
      boxShadow: "0 2px 16px rgba(0,118,190,0.07)", padding: 20, ...style,
    }}>{children}</div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: color + "22", color, fontWeight: 700, fontSize: 12,
      borderRadius: 20, padding: "3px 10px",
    }}>{children}</span>
  );
}

function Btn({ onClick, children, variant = "primary", style = {}, disabled = false }) {
  const v = {
    primary:   { background: `linear-gradient(135deg,${C.blue},${C.teal})`, color: "#fff", boxShadow: `0 4px 18px ${C.blue}44`, border: "none" },
    secondary: { background: C.offWhite, color: C.blue, border: `1.5px solid ${C.border}` },
    danger:    { background: "#FFF0F0",  color: C.high, border: `1.5px solid #F5CCCC` },
  }[variant];
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      borderRadius: 30, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
      fontSize: 15, padding: "12px 28px", transition: "all .18s",
      fontFamily: "inherit", opacity: disabled ? 0.5 : 1, ...v, ...style,
    }}>{children}</button>
  );
}

function NumPad({ value, onChange, step = 1, min = 0, max = 500, unit = "" }) {
  const btnStyle = {
    width: 44, height: 44, borderRadius: "50%", border: `2px solid ${C.border}`,
    background: C.offWhite, fontSize: 22, cursor: "pointer", color: C.blue,
    display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <button type="button" style={btnStyle}
        onClick={() => onChange(Math.max(min, roundHalf(value - step)))}>−</button>
      <div style={{ minWidth: 80, textAlign: "center", fontSize: 28, fontWeight: 800, color: C.textDk }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: C.textLt, fontWeight: 500, marginLeft: 2 }}>{unit}</span>}
      </div>
      <button type="button" style={btnStyle}
        onClick={() => onChange(Math.min(max, roundHalf(value + step)))}>+</button>
    </div>
  );
}

// ═══ Dexcom Live BG Banner ══════════════════════════════════════════════════
function DexcomBanner({ data, loading, error, onUse, lastFetched }) {
  const value  = data?.value;
  const trend  = data?.trend;
  const age    = data?.ageMinutes ?? null;
  const status = value ? getBGStatus(value) : null;
  const color  = status?.color ?? C.textLt;

  return (
    <div style={{
      background: C.white, border: `1.5px solid ${C.border}`,
      borderRadius: 16, padding: "14px 16px", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        background: value ? color + "22" : C.offWhite,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: 18,
      }}>
        {loading && !data ? "⏳" : error ? "⚠️" : "📡"}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: C.textLt, marginBottom: 2 }}>
          Dexcom G7 · Live
        </div>
        {error ? (
          <div style={{ fontSize: 13, color: C.textMd, fontWeight: 600 }}>
            {error === "missing_credentials" ? "Not configured" : "Connection issue"}
          </div>
        ) : value ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 22, color, fontWeight: 700 }}>{trendArrow(trend)}</div>
            <div style={{ fontSize: 11, color: C.textLt, fontWeight: 600 }}>
              {age === 0 ? "just now" : `${age}m ago`}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.textMd, fontWeight: 600 }}>Loading…</div>
        )}
      </div>

      {value && (
        <button type="button" onClick={() => onUse(value)} style={{
          border: "none", background: `linear-gradient(135deg,${C.blue},${C.teal})`,
          color: "#fff", fontWeight: 800, fontSize: 12, padding: "8px 14px",
          borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
          boxShadow: `0 2px 10px ${C.blue}40`, flexShrink: 0,
        }}>Use</button>
      )}
    </div>
  );
}

// ═══ Daily Quote ════════════════════════════════════════════════════════════
function QuoteBanner() {
  const q = getDailyQuote();
  return (
    <div style={{
      background: `linear-gradient(135deg, #0D3B65 0%, #0076BE 100%)`,
      borderRadius: 18, padding: "18px 20px", marginBottom: 14,
      boxShadow: "0 4px 20px rgba(0,118,190,0.22)", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", right: 10, top: -10, fontSize: 80,
        color: "rgba(255,255,255,0.07)", fontWeight: 900, lineHeight: 1,
        fontFamily: "Georgia, serif", userSelect: "none",
      }}>"</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.teal, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
        ✨ Today's Motivation
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.5, marginBottom: 8 }}>
        "{q.text}"
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
        — {q.attr}
      </div>
    </div>
  );
}

// ═══ Settings Modal ═════════════════════════════════════════════════════════
function SettingsModal({ ratios, setRatios, onClose }) {
  const [local, setLocal] = useState({ ...ratios });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(7,28,50,0.72)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div style={{
        background: C.white, borderRadius: "24px 24px 0 0",
        padding: "24px 24px 48px", width: "100%", maxWidth: 480,
        boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
        animation: "slideUp .28s ease both",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border, margin: "0 auto 20px" }} />

        <div style={{ fontWeight: 900, fontSize: 19, color: C.textDk, marginBottom: 4 }}>⚙️ Insulin Ratios</div>
        <div style={{ color: C.textMd, fontSize: 13, marginBottom: 22 }}>
          1 unit of insulin covers this many grams of carbs
        </div>

        {MEALS.map(m => (
          <div key={m.id} style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, color: C.textDk, fontSize: 15, minWidth: 90 }}>
              {m.icon} {m.label}
            </div>
            <NumPad
              value={local[m.id] ?? m.defaultRatio}
              onChange={v => setLocal(p => ({ ...p, [m.id]: v }))}
              step={1} min={5} max={40} unit="g"
            />
          </div>
        ))}

        <div style={{
          background: C.offWhite, borderRadius: 12, padding: "10px 14px",
          color: C.textMd, fontSize: 12, marginBottom: 24,
        }}>
          📐 Correction: 1u drops BG by {CORRECTION_FACTOR} mg/dL · Target: {TARGET_BG} mg/dL
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Btn variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={() => { setRatios(local); onClose(); }} style={{ flex: 1 }}>Save Changes</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══ Log Row ════════════════════════════════════════════════════════════════
function LogRow({ entry, onDelete }) {
  const st   = getBGStatus(entry.bg);
  const meal = MEALS.find(m => m.id === entry.mealId);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "36px 1fr auto auto",
      alignItems: "center", gap: 10, padding: "10px 4px",
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 22, textAlign: "center" }}>{meal?.icon}</div>
      <div>
        <div style={{ fontWeight: 700, color: C.textDk, fontSize: 14 }}>
          {meal?.label} · <span style={{ color: C.textMd, fontWeight: 500 }}>{entry.time}</span>
        </div>
        <div style={{ fontSize: 12, color: C.textLt, marginTop: 1 }}>
          {entry.carbs}g carbs{entry.bg ? ` · BG ${entry.bg}` : ""}
        </div>
      </div>
      {st && <Badge color={st.color}>{entry.bg}</Badge>}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.blue }}>{entry.dose}u</div>
        <button type="button" onClick={() => onDelete(entry.id)} style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.textLt, fontSize: 11, padding: "2px 0", fontFamily: "inherit",
        }}>remove</button>
      </div>
    </div>
  );
}

// ═══ Main App ══════════════════════════════════════════════════════════════
export default function App() {
  const [tab,          setTab         ] = useState("dose");
  const [mealId,       setMealId      ] = useState(timeLabel);
  const [carbs,        setCarbs       ] = useState(30);
  const [bg,           setBg          ] = useState(120);
  const [bgEntered,    setBgEntered   ] = useState(false);
  const [ratios,       setRatios      ] = useState({ breakfast: 10, lunch: 12, dinner: 12, snack: 15 });
  const [log,          setLog         ] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmed,    setConfirmed   ] = useState(false);

  // Dexcom state
  const [dex,         setDex        ] = useState(null);
  const [dexLoading,  setDexLoading ] = useState(true);
  const [dexError,    setDexError   ] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);
  const pollRef = useRef();

  // Load shared log from server + ratios locally per device
  useEffect(() => {
    sharedLog.get().then(setLog);
    setRatios(localStore.get("hud-ratios", { breakfast: 10, lunch: 12, dinner: 12, snack: 15 }));
  }, []);

  // Dexcom polling
  useEffect(() => {
    const fetchDex = async () => {
      try {
        const r = await fetch("/api/dexcom");
        const j = await r.json();
        if (j.error) {
          setDexError(j.error);
          setDex(null);
        } else {
          setDex(j);
          setDexError(null);
        }
      } catch (e) {
        setDexError("network");
      } finally {
        setDexLoading(false);
        setLastFetched(Date.now());
      }
    };

    fetchDex();
    pollRef.current = setInterval(fetchDex, DEXCOM_POLL_MS);

    // Refresh when tab becomes visible
    const onVisible = () => { if (document.visibilityState === "visible") fetchDex(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const saveRatios = (r) => {
    setRatios(r);
    localStore.set("hud-ratios", r);
  };

  const useDexcomBg = (value) => {
    setBg(value);
    setBgEntered(true);
  };

  const dose   = calcDose({ carbs, bg: bgEntered ? bg : 0, mealId, ratios });
  const meal   = MEALS.find(m => m.id === mealId);
  const bgSt   = bgEntered && bg > 0 ? getBGStatus(bg) : null;
  const today  = new Date().toLocaleDateString();
  const todayE = log.filter(e => e.date === today);

  const handleLog = () => {
    const now = new Date();
    const entry = {
      id:    Date.now(),
      mealId,
      carbs,
      bg:    bgEntered && bg > 0 ? bg : null,
      dose:  dose.total,
      time:  now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date:  now.toLocaleDateString(),
    };
    const next = [entry, ...log].slice(0, 100);
    setLog(next);
    sharedLog.save(next);
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 2500);
  };

  const removeEntry = (id) => {
    const next = log.filter(e => e.id !== id);
    setLog(next);
    sharedLog.save(next);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; }
        body { background: ${C.offWhite}; font-family: 'Nunito', -apple-system, sans-serif; }
        ::-webkit-scrollbar { display: none; }
        @keyframes pop { 0%{transform:scale(.88);opacity:0} 60%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
        @keyframes slideUp { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
        .pop { animation: pop .25s ease both; }
        .slideUp { animation: slideUp .3s ease both; }
      `}</style>

      <div style={{
        fontFamily: "'Nunito', sans-serif",
        minHeight: "100vh", background: C.offWhite,
        maxWidth: 480, margin: "0 auto", paddingBottom: 90,
      }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(160deg, ${C.navyDk} 0%, ${C.navy} 55%, #0D3B65 100%)`,
          padding: "52px 24px 24px", position: "relative", overflow: "hidden",
        }}>
          <div style={{ position:"absolute", right:-60, top:-60, width:200, height:200,
            borderRadius:"50%", border:"40px solid rgba(0,180,216,0.10)", pointerEvents:"none" }} />
          <div style={{ position:"absolute", right:30, bottom:-30, width:120, height:120,
            borderRadius:"50%", border:"25px solid rgba(0,180,216,0.06)", pointerEvents:"none" }} />

          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ color:C.teal, fontSize:11, fontWeight:800, letterSpacing:2, textTransform:"uppercase" }}>
                Insulin Tracker
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                <div style={{ color:"#fff", fontSize:26, fontWeight:900, lineHeight:1.1 }}>
                  Hey Hudson 👋
                </div>
                {/* Live BG in header */}
                {dex?.value ? (
                  <div style={{
                    display:"flex", alignItems:"center", gap:6,
                    background:"rgba(255,255,255,0.12)",
                    border:"1.5px solid rgba(255,255,255,0.18)",
                    borderRadius:30, padding:"5px 14px",
                  }}>
                    <div style={{
                      width:8, height:8, borderRadius:"50%",
                      background: dex.value < TARGET_LOW ? C.low : dex.value > TARGET_HIGH ? C.high : C.inRange,
                      boxShadow: `0 0 6px ${dex.value < TARGET_LOW ? C.low : dex.value > TARGET_HIGH ? C.high : C.inRange}`,
                    }} />
                    <span style={{ color:"#fff", fontWeight:900, fontSize:20 }}>{dex.value}</span>
                    <span style={{ color:C.teal, fontWeight:800, fontSize:18 }}>{trendArrow(dex.trend)}</span>
                    {dex.ageMinutes > 0 && (
                      <span style={{ color:"rgba(255,255,255,0.45)", fontSize:10, fontWeight:600 }}>{dex.ageMinutes}m</span>
                    )}
                  </div>
                ) : dexLoading ? (
                  <div style={{
                    background:"rgba(255,255,255,0.08)", borderRadius:30,
                    padding:"5px 14px", color:"rgba(255,255,255,0.4)", fontSize:12, fontWeight:600,
                  }}>📡 Connecting…</div>
                ) : null}
              </div>
              <div style={{ color:"rgba(255,255,255,0.45)", fontSize:13, marginTop:4 }}>
                {new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(true)}
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.20)",
                borderRadius: 12, width: 44, height: 44, cursor: "pointer",
                fontSize: 20, display: "flex", alignItems: "center",
                justifyContent: "center", flexShrink: 0, padding: 0, marginLeft: 12,
              }}
            >⚙️</button>
          </div>

          <div style={{
            marginTop: 20, background: "rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "12px 16px", display: "flex", gap: 28,
          }}>
            {[
              { label: "Doses",         value: todayE.length || "—" },
              { label: "Total carbs",   value: todayE.length ? todayE.reduce((s,e)=>s+e.carbs,0)+"g" : "—" },
              { label: "Total insulin", value: todayE.length ? todayE.reduce((s,e)=>s+e.dose,0)+"u" : "—" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ color:"#fff", fontWeight:800, fontSize:18 }}>{s.value}</div>
                <div style={{ color:"rgba(255,255,255,0.45)", fontSize:11, fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div style={{
          display:"flex", background:C.white, borderBottom:`1px solid ${C.border}`,
          position:"sticky", top:0, zIndex:10,
        }}>
          {[["dose","💉 Calculate"],["log","📋 History"]].map(([id,label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{
              flex:1, padding:"14px 0", border:"none", background:"none", cursor:"pointer",
              fontWeight:700, fontSize:14, fontFamily:"inherit",
              color: tab===id ? C.blue : C.textLt,
              borderBottom: tab===id ? `3px solid ${C.blue}` : "3px solid transparent",
              transition:"all .18s",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding:"16px 16px 0" }}>
          <QuoteBanner />
        </div>

        <div style={{ padding:"0 16px" }}>

          {tab === "dose" && (
            <div className="slideUp">
              {/* Meal selector */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:14 }}>
                {MEALS.map(m => (
                  <button key={m.id} type="button" onClick={() => setMealId(m.id)} style={{
                    border: mealId===m.id ? `2.5px solid ${C.blue}` : `2px solid ${C.border}`,
                    background: mealId===m.id ? `${C.blue}11` : C.white,
                    borderRadius:14, padding:"10px 4px", cursor:"pointer",
                    textAlign:"center", transition:"all .18s", fontFamily:"inherit",
                  }}>
                    <div style={{ fontSize:22 }}>{m.icon}</div>
                    <div style={{ fontSize:11, fontWeight:700, marginTop:2, color: mealId===m.id ? C.blue : C.textMd }}>
                      {m.label}
                    </div>
                  </button>
                ))}
              </div>

              {/* Carbs */}
              <Card style={{ marginBottom:12 }}>
                <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:14 }}>🍽️ Carbohydrates</div>
                <NumPad value={carbs} onChange={setCarbs} step={5} min={0} max={300} unit="g" />
                <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:14, flexWrap:"wrap" }}>
                  {[15,30,45,60,75,90].map(v => (
                    <button key={v} type="button" onClick={() => setCarbs(v)} style={{
                      padding:"5px 12px", borderRadius:20, fontFamily:"inherit",
                      border: carbs===v ? `2px solid ${C.blue}` : `1.5px solid ${C.border}`,
                      background: carbs===v ? `${C.blue}18` : C.offWhite,
                      color: carbs===v ? C.blue : C.textMd, fontWeight:700, fontSize:13, cursor:"pointer",
                    }}>{v}g</button>
                  ))}
                </div>
              </Card>

              {/* Blood Sugar */}
              <Card style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                  <div style={{ fontWeight:800, color:C.textDk, fontSize:15 }}>🩸 Blood Sugar</div>
                  <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
                    <span style={{ fontSize:12, color:C.textMd, fontWeight:600 }}>Correction</span>
                    <div onClick={() => setBgEntered(p => !p)} style={{
                      width:42, height:24, borderRadius:12, cursor:"pointer",
                      background: bgEntered ? C.blue : C.border, transition:"background .2s",
                      position:"relative", flexShrink:0,
                    }}>
                      <div style={{
                        position:"absolute", top:3, left: bgEntered ? 21 : 3,
                        width:18, height:18, borderRadius:"50%", background:"#fff",
                        transition:"left .2s", boxShadow:"0 1px 4px rgba(0,0,0,.25)",
                      }} />
                    </div>
                  </label>
                </div>

                {bgEntered ? (
                  <>
                    <NumPad value={bg} onChange={setBg} step={5} min={0} max={600} />
                    <div style={{ textAlign:"center", marginTop:8 }}>
                      {bgSt && <Badge color={bgSt.color}>{bgSt.label} · {bg} mg/dL</Badge>}
                    </div>
                    {dex?.value && (
                      <div style={{ textAlign:"center", marginTop:10 }}>
                        <button type="button" onClick={() => setBg(dex.value)} style={{
                          background:"none", border:`1.5px solid ${C.border}`,
                          borderRadius:20, padding:"5px 12px", fontSize:12, fontWeight:700,
                          color:C.blue, cursor:"pointer", fontFamily:"inherit",
                        }}>
                          📡 Pull from Dexcom ({dex.value} {trendArrow(dex.trend)})
                        </button>
                      </div>
                    )}
                    <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:12, flexWrap:"wrap" }}>
                      {[80,100,120,150,180,220,280].map(v => (
                        <button key={v} type="button" onClick={() => setBg(v)} style={{
                          padding:"5px 10px", borderRadius:20, fontFamily:"inherit",
                          border: bg===v ? `2px solid ${C.blue}` : `1.5px solid ${C.border}`,
                          background: bg===v ? `${C.blue}18` : C.offWhite,
                          color: bg===v ? C.blue : C.textMd, fontWeight:700, fontSize:12, cursor:"pointer",
                        }}>{v}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign:"center", color:C.textLt, fontSize:13 }}>
                    Toggle on to include a correction dose
                  </div>
                )}
              </Card>

              {/* Dose */}
              <Card style={{
                background:`linear-gradient(135deg, ${C.navy} 0%, #0D4A80 100%)`,
                border:"none", marginBottom:14, position:"relative", overflow:"hidden",
              }}>
                <div style={{ position:"absolute", right:-30, top:-30, width:130, height:130,
                  borderRadius:"50%", background:"rgba(0,180,216,.10)", pointerEvents:"none" }} />
                <div style={{ color:"rgba(255,255,255,.6)", fontSize:11, fontWeight:800,
                  letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 }}>
                  Recommended Dose
                </div>
                <div style={{ display:"flex", alignItems:"baseline", gap:6, marginBottom:16 }}>
                  <div className="pop" key={dose.total} style={{
                    fontSize:64, fontWeight:900, color:"#fff", lineHeight:1,
                  }}>{dose.total}</div>
                  <div style={{ fontSize:22, color:C.teal, fontWeight:800 }}>units</div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  {[
                    { label:"Meal dose",            val: dose.carbDose   + "u" },
                    { label:"Correction",            val: dose.correction + "u" },
                    { label:`1:${ratios[mealId]}g`,  val: carbs + "g" },
                  ].map(b => (
                    <div key={b.label} style={{
                      background:"rgba(255,255,255,.09)", borderRadius:12,
                      padding:"8px 10px", flex:1, textAlign:"center",
                    }}>
                      <div style={{ color:"rgba(255,255,255,.55)", fontSize:10, fontWeight:700 }}>{b.label}</div>
                      <div style={{ color:"#fff", fontSize:17, fontWeight:800 }}>{b.val}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Btn onClick={handleLog} disabled={carbs === 0}
                style={{ width:"100%", fontSize:16, padding:"15px 0" }}>
                {confirmed ? "✓ Logged!" : `Log ${dose.total}u for ${meal?.label}`}
              </Btn>
              <div style={{ textAlign:"center", color:C.textLt, fontSize:11, margin:"10px 0 20px" }}>
                Always verify with your diabetes care team · Rounds to nearest 0.5u
              </div>
            </div>
          )}

          {tab === "log" && (
            <div className="slideUp">
              {log.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 0", color:C.textLt }}>
                  <div style={{ fontSize:48, marginBottom:12 }}>💉</div>
                  <div style={{ fontWeight:700, fontSize:16 }}>No doses logged yet</div>
                  <div style={{ fontSize:13, marginTop:6 }}>Go to Calculate to get started</div>
                </div>
              ) : (
                <>
                  {[...new Set(log.map(e => e.date))].map(date => (
                    <div key={date} style={{ marginBottom:16 }}>
                      <div style={{ fontWeight:800, color:C.textMd, fontSize:12,
                        letterSpacing:1, textTransform:"uppercase", marginBottom:8, paddingLeft:4 }}>
                        {date === today ? "Today" : date}
                      </div>
                      <Card>
                        {log.filter(e => e.date === date).map(entry => (
                          <LogRow key={entry.id} entry={entry} onDelete={removeEntry} />
                        ))}
                      </Card>
                    </div>
                  ))}
                  <div style={{ textAlign:"center", marginTop:8, paddingBottom:20 }}>
                    <Btn variant="danger"
                      onClick={() => { setLog([]); sharedLog.save([]); }}
                      style={{ fontSize:12, padding:"8px 20px" }}>
                      Clear All History
                    </Btn>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{
          position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
          width:"100%", maxWidth:480, background:C.white,
          borderTop:`1px solid ${C.border}`, display:"flex",
          padding:"8px 0 20px", zIndex:50,
        }}>
          {[["dose","💉","Calculate"],["log","📋","History"]].map(([id,icon,label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} style={{
              flex:1, background:"none", border:"none", cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center",
              gap:2, fontFamily:"inherit",
            }}>
              <div style={{ fontSize:24 }}>{icon}</div>
              <div style={{ fontSize:11, fontWeight:700, color:tab===id ? C.blue : C.textLt }}>{label}</div>
              {tab===id && <div style={{ width:20, height:3, borderRadius:2, background:C.blue, marginTop:2 }} />}
            </button>
          ))}
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          ratios={ratios}
          setRatios={saveRatios}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
