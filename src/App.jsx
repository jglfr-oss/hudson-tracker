import { useState, useEffect, useRef, useMemo } from "react";
import T1DPulse from "./components/T1DPulse.jsx";

// ═══ Ravens Palette ══════════════════════════════════════════════════════════
const C = {
  navy:    "#FFFFFF",
  navyDk:  "#FFFFFF",
  blue:    "#241773",
  teal:    "#8A8A8E",
  white:   "#FFFFFF",
  offWhite:"#FFFFFF",
  tile:    "#F2F2F4",
  border:  "#E8E8EC",
  textDk:  "#1C1C1E",
  textMd:  "#6E6E73",
  textLt:  "#9A9AA0",
  low:     "#FF9500",
  high:    "#E8434C",
  inRange: "#31B057",
  band:    "#EFEFF1",
  ravens:  "#241773",
  gold:    "#9E7C0C",
};

// ═══ Config ═══════════════════════════════════════════════════════════════════
const FONT = "'Nunito Sans',-apple-system,BlinkMacSystemFont,sans-serif";

const MEALS = [
  { id:"breakfast", label:"Breakfast", icon:"☀️",  defaultRatio:10 },
  { id:"lunch",     label:"Lunch",     icon:"🌤️", defaultRatio:16 },
  { id:"dinner",    label:"Dinner",    icon:"🌙",  defaultRatio:13 },
  { id:"snack",     label:"Snack",     icon:"🍎",  defaultRatio:13 },
];


// ═══ Device icons — orange pod, green sensor ═════════════════════════════════
const POD_ORANGE  = "#F79E1B";
const SENSOR_GREEN = "#3BA55D";

function PodIcon({ size=20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:"block" }}>
      <path d="M4 9.5 C4 5.4 7.6 3 12 3 C16.4 3 20 5.4 20 9.5 L20 15 C20 18.9 16.4 21 12 21 C7.6 21 4 18.9 4 15 Z"
        fill={POD_ORANGE}/>
    </svg>
  );
}

function SensorIcon({ size=20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display:"block" }}>
      <circle cx="12" cy="12" r="9.5" fill={SENSOR_GREEN}/>
      <circle cx="12" cy="12" r="5" fill="none" stroke="#FFFFFF" strokeWidth="2.4"/>
    </svg>
  );
}

function DevIcon({ device, size=20 }) {
  return device === "sensor" ? <SensorIcon size={size}/> : <PodIcon size={size}/>;
}

// ═══ Device site tracking ════════════════════════════════════════════════════
// Pods last ~3 days, G7 sensors ~10 days.
const DEVICES = {
  pod:    { label:"Pod",    icon:"💊", wearDays:3,  color:"#9B3FC8" },
  sensor: { label:"Sensor", icon:"📡", wearDays:10, color:"#0EA5A5" },
};

const SITE_OPTIONS = {
  pod: [
    "Abdomen — L", "Abdomen — R",
    "Lower back — L", "Lower back — R",
    "Upper arm — L", "Upper arm — R",
    "Thigh — L", "Thigh — R",
  ],
  sensor: [
    "Upper arm — L", "Upper arm — R",
    "Abdomen — L", "Abdomen — R",
    "Thigh — L", "Thigh — R",
    "Lower back — L", "Lower back — R",
    "Upper buttock — L", "Upper buttock — R",
  ],
};

// These are defaults — overridden by user settings stored in localStore
let TARGET_LOW  = 80;
let TARGET_HIGH = 180;
const CORRECTION_FACTOR = 50;
const TARGET_BG         = 120;
const DEXCOM_POLL_MS    = 5 * 60 * 1000;

// ═══ Quotes ══════════════════════════════════════════════════════════════════
const QUOTES = [
  { text:"Mark Andrews plays in the NFL with T1D. You can do anything.", attr:"#89 · Mark Andrews" },
  { text:"Managing this takes more courage than most people will ever know.", attr:"Keep going" },
  { text:"Small steps every day add up to something extraordinary.", attr:"One meal at a time" },
  { text:"Diabetes doesn't define you — how you handle it does.", attr:"You've got this" },
  { text:"Every correct dose is a victory. Count them all.", attr:"Daily wins matter" },
  { text:"Hard days build the strongest people.", attr:"Hudson's journey" },
  { text:"You do something brave every single day that most never will.", attr:"Unsung strength" },
  { text:"Resilience isn't the absence of struggle — it's showing up anyway.", attr:"Keep showing up" },
  { text:"Champions are made in the moments nobody else sees.", attr:"Like every check and dose" },
  { text:"Your consistency today is your freedom tomorrow.", attr:"Stay the course" },
  { text:"The numbers are data, not judgment. Adjust and move forward.", attr:"Stay curious" },
  { text:"You handle more before breakfast than most handle all day.", attr:"True strength" },
  { text:"Worry less about perfect. Aim for consistent.", attr:"Progress beats perfection" },
  { text:"Your future self is proud of the choices you're making right now.", attr:"Trust the process" },
  { text:"You are not alone in this. Not even close.", attr:"We're all in your corner" },
  { text:"Every sunrise is a fresh start. Make it count.", attr:"New day, new chance" },
  { text:"One number doesn't tell your whole story.", attr:"You are so much more" },
  { text:"Take care of your body — it's the only place you have to live.", attr:"Jim Rohn" },
  { text:"It always seems impossible until it's done.", attr:"Nelson Mandela" },
  { text:"You were given this life because you are strong enough to live it.", attr:"Keep proving it" },
  { text:"Believe you can and you're halfway there.", attr:"Theodore Roosevelt" },
  { text:"Success is the sum of small efforts repeated day in and day out.", attr:"Robert Collier" },
  { text:"Life is tough, but so are you.", attr:"Without question" },
  { text:"Fall seven times, stand up eight.", attr:"Japanese proverb" },
  { text:"In the middle of difficulty lies opportunity.", attr:"Albert Einstein" },
  { text:"You've survived 100% of your hardest days so far.", attr:"That's a perfect record" },
  { text:"You are braver than you believe and stronger than you seem.", attr:"A.A. Milne" },
  { text:"Courage is not the absence of fear — it's choosing to act anyway.", attr:"Daily bravery" },
  { text:"Keep going. Everything you need will come to you at the right time.", attr:"Patience + persistence" },
];

// ═══ Helpers ══════════════════════════════════════════════════════════════════
function roundHalf(n) { return Math.round(n * 2) / 2; }

function getDailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  return QUOTES[Math.floor((Date.now() - start) / 86400000) % QUOTES.length];
}

function getBGStatus(bg) {
  if (!bg) return null;
  if (bg < TARGET_LOW)  return { label:"Low",      color:C.low     };
  if (bg > TARGET_HIGH) return { label:"High",     color:C.high    };
  return                       { label:"In Range", color:C.inRange };
}

function timeLabel() {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

function calcDose({ carbs, bg, mealId, ratios }) {
  const ratio      = ratios[mealId] ?? 13;
  const carbDose   = carbs / ratio;
  const correction = bg ? Math.max(0, (bg - TARGET_BG) / CORRECTION_FACTOR) : 0;
  return { carbDose:roundHalf(carbDose), correction:roundHalf(correction), total:Math.max(0,roundHalf(carbDose+correction)) };
}

function trendArrow(trend) {
  const map = { 1:"↑↑",DoubleUp:"↑↑", 2:"↑",SingleUp:"↑", 3:"↗",FortyFiveUp:"↗",
                4:"→",Flat:"→", 5:"↘",FortyFiveDown:"↘", 6:"↓",SingleDown:"↓",
                7:"↓↓",DoubleDown:"↓↓", 8:"?",NotComputable:"?", 9:"⚠",RateOutOfRange:"⚠" };
  return map[trend] ?? "→";
}

const localStore = {
  get: (k, fb=null) => { try { const v=localStorage.getItem(k); return v===null?fb:JSON.parse(v); } catch { return fb; } },
  set: (k, v)      => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const sharedLog = {
  get:  async () => { try { const r=await fetch("/api/log-get"); return r.ok?await r.json():[]; } catch { return []; } },
  save: async (log) => { try { await fetch("/api/log-save",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({log}) }); } catch {} },
};

const sharedSites = {
  get:  async () => { try { const r=await fetch("/api/site-log"); return r.ok?await r.json():[]; } catch { return []; } },
  save: async (sites) => { try { await fetch("/api/site-log",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({sites}) }); } catch {} },
};

// ═══ Analytics helpers ════════════════════════════════════════════════════════
const DEFAULT_MEAL_WINDOWS = {
  breakfast: { start:5,  end:10 },
  lunch:     { start:10, end:14 },
  snack:     { start:14, end:17 },
  dinner:    { start:17, end:21 },
};

function mealWindowFor(hour, windows) {
  const w = windows || DEFAULT_MEAL_WINDOWS;
  if (hour >= w.breakfast.start && hour < w.breakfast.end) return "breakfast";
  if (hour >= w.lunch.start     && hour < w.lunch.end)     return "lunch";
  if (hour >= w.snack.start     && hour < w.snack.end)     return "snack";
  if (hour >= w.dinner.start    && hour < w.dinner.end)    return "dinner";
  return "overnight";
}

function computeStats(readings, mealWindows) {
  if (!readings || readings.length === 0) return null;
  const vals = readings.map(r => r.value);
  const avg = Math.round(vals.reduce((a,b)=>a+b,0) / vals.length);
  const inRange = readings.filter(r => r.value >= TARGET_LOW && r.value <= TARGET_HIGH).length;
  const low     = readings.filter(r => r.value <  TARGET_LOW).length;
  const high    = readings.filter(r => r.value >  TARGET_HIGH).length;
  const tirPct  = Math.round(inRange / readings.length * 100);
  const lowPct  = Math.round(low     / readings.length * 100);
  const highPct = Math.round(high    / readings.length * 100);

  // Estimated A1c (ADAG formula)
  const a1c = ((avg + 46.7) / 28.7).toFixed(1);

  // Average by meal window
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

  // Day-of-week averages
  const byDay = Array(7).fill(null).map(()=>({ sum:0, count:0 }));
  readings.forEach(r => {
    const d = new Date(r.ts).getDay();
    byDay[d].sum   += r.value;
    byDay[d].count += 1;
  });
  const dayAvgs = byDay.map(d => d.count > 0 ? Math.round(d.sum/d.count) : null);

  return { avg, tirPct, lowPct, highPct, a1c, byWindow, dayAvgs, total:readings.length };
}

// Insight metrics. Longer-horizon tiles follow the selected period; the
// "right now" tiles (3h / 24h) always reflect the most recent data.
function computeInsights(periodReadings, allReadings, mealWindows, fromTs, toTs) {
  const P = periodReadings || [];
  const A = allReadings || [];
  if (P.length === 0 && A.length === 0) return null;

  const now = Date.now();
  const recent  = ms => A.filter(r => now - r.ts <= ms);
  const inHours = (list, h1, h2) => list.filter(r => { const h = new Date(r.ts).getHours(); return h >= h1 && h <= h2; });
  const mean = list => list.length ? list.reduce((a,b)=>a+b.value,0)/list.length : null;
  const avg  = list => { const m = mean(list); return m === null ? null : Math.round(m); };

  const h24 = recent(86400000), h3 = recent(3*3600000);

  // GMI over the selected period
  const meanP = mean(P);
  const gmi = meanP !== null ? (3.31 + 0.02392*meanP).toFixed(1) : null;

  // Std dev over the selected period
  let sd = null;
  if (P.length > 1 && meanP !== null) {
    sd = Math.round(Math.sqrt(P.reduce((a,b)=>a+(b.value-meanP)**2,0)/P.length));
  }

  // Quartiles over the selected period
  let q = null;
  if (P.length >= 4) {
    const vals = P.map(r=>r.value).sort((a,b)=>a-b);
    const at = pc => vals[Math.min(vals.length-1, Math.floor(pc*vals.length))];
    q = { p25: at(0.25), p50: at(0.5), p75: at(0.75) };
  }

  const tir = list => {
    if (!list.length) return { inR:null, above:null, below:null };
    return {
      inR:   Math.round(list.filter(r=>r.value>=TARGET_LOW&&r.value<=TARGET_HIGH).length/list.length*100),
      above: Math.round(list.filter(r=>r.value>TARGET_HIGH).length/list.length*100),
      below: Math.round(list.filter(r=>r.value<TARGET_LOW).length/list.length*100),
    };
  };
  const t24 = tir(h24);
  const tP  = tir(P);

  // Overnight = hours outside the configured meal windows (same rule as Trends)
  const isON = r => mealWindowFor(new Date(r.ts).getHours(), mealWindows) === "overnight";
  const overnight = P.filter(isON);
  const onHighs = overnight.filter(r => r.value > TARGET_HIGH).length;
  const onLows  = overnight.filter(r => r.value < TARGET_LOW).length;

  // Compare against the equal-length period immediately before this one
  let onPrev = null;
  if (fromTs && toTs) {
    const span = toTs - fromTs;
    const prev = A.filter(r => r.ts >= fromTs - span && r.ts < fromTs);
    if (prev.length >= P.length * 0.5 && prev.length > 0) {
      const pON = prev.filter(isON);
      onPrev = {
        highs: pON.filter(r => r.value > TARGET_HIGH).length,
        lows:  pON.filter(r => r.value < TARGET_LOW).length,
      };
    }
  }
  const pct = (cur, was) => {
    if (was === null || was === undefined) return null;
    if (was === 0) return cur === 0 ? 0 : null;
    return Math.round(((cur - was) / was) * 100);
  };
  const onHighPct = onPrev ? pct(onHighs, onPrev.highs) : null;
  const onLowPct  = onPrev ? pct(onLows,  onPrev.lows)  : null;

  return {
    onHighs, onLows, onPrev, onHighPct, onLowPct,
    inRP: tP.inR, aboveP: tP.above, belowP: tP.below,
    // period-driven
    bedtimeP:  avg(inHours(P, 21, 23)),
    wakeupP:   avg(inHours(P, 6, 8)),
    avgP:      avg(P),
    gmi, sd, q,
    highsP:    P.filter(r=>r.value>TARGET_HIGH).length,
    lowsP:     P.filter(r=>r.value<TARGET_LOW).length,
    unicornsP: P.filter(r=>r.value===100).length,
    // always-recent
    avg3h:     avg(h3),
    avg24:     avg(h24),
    inR24:     t24.inR, above24: t24.above, below24: t24.below,
  };
}

// ═══ Atoms ═══════════════════════════════════════════════════════════════════
function Card({ children, style={} }) {
  return <div style={{ background:C.tile, borderRadius:16, border:"none",
    padding:20, ...style }}>{children}</div>;
}

function Badge({ color, children }) {
  return <span style={{ background:color+"22", color, fontWeight:700, fontSize:12,
    borderRadius:20, padding:"3px 10px" }}>{children}</span>;
}

function Btn({ onClick, children, variant="primary", style={}, disabled=false }) {
  const v = {
    primary:   { background:C.textDk, color:"#fff", border:"none" },
    secondary: { background:C.tile, color:C.textDk, border:"none" },
    danger:    { background:C.tile,  color:C.high, border:"none" },
  }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius:14, fontWeight:600,
    cursor:disabled?"not-allowed":"pointer", fontSize:16, padding:"14px 28px",
    fontFamily:"inherit", opacity:disabled?0.5:1, ...v, ...style }}>{children}</button>;
}

function NumPad({ value, onChange, step=1, min=0, max=500, unit="" }) {
  const bs = { width:40, height:40, borderRadius:"50%", border:"none",
    background:C.tile, fontSize:20, cursor:"pointer", color:C.textDk,
    display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, justifyContent:"center" }}>
      <button type="button" style={bs} onClick={()=>onChange(Math.max(min,roundHalf(value-step)))}>−</button>
      <div style={{ minWidth:80, textAlign:"center", fontSize:28, fontWeight:800, color:C.textDk }}>
        {value}{unit&&<span style={{ fontSize:14, color:C.textLt, fontWeight:500, marginLeft:2 }}>{unit}</span>}
      </div>
      <button type="button" style={bs} onClick={()=>onChange(Math.min(max,roundHalf(value+step)))}>+</button>
    </div>
  );
}

// ═══ BG Chart — pannable, hoverable, with day picker ═════════════════════════
const CHART_WINDOWS = [
  { label:"3h",  ms: 3*3600000  },
  { label:"6h",  ms: 6*3600000  },
  { label:"12h", ms: 12*3600000 },
  { label:"24h", ms: 24*3600000 },
];

function BGChart({ live, store, boluses }) {
  const [winMs,   setWinMs  ] = useState(3*3600000);
  const [endTs,   setEndTs  ] = useState(null);   // null = live (pinned to now)
  const [tip,     setTip    ] = useState(null);
  const [showCal, setShowCal] = useState(false);
  const dragRef = useRef(null);

  // Merge the live feed with the stored history, newest wins on duplicates.
  const data = (() => {
    const map = {};
    (store||[]).forEach(r => { if (r && typeof r.ts==="number") map[r.ts]=r; });
    (live ||[]).forEach(r => { if (r && typeof r.ts==="number") map[r.ts]=r; });
    return Object.values(map).sort((a,b)=>a.ts-b.ts);
  })();
  if (data.length < 2) return null;

  const dataMin = data[0].ts, dataMax = data[data.length-1].ts;
  const isLive  = endTs === null;
  const right   = isLive ? Math.max(dataMax, Date.now()) : endTs;
  const left    = right - winMs;

  const pts = data.filter(r => r.ts >= left && r.ts <= right);

  // Geometry
  const W=440, H=150, PAD={ top:14, right:34, bottom:22, left:8 };
  const cW=W-PAD.left-PAD.right, cH=H-PAD.top-PAD.bottom;
  const xS = ts  => PAD.left + ((ts-left)/winMs)*cW;
  const yS = val => PAD.top + cH - ((Math.min(Math.max(val,40),400)-40)/360)*cH;
  const dc = v   => v<TARGET_LOW?C.high:v>TARGET_HIGH?C.low:C.textDk;
  const yH=yS(TARGET_HIGH), yL=yS(TARGET_LOW);

  const shown = pts.map(r=>({ x:xS(r.ts), y:yS(r.value), v:r.value, ts:r.ts }));

  // Stretches >30 min with no readings, clipped to the visible window
  const GAP_MS = 30*60000;
  const gaps = [];
  {
    const inOrNear = data.filter(r => r.ts >= left - GAP_MS && r.ts <= right + GAP_MS);
    if (inOrNear.length === 0) {
      gaps.push([left, right]);
    } else {
      if (inOrNear[0].ts - left > GAP_MS) gaps.push([left, inOrNear[0].ts]);
      for (let i=1;i<inOrNear.length;i++) {
        if (inOrNear[i].ts - inOrNear[i-1].ts > GAP_MS) gaps.push([inOrNear[i-1].ts, inOrNear[i].ts]);
      }
      const last = inOrNear[inOrNear.length-1].ts;
      if (right - last > GAP_MS && right < Date.now() - GAP_MS) gaps.push([last, right]);
    }
  }

  // Time axis: tick count adapts to the window width
  const tickCount = winMs <= 6*3600000 ? 4 : winMs <= 12*3600000 ? 5 : 5;
  const ticks = Array.from({length:tickCount+1},(_,i)=>{
    const ts = left + (winMs*i)/tickCount;
    return { x: xS(ts),
      label: new Date(ts).toLocaleTimeString([], { hour:"numeric", minute: winMs<=6*3600000 ? "2-digit" : undefined }) };
  });

  const liveEdge = Math.max(dataMax, Date.now());

  // Pan a full window at a time, and skip over stretches with no readings
  // (collection gaps) instead of crawling through them.
  const pan = dir => {
    const base = isLive ? liveEdge : endTs;
    let next = base + dir*winMs;

    if (dir < 0) {
      // Going back: if the new window would be empty, land on the newest
      // reading older than it instead.
      const hasData = data.some(r => r.ts >= next - winMs && r.ts <= next);
      if (!hasData) {
        const prev = [...data].reverse().find(r => r.ts < next);
        if (prev) next = prev.ts + winMs*0.15; // leave a little headroom
      }
    } else {
      const hasData = data.some(r => r.ts >= next - winMs && r.ts <= next);
      if (!hasData) {
        const nxt = data.find(r => r.ts > next);
        if (nxt) next = nxt.ts + winMs*0.85;
      }
    }

    if (next >= liveEdge) setEndTs(null);
    else setEndTs(Math.max(dataMin + winMs*0.25, next));
  };

  // Jump straight to the newest reading before the current window
  const jumpToData = back => {
    const target = back
      ? [...data].reverse().find(r => r.ts < left)
      : data.find(r => r.ts > right);
    if (!target) return;
    const next = back ? target.ts + winMs*0.85 : target.ts + winMs*0.15;
    if (next >= liveEdge) setEndTs(null); else setEndTs(next);
    setTip(null);
  };

  const locate = clientX => {
    const el = dragRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const svgX = ((clientX-rect.left)/rect.width)*W;
    let best=null, bd=Infinity;
    shown.forEach(p=>{ const d=Math.abs(p.x-svgX); if(d<bd){bd=d;best=p;} });
    return best && bd < 26 ? best : null;
  };

  // Drag to scroll through time
  const startRef = useRef(null);
  const onDown = e => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    startRef.current = { cx, end: isLive ? Math.max(dataMax, Date.now()) : endTs };
  };
  const onMove = e => {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    if (startRef.current) {
      const el = dragRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const dxFrac = (cx - startRef.current.cx) / rect.width;
        if (Math.abs(dxFrac) > 0.01) {
          const next = startRef.current.end - dxFrac*winMs;
          if (next >= liveEdge) setEndTs(null);
          else setEndTs(Math.max(dataMin + winMs*0.25, next));
          setTip(null);
          return;
        }
      }
    }
    setTip(locate(cx));
  };
  const onUp = () => { startRef.current = null; };

  const dayVal = new Date(right);
  const pad2n = n => String(n).padStart(2,"0");
  const dayStr = dayVal.getFullYear()+"-"+pad2n(dayVal.getMonth()+1)+"-"+pad2n(dayVal.getDate());

  const tx = tip ? Math.min(Math.max(tip.x,44), W-52) : 0;
  const ty = tip ? Math.max(tip.y-30, PAD.top+10) : 0;

  const chip = (active) => ({
    padding:"4px 10px", borderRadius:14, border:"none", cursor:"pointer",
    fontFamily:"inherit", fontWeight:700, fontSize:11,
    background: active ? C.textDk : C.tile, color: active ? "#fff" : C.textMd,
  });

  return (
    <div>
      {/* Controls */}
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
        {CHART_WINDOWS.map(w=>(
          <button key={w.label} type="button" style={chip(winMs===w.ms)}
            onClick={()=>{ setWinMs(w.ms); setTip(null); }}>{w.label}</button>
        ))}
        <div style={{ flex:1 }}/>
        <button type="button" style={chip(false)} onClick={()=>pan(-1)} aria-label="Earlier">←</button>
        <button type="button" style={chip(false)} onClick={()=>pan(1)} aria-label="Later">→</button>
        <button type="button" style={chip(showCal)} onClick={()=>setShowCal(v=>!v)} aria-label="Pick a day">📅</button>
        <button type="button" style={chip(isLive)} onClick={()=>{ setEndTs(null); setTip(null); }}>Now</button>
      </div>

      {showCal && (
        <div style={{ marginBottom:8 }}>
          <input type="date" value={dayStr}
            min={new Date(dataMin).toISOString().slice(0,10)}
            max={new Date(Math.max(dataMax,Date.now())).toISOString().slice(0,10)}
            onChange={e=>{
              const [y,m,d] = e.target.value.split("-").map(Number);
              if (!y) return;
              const end = new Date(y, m-1, d, 23, 59, 59).getTime();
              setEndTs(Math.min(end, Math.max(dataMax, Date.now())));
              setShowCal(false); setTip(null);
            }}
            style={{ width:"100%", padding:"8px 10px", borderRadius:12, fontSize:12,
              fontFamily:"inherit", border:"none", background:C.tile, color:C.textDk, outline:"none" }}/>
        </div>
      )}

      {/* Window label */}
      <div style={{ fontSize:11, color:C.textLt, fontWeight:600, marginBottom:4 }}>
        {(() => {
          const l = new Date(left), r = new Date(right);
          const day  = d => d.toLocaleDateString("en-US",{month:"short",day:"numeric"});
          const time = d => d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
          const sameDay = l.toDateString() === r.toDateString();
          const range = sameDay
            ? `${day(l)} · ${time(l)} – ${time(r)}`
            : `${day(l)} ${time(l)} – ${day(r)} ${time(r)}`;
          return isLive ? `Live · ${range}` : range;
        })()}
      </div>

      {pts.length===0 && (
        <div style={{ background:C.tile, borderRadius:12, padding:"10px 12px", marginBottom:6,
          fontSize:12, color:C.textMd, fontWeight:600, display:"flex",
          alignItems:"center", justifyContent:"space-between", gap:10 }}>
          <span>No readings in this window</span>
          {[...data].reverse().find(r => r.ts < left) && (
            <button type="button" onClick={()=>jumpToData(true)}
              style={{ background:C.textDk, color:"#fff", border:"none", borderRadius:12,
                padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                flexShrink:0 }}>
              ← Jump to {new Date([...data].reverse().find(r => r.ts < left).ts)
                .toLocaleDateString("en-US",{month:"short",day:"numeric"})}
            </button>
          )}
        </div>
      )}

      <svg ref={dragRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width:"100%", height:"auto", display:"block", overflow:"visible",
          touchAction:"pan-y", cursor:"grab" }}
        onMouseMove={onMove} onMouseLeave={()=>{ setTip(null); onUp(); }}
        onMouseDown={onDown} onMouseUp={onUp}
        onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}>

        <defs>
          <pattern id="gapHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#FAFAFB"/>
            <line x1="0" y1="0" x2="0" y2="6" stroke={C.border} strokeWidth="1.5"/>
          </pattern>
        </defs>
        <rect x={PAD.left} y={yH} width={cW} height={yL-yH} fill={C.band} rx="2"/>
        {[100,200,300,400].map(v=>(
          <g key={"ax"+v}>
            <line x1={PAD.left} y1={yS(v)} x2={PAD.left+cW} y2={yS(v)}
              stroke={C.border} strokeWidth="0.5" opacity="0.6"/>
            <text x={W-PAD.right+4} y={yS(v)+3} fontSize="8.5" fill={C.textLt} fontWeight="600"
              fontFamily="Nunito Sans,sans-serif">{v}</text>
          </g>
        ))}
        {gaps.map(([g1,g2],i)=>{
          const gx1 = Math.max(PAD.left, xS(g1)), gx2 = Math.min(PAD.left+cW, xS(g2));
          if (gx2-gx1 < 3) return null;
          return (
            <g key={"gap"+i}>
              <rect x={gx1} y={PAD.top} width={gx2-gx1} height={cH} fill="url(#gapHatch)" opacity="0.7"/>
              {gx2-gx1 > 60 && (
                <text x={(gx1+gx2)/2} y={PAD.top+cH/2} fontSize="9" fill={C.textLt} fontWeight="600"
                  textAnchor="middle" fontFamily="Nunito Sans,sans-serif">no data</text>
              )}
            </g>
          );
        })}
        <line x1={PAD.left} y1={yL} x2={PAD.left+cW} y2={yL} stroke={C.high} strokeWidth="1"/>
        <text x={PAD.left+3} y={yH-3} fontSize="8" fill={C.textLt} fontWeight="700"
          fontFamily="Nunito Sans,sans-serif">{TARGET_HIGH}</text>
        <text x={PAD.left+3} y={yL+9} fontSize="8" fill={C.high} fontWeight="700" opacity="0.8"
          fontFamily="Nunito Sans,sans-serif">{TARGET_LOW}</text>

        {ticks.map((t,i)=>(
          <line key={"g"+i} x1={t.x} y1={PAD.top} x2={t.x} y2={PAD.top+cH}
            stroke={C.border} strokeWidth="1" strokeDasharray="2 4"/>
        ))}

        {(boluses||[])
          .filter(b => b && b.ts >= left && b.ts <= right)
          .map((b,i)=>{
            const bx = xS(b.ts);
            const h  = Math.min(14, 4 + (b.u||0)*1.6);
            return (
              <g key={"bol"+i}>
                <line x1={bx} y1={PAD.top+cH} x2={bx} y2={PAD.top+cH-h}
                  stroke={C.ravens} strokeWidth="2" opacity="0.65" strokeLinecap="round"/>
              </g>
            );
          })}
        {shown.map((p,i)=>(
          <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
            r={tip?.ts===p.ts?5:2.4} fill={dc(p.v)}
            stroke={tip?.ts===p.ts?"#fff":"none"} strokeWidth={tip?.ts===p.ts?2:0}/>
        ))}

        {tip && (
          <g>
            <line x1={tip.x} y1={PAD.top} x2={tip.x} y2={PAD.top+cH} stroke={C.textLt} strokeWidth="1" opacity="0.4"/>
            <rect x={tx-44} y={ty-26} width="88" height="34" rx="8" fill={C.textDk} opacity="0.94"/>
            <text x={tx} y={ty-13} fontSize="12" fontWeight="800" fill="#fff" textAnchor="middle"
              fontFamily="Nunito Sans,sans-serif">{tip.v} mg/dL</text>
            {(() => {
              const near = (boluses||[]).find(b => Math.abs(b.ts - tip.ts) < 15*60000);
              return near ? (
                <text x={tx} y={ty+14} fontSize="9" fontWeight="700" fill={C.ravens} textAnchor="middle"
                  fontFamily="Nunito Sans,sans-serif">{near.u}u{near.c?` · ${near.c}g`:""}</text>
              ) : null;
            })()}
            <text x={tx} y={ty+1} fontSize="9" fontWeight="600" fill="rgba(255,255,255,0.7)" textAnchor="middle"
              fontFamily="Nunito Sans,sans-serif">
              {new Date(tip.ts).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}
            </text>
          </g>
        )}

        {ticks.map((t,i)=>(
          <text key={"t"+i} x={t.x} y={H-4} fontSize="9" fill={C.textLt} fontWeight="600"
            textAnchor={i===0?"start":i===ticks.length-1?"end":"middle"}
            fontFamily="Nunito Sans,sans-serif">{t.label}</text>
        ))}
      </svg>
      <div style={{ fontSize:9, color:C.textLt, marginTop:2 }}>
        CGM data by Dexcom · drag to scroll · {(store||[]).length.toLocaleString()} stored{(boluses||[]).length>0 ? " · purple ticks = boluses" : ""}
        {(store||[]).length>0 && ` back to ${new Date(data[0].ts).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
      </div>
    </div>
  );
}

// ═══ High/Low Trend — raw daily counts, filterable by time-of-day ════════════
const HL_FILTERS = [
  { key:"all",       label:"All Day" },
  { key:"daytime",   label:"Daytime" },
  { key:"overnight", label:"Overnight" },
];

function dayKeyOf(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,"0");
  return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
}

function HighLowTrend({ readings, rangeLow, rangeHigh, mealWindows }) {
  const [filter,  setFilter ] = useState("all");
  const [tooltip, setTooltip] = useState(null);

  if (!readings || readings.length === 0) return null;

  // Overnight = any hour that isn't inside a configured meal window (matches Trends math)
  const inSegment = ts => {
    if (filter === "all") return true;
    const isOvernight = mealWindowFor(new Date(ts).getHours(), mealWindows) === "overnight";
    return filter === "overnight" ? isOvernight : !isOvernight;
  };

  // Build one bucket per calendar day across the whole data range,
  // so the x-axis stays put when the filter changes — only bar heights move.
  const sorted   = [...readings].sort((a,b)=>a.ts-b.ts);
  const firstDay = new Date(sorted[0].ts);                     firstDay.setHours(0,0,0,0);
  const lastDay  = new Date(sorted[sorted.length-1].ts);       lastDay.setHours(0,0,0,0);

  const days  = [];
  const byKey = {};
  for (let cur=new Date(firstDay); cur<=lastDay; cur.setDate(cur.getDate()+1)) {
    const bucket = { ts:cur.getTime(), key:dayKeyOf(cur.getTime()), high:0, low:0 };
    days.push(bucket);
    byKey[bucket.key] = bucket;
  }

  readings.forEach(r => {
    if (!inSegment(r.ts)) return;
    const d = byKey[dayKeyOf(r.ts)];
    if (!d) return;
    if      (r.value > rangeHigh) d.high += 1;
    else if (r.value < rangeLow)  d.low  += 1;
  });

  const totalHigh = days.reduce((s,d)=>s+d.high,0);
  const totalLow  = days.reduce((s,d)=>s+d.low,0);
  const maxCount  = Math.max(1, ...days.map(d=>Math.max(d.high,d.low)));

  // Geometry — diverging bars: highs point up (red), lows point down (gold)
  const W=440, H=176, PAD={ top:18, right:8, bottom:24, left:8 };
  const cW=W-PAD.left-PAD.right, cH=H-PAD.top-PAD.bottom;
  const zeroY = PAD.top + cH/2;
  const halfH = cH/2 - 5;
  const n     = days.length;
  const slot  = cW / n;
  const barW  = Math.max(1.5, Math.min(slot*0.7, 14));
  const xOf   = i => PAD.left + slot*i + slot/2;
  const labelIdx = n<=1 ? [0] : [0, Math.floor((n-1)/2), n-1];

  const handleTouch = e => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
    const svgX = ((cx-rect.left)/rect.width)*W;
    const i    = Math.max(0, Math.min(n-1, Math.floor((svgX-PAD.left)/slot)));
    setTooltip(days[i] ? { ...days[i], i } : null);
  };

  const fmtDay  = ts => new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const toHours = c  => (c*5/60); // ~5-min reading cadence → hours

  return (
    <Card style={{ marginBottom:12 }}>
      <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>📈 Highs & Lows Over Time</div>
      <div style={{ color:C.textLt, fontSize:11, marginBottom:12 }}>
        Daily count of readings above {rangeHigh} or below {rangeLow}
      </div>

      {/* Time-of-day filter */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:14 }}>
        {HL_FILTERS.map(f=>(
          <button key={f.key} type="button" onClick={()=>{ setFilter(f.key); setTooltip(null); }}
            style={{ padding:"7px 0", borderRadius:20, fontFamily:"inherit", textAlign:"center", fontWeight:800, fontSize:12,
              border: "none",
              background: filter===f.key ? C.textDk : C.tile,
              color: filter===f.key ? "#fff" : C.textMd, cursor:"pointer" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Totals for the selected window + segment */}
      <div style={{ display:"flex", gap:10, marginBottom:12 }}>
        <div style={{ flex:1, textAlign:"center", background:C.high+"11", border:`1.5px solid ${C.high}33`, borderRadius:12, padding:"8px 6px" }}>
          <div style={{ fontSize:22, fontWeight:900, color:C.high, lineHeight:1 }}>{totalHigh.toLocaleString()}</div>
          <div style={{ fontSize:10, color:C.textMd, fontWeight:700, marginTop:3 }}>high readings · ≈{toHours(totalHigh).toFixed(0)}h</div>
        </div>
        <div style={{ flex:1, textAlign:"center", background:C.low+"11", border:`1.5px solid ${C.low}33`, borderRadius:12, padding:"8px 6px" }}>
          <div style={{ fontSize:22, fontWeight:900, color:C.low, lineHeight:1 }}>{totalLow.toLocaleString()}</div>
          <div style={{ fontSize:10, color:C.textMd, fontWeight:700, marginTop:3 }}>low readings · ≈{toHours(totalLow).toFixed(0)}h</div>
        </div>
      </div>

      {/* Diverging bar chart */}
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{ width:"100%", height:"auto", display:"block", overflow:"visible", touchAction:"none" }}
        onTouchStart={handleTouch} onTouchMove={handleTouch} onClick={handleTouch}>
        <line x1={PAD.left} y1={zeroY} x2={PAD.left+cW} y2={zeroY} stroke={C.border} strokeWidth="1"/>
        {days.map((d,i)=>{
          const x  = xOf(i);
          const hH = (d.high/maxCount)*halfH;
          const lH = (d.low /maxCount)*halfH;
          const active = tooltip?.i===i;
          return (
            <g key={d.key}>
              {active && <rect x={x-slot/2} y={PAD.top} width={slot} height={cH} fill={C.blue} opacity="0.07"/>}
              {d.high>0 && <rect x={x-barW/2} y={zeroY-hH} width={barW} height={hH} rx={barW>3?1.5:0} fill={C.high} opacity={active?1:0.85}/>}
              {d.low >0 && <rect x={x-barW/2} y={zeroY}    width={barW} height={lH} rx={barW>3?1.5:0} fill={C.low}  opacity={active?1:0.85}/>}
            </g>
          );
        })}
        <text x={PAD.left+2} y={PAD.top-5} fontSize="9" fill={C.high} fontWeight="800" fontFamily="Nunito Sans,sans-serif">▲ highs</text>
        <text x={PAD.left+2} y={H-PAD.bottom+13} fontSize="9" fill={C.low} fontWeight="800" fontFamily="Nunito Sans,sans-serif">▼ lows</text>
        {labelIdx.map((i,k)=>(
          <text key={k} x={xOf(i)} y={H-4} fontSize="9" fill={C.textLt} fontWeight="600" fontFamily="Nunito Sans,sans-serif"
            textAnchor={k===0?"start":k===labelIdx.length-1?"end":"middle"}>
            {fmtDay(days[i].ts)}
          </text>
        ))}
      </svg>

      {/* Tap readout */}
      <div style={{ textAlign:"center", marginTop:6, minHeight:18 }}>
        {tooltip ? (
          <span style={{ fontSize:12, fontWeight:700, color:C.textMd }}>
            {fmtDay(tooltip.ts)} — <span style={{ color:C.high }}>{tooltip.high} high</span> · <span style={{ color:C.low }}>{tooltip.low} low</span>
          </span>
        ) : (
          <span style={{ fontSize:11, color:C.textLt }}>Tap any day for its exact counts</span>
        )}
      </div>
    </Card>
  );
}



// ═══ Ask — chat with Claude about the data ═══════════════════════════════════
const ASK_SUGGESTIONS = [
  "How were overnights this week vs last week?",
  "Which day of the week runs highest?",
  "Did going back on the pump help?",
  "Any pattern before the overnight lows?",
];

function AskTab() {
  const [msgs,    setMsgs   ] = useState([]);
  const [input,   setInput  ] = useState("");
  const [busy,    setBusy   ] = useState(false);
  const [err,     setErr    ] = useState(null);
  const endRef = useRef(null);

  useEffect(()=>{ endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, busy]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setErr(null);
    const next = [...msgs, { role:"user", content:q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const r = await fetch("/api/ask", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ question:q, history:msgs }),
      });
      const d = await r.json();
      if (!r.ok || !d.answer) {
        setErr(d.error === "ANTHROPIC_API_KEY not configured"
          ? "Not set up yet — add an ANTHROPIC_API_KEY in Vercel to turn this on."
          : "Couldn't get an answer. Try again in a moment.");
      } else {
        setMsgs(m => [...m, { role:"assistant", content:d.answer }]);
      }
    } catch {
      setErr("Couldn't reach the server. Check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div style={{ marginBottom:18 }}>
      {msgs.length === 0 && (
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:13, color:C.textMd, fontWeight:600, lineHeight:1.5, marginBottom:12 }}>
            Ask anything about Hudson's glucose or site data — answers come from the actual readings.
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {ASK_SUGGESTIONS.map(q=>(
              <button key={q} type="button" onClick={()=>send(q)}
                style={{ textAlign:"left", background:C.tile, border:"none", borderRadius:12,
                  padding:"11px 14px", fontSize:13, fontWeight:600, color:C.textDk,
                  cursor:"pointer", fontFamily:"inherit" }}>
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {msgs.map((m,i)=>(
        <div key={i} style={{ display:"flex",
          justifyContent: m.role==="user" ? "flex-end" : "flex-start", marginBottom:8 }}>
          <div style={{ maxWidth:"85%", borderRadius:14, padding:"10px 14px",
            fontSize:13, lineHeight:1.5, whiteSpace:"pre-wrap",
            background: m.role==="user" ? C.textDk : C.tile,
            color: m.role==="user" ? "#fff" : C.textDk,
            fontWeight: m.role==="user" ? 600 : 500 }}>
            {m.content}
          </div>
        </div>
      ))}

      {busy && (
        <div style={{ display:"flex", justifyContent:"flex-start", marginBottom:8 }}>
          <div style={{ background:C.tile, borderRadius:14, padding:"10px 16px",
            fontSize:13, color:C.textLt, fontWeight:600 }}>
            Looking at the data…
          </div>
        </div>
      )}

      {err && (
        <div style={{ background:C.high+"11", borderRadius:12, padding:"9px 12px",
          fontSize:12, color:C.high, fontWeight:600, marginBottom:8 }}>{err}</div>
      )}

      <div style={{ display:"flex", gap:8, marginTop:6 }}>
        <input value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter") send(); }}
          placeholder="Ask about the data…"
          style={{ flex:1, padding:"12px 14px", borderRadius:14, fontSize:14,
            fontFamily:"inherit", border:"none", background:C.tile,
            color:C.textDk, outline:"none" }}/>
        <button type="button" onClick={()=>send()} disabled={busy || !input.trim()}
          style={{ background:C.ravens, color:"#fff", border:"none", borderRadius:14,
            width:46, fontSize:17, cursor: busy||!input.trim() ? "default" : "pointer",
            opacity: busy||!input.trim() ? 0.4 : 1, fontFamily:"inherit" }}>↑</button>
      </div>

      <div style={{ fontSize:10, color:C.textLt, marginTop:10, lineHeight:1.5, textAlign:"center" }}>
        For understanding patterns — never for dosing decisions. Confirm changes with Hudson's endo.
      </div>
      <div ref={endRef}/>
    </div>
  );
}



// ═══ Glooko CSV import ═══════════════════════════════════════════════════════
// Glooko CSVs look like:
//   line 1: Name:...,Date Range:...
//   line 2: column headers
//   line 3+: data
// We detect which file is which from the headers, so users can select any
// combination of the CSVs from the export zip.
function parseGlookoCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 3) return null;

  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (/timestamp/i.test(lines[i])) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return null;

  const split = l => {
    const out = []; let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  };

  const cols = split(lines[headerIdx]).map(c => c.toLowerCase());
  const idx = re => cols.findIndex(c => re.test(c));
  const iTs    = idx(/timestamp/);
  const iIns   = idx(/insulin delivered/);
  const iCarb  = idx(/carbs input/);
  const iRatio = idx(/carbs ratio/);
  const iBG    = idx(/blood glucose input/);
  const iTotal = idx(/total insulin/);
  const iBolus = idx(/total bolus/);
  const iBasal = idx(/total basal/);

  // Parse "2026-04-24 08:27" as local time (avoids UTC drift from Date.parse)
  const toTs = str => {
    const m = String(str).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
    if (!m) return null;
    return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5]).getTime();
  };
  const num = v => { const f = parseFloat(v); return isNaN(f) ? null : f; };

  const boluses = [], dailyTotals = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = split(lines[i]);
    const ts = toTs(c[iTs]);
    if (!ts) continue;

    if (iIns > -1) {
      const u = num(c[iIns]);
      if (u !== null && u > 0) {
        const rec = { ts, u: Math.round(u*100)/100 };
        if (iCarb  > -1) rec.c = Math.round(num(c[iCarb]) || 0);
        if (iRatio > -1 && num(c[iRatio])) rec.r = Math.round(num(c[iRatio]));
        if (iBG    > -1 && num(c[iBG]))    rec.bg = Math.round(num(c[iBG]));
        boluses.push(rec);
      }
    }
    if (iTotal > -1 || iBasal > -1) {
      const d = new Date(ts);
      const pad = n => String(n).padStart(2,"0");
      dailyTotals.push({
        d: `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
        bolus: iBolus > -1 ? num(c[iBolus]) : null,
        basal: iBasal > -1 ? num(c[iBasal]) : null,
        total: iTotal > -1 ? num(c[iTotal]) : null,
      });
    }
  }
  return { boluses, dailyTotals };
}

function GlookoImport({ onImported }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [have, setHave] = useState(null);   // what's already stored

  const loadCoverage = () => {
    fetch("/api/insulin-store").then(r => r.json()).then(d => {
      const b = Array.isArray(d?.boluses) ? d.boluses : [];
      if (b.length === 0) { setHave({ n: 0 }); return; }
      setHave({ n: b.length, first: b[0].ts, last: b[b.length-1].ts });
    }).catch(() => setHave(null));
  };
  useEffect(loadCoverage, []);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setBusy(true); setStatus(null);
    try {
      let allB = [], allT = [];
      for (const f of Array.from(files)) {
        if (!/\.csv$/i.test(f.name)) continue;
        const text = await f.text();
        const parsed = parseGlookoCSV(text);
        if (parsed) { allB = allB.concat(parsed.boluses); allT = allT.concat(parsed.dailyTotals); }
      }
      if (allB.length === 0 && allT.length === 0) {
        setStatus({ err: "No bolus or insulin data found. Pick bolus_data_1.csv and insulin_data_1.csv from the export." });
        setBusy(false); return;
      }
      const r = await fetch("/api/insulin-store", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boluses: allB, dailyTotals: allT }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "save failed");
      setStatus({ ok: `Imported. ${d.boluses} boluses, ${d.dailyTotals} daily totals now stored.` });
      loadCoverage();
      onImported && onImported();
    } catch (e) {
      setStatus({ err: String(e.message || e) });
    }
    setBusy(false);
  };

  return (
    <div style={{ marginTop:22 }}>
      <div style={{ fontWeight:800, fontSize:13, color:C.textDk, marginBottom:4 }}>💉 Import Glooko data</div>
      {have && (
        <div style={{ background:C.tile, borderRadius:12, padding:"10px 12px", marginBottom:10 }}>
          {have.n === 0 ? (
            <div style={{ fontSize:11, fontWeight:700, color:C.textMd }}>
              No insulin data yet — export everything Glooko has.
            </div>
          ) : (() => {
            const last = new Date(have.last);
            const days = Math.floor((Date.now() - have.last) / 86400000);
            const fmt = d => d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
            return (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:C.textDk }}>
                  Have {have.n.toLocaleString()} boluses through {fmt(last)}
                  {" "}({last.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" })})
                </div>
                <div style={{ fontSize:11, fontWeight:700, color: days >= 30 ? C.low : C.textMd, marginTop:3 }}>
                  {days === 0 ? "Up to date as of today."
                    : `Export from ${fmt(last)} onward — ${days} day${days===1?"":"s"} missing.`}
                </div>
              </>
            );
          })()}
        </div>
      )}
      <div style={{ fontSize:11, color:C.textLt, lineHeight:1.5, marginBottom:10 }}>
        Export from Glooko web → unzip → pick <b>bolus_data_1.csv</b> and <b>insulin_data_1.csv</b>.
        Overlapping dates are fine — duplicates are ignored.
      </div>
      <label style={{ display:"block", background:C.tile, borderRadius:12, padding:"14px 12px",
        textAlign:"center", cursor: busy ? "default" : "pointer", fontSize:13, fontWeight:700,
        color: busy ? C.textLt : C.textDk }}>
        {busy ? "Importing…" : "Choose CSV files"}
        <input type="file" accept=".csv" multiple disabled={busy}
          onChange={e => handleFiles(e.target.files)}
          style={{ display:"none" }}/>
      </label>
      {status?.ok && (
        <div style={{ marginTop:8, background:C.inRange+"15", borderRadius:10, padding:"9px 12px",
          fontSize:11, fontWeight:700, color:C.inRange }}>{status.ok}</div>
      )}
      {status?.err && (
        <div style={{ marginTop:8, background:C.high+"12", borderRadius:10, padding:"9px 12px",
          fontSize:11, fontWeight:700, color:C.high }}>{status.err}</div>
      )}
    </div>
  );
}


// ═══ Endo Summary — 30-day clinical snapshot ═════════════════════════════════
// Reports standard CGM metrics against international consensus targets, surfaces
// patterns worth raising, and drafts questions. Deliberately makes NO dosing,
// basal, or ratio recommendations — those belong to the endocrinologist.
const CONSENSUS = {
  tir:      { label:"Time in range 70–180",  target:">70%",  key:"tir" },
  below70:  { label:"Below 70",              target:"<4%",   key:"below70" },
  below54:  { label:"Below 54",              target:"<1%",   key:"below54" },
  above180: { label:"Above 180",             target:"<25%",  key:"above180" },
  above250: { label:"Above 250",             target:"<5%",   key:"above250" },
};

function computeEndoSummary(readings, insulin, sites, mealWindows, days = 30) {
  const now = Date.now();
  const from = now - days*86400000;
  const R = (readings || []).filter(r => r && r.ts >= from);
  if (R.length < 50) return null;

  const vals = R.map(r => r.value);
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const sd = Math.sqrt(vals.reduce((a,v)=>a+(v-mean)**2,0)/vals.length);
  const pct = n => Math.round((n/vals.length)*1000)/10;

  // CGM coverage: 288 readings = a complete day
  const dayKeys = new Set(R.map(r => new Date(r.ts).toDateString()));
  const coverage = Math.round((R.length / (days*288)) * 100);

  const metrics = {
    days, n: R.length, coverage, daysWithData: dayKeys.size,
    mean: Math.round(mean),
    gmi: (3.31 + 0.02392*mean).toFixed(1),
    sd: Math.round(sd),
    cv: Math.round((sd/mean)*100),
    tir:      pct(vals.filter(v => v>=70 && v<=180).length),
    below70:  pct(vals.filter(v => v<70).length),
    below54:  pct(vals.filter(v => v<54).length),
    above180: pct(vals.filter(v => v>180).length),
    above250: pct(vals.filter(v => v>250).length),
  };

  // Nightly nadirs, 9pm–6am, attributed to the evening the night began
  const nights = {};
  R.forEach(r => {
    const d = new Date(r.ts); const h = d.getHours();
    if (h >= 21 || h < 6) {
      const key = new Date(r.ts - (h < 6 ? 86400000 : 0)).toDateString();
      if (!nights[key] || r.value < nights[key].v) nights[key] = { v:r.value, ts:r.ts };
    }
  });
  const nadirs = Object.entries(nights).map(([d,x]) => ({ date:d, nadir:x.v, ts:x.ts }))
    .sort((a,b)=>a.ts-b.ts);
  const overnight = {
    nights: nadirs.length,
    below70: nadirs.filter(n => n.nadir < 70).length,
    below54: nadirs.filter(n => n.nadir < 54).length,
    lowest: nadirs.length ? Math.min(...nadirs.map(n=>n.nadir)) : null,
    worst: [...nadirs].sort((a,b)=>a.nadir-b.nadir).slice(0,5),
  };
  // Hour-of-day clustering for nadirs under 70
  const hourCounts = {};
  nadirs.filter(n=>n.nadir<70).forEach(n => {
    const h = new Date(n.ts).getHours();
    hourCounts[h] = (hourCounts[h]||0)+1;
  });
  const peakHours = Object.entries(hourCounts).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([h,c]) => ({ hour:+h, count:c }));

  // Insulin over the same window
  const bol = (insulin?.boluses || []).filter(b => b && b.ts >= from);
  const tot = (insulin?.dailyTotals || []).filter(t => {
    const d = new Date(t.d+"T12:00:00").getTime(); return d >= from;
  });
  const avgTDD   = tot.length ? tot.reduce((a,t)=>a+(t.total||0),0)/tot.length : null;
  const avgBasal = tot.length ? tot.reduce((a,t)=>a+(t.basal||0),0)/tot.length : null;
  const basalPct = (avgTDD && avgBasal) ? Math.round((avgBasal/avgTDD)*100) : null;
  const bolusDays = new Set(bol.map(b => new Date(b.ts).toDateString())).size || 1;

  // Ratios the pump actually used, by meal window
  const winRatios = {};
  bol.forEach(b => {
    if (!b.r) return;
    const w = mealWindowFor(new Date(b.ts).getHours(), mealWindows);
    (winRatios[w] = winRatios[w] || []).push(b.r);
  });
  const medianOf = a => { if(!a?.length) return null; const x=[...a].sort((p,q)=>p-q); return x[Math.floor(x.length/2)]; };

  // Average BG by meal window
  const winBG = {};
  R.forEach(r => {
    const w = mealWindowFor(new Date(r.ts).getHours(), mealWindows);
    (winBG[w] = winBG[w] || []).push(r.value);
  });
  const byWindow = ["breakfast","lunch","snack","dinner","overnight"].map(w => ({
    window: w,
    avg: winBG[w]?.length ? Math.round(winBG[w].reduce((a,b)=>a+b,0)/winBG[w].length) : null,
    ratio: medianOf(winRatios[w]),
    n: winBG[w]?.length || 0,
  }));

  // Evening insulin vs overnight nadir (association only)
  let lateBolusSplit = null;
  if (bol.length && nadirs.length >= 8) {
    const nightKey = ts => new Date(ts - (new Date(ts).getHours() < 6 ? 86400000 : 0)).toDateString();
    const lateByNight = {};
    bol.forEach(b => { const h=new Date(b.ts).getHours(); if (h>=21||h<6) lateByNight[nightKey(b.ts)] = true; });
    const withLate = nadirs.filter(n => lateByNight[n.date]);
    const without  = nadirs.filter(n => !lateByNight[n.date]);
    const med = a => { if(!a.length) return null; const s=a.map(x=>x.nadir).sort((p,q)=>p-q); return s[Math.floor(s.length/2)]; };
    if (withLate.length >= 3 && without.length >= 3) {
      lateBolusSplit = {
        withLate: { n: withLate.length, median: med(withLate) },
        without:  { n: without.length,  median: med(without) },
      };
    }
  }

  // Devices
  const S = (sites || []).filter(x => x && x.ts >= from);
  const devices = ["pod","sensor"].map(d => {
    const list = S.filter(x => x.device===d).sort((a,b)=>a.ts-b.ts);
    const wears = [];
    for (let i=1;i<list.length;i++) wears.push((list[i].ts-list[i-1].ts)/86400000);
    return {
      device: d, changes: list.length,
      avgWear: wears.length ? (wears.reduce((a,b)=>a+b,0)/wears.length).toFixed(1) : null,
      sites: [...new Set(list.map(x=>x.site))].length,
    };
  });

  return { metrics, overnight, peakHours, insulin:{ avgTDD, avgBasal, basalPct,
    bolusesPerDay: (bol.length/bolusDays).toFixed(1), n: bol.length }, byWindow, lateBolusSplit, devices };
}


function MetricRow({ label, value, target, met }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"9px 0", borderBottom:`1px solid ${C.border}` }}>
      <div style={{ fontSize:12.5, fontWeight:700, color:C.textDk }}>{label}</div>
      <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
        <span style={{ fontSize:10, color:C.textLt, fontWeight:600 }}>target {target}</span>
        <span style={{ fontSize:15, fontWeight:800, minWidth:52, textAlign:"right",
          color: met === null ? C.textDk : met ? C.inRange : C.high }}>{value}</span>
      </div>
    </div>
  );
}

function EndoTab({ readings, insulin, sites, mealWindows }) {
  const [copied, setCopied] = useState(false);
  const sum = computeEndoSummary(readings, insulin, sites, mealWindows, 30);

  if (!sum) return (
    <div style={{ marginBottom:18 }}>
      <Card><div style={{ color:C.textLt, fontSize:12.5, lineHeight:1.6 }}>
        Not enough data in the last 30 days to build a summary yet.
      </div></Card>
    </div>
  );

  const { metrics: m, overnight: on, peakHours, insulin: ins, byWindow, lateBolusSplit, devices } = sum;
  const hourLabel = h => new Date(2000,0,1,h).toLocaleTimeString([], { hour:"numeric" });
  const WIN_LABEL = { breakfast:"Breakfast", lunch:"Lunch", snack:"Snack", dinner:"Dinner", overnight:"Overnight" };

  const plainText = () => {
    const L = [];
    L.push(`HUDSON — 30-DAY CGM SUMMARY (${new Date().toLocaleDateString()})`);
    L.push(`${m.n.toLocaleString()} readings · ${m.daysWithData}/${m.days} days · ${m.coverage}% CGM coverage`);
    L.push("");
    L.push("GLYCEMIC METRICS (vs international consensus targets)");
    L.push(`  Average glucose   ${m.mean} mg/dL`);
    L.push(`  GMI               ${m.gmi}%`);
    L.push(`  Time in range     ${m.tir}%   (target >70%)`);
    L.push(`  Below 70          ${m.below70}%  (target <4%)`);
    L.push(`  Below 54          ${m.below54}%  (target <1%)`);
    L.push(`  Above 180         ${m.above180}%  (target <25%)`);
    L.push(`  Above 250         ${m.above250}%  (target <5%)`);
    L.push(`  SD                ${m.sd} mg/dL`);
    L.push(`  CV                ${m.cv}%  (target <36%)`);
    L.push("");
    L.push("OVERNIGHT (9pm–6am)");
    L.push(`  Nights analyzed        ${on.nights}`);
    L.push(`  Nights nadir <70       ${on.below70}`);
    L.push(`  Nights nadir <54       ${on.below54}`);
    L.push(`  Lowest nadir           ${on.lowest} mg/dL`);
    if (peakHours.length) L.push(`  Lows cluster at        ${peakHours.map(p=>hourLabel(p.hour)).join(", ")}`);
    if (on.worst.length) {
      L.push("  Lowest nights:");
      on.worst.forEach(w => L.push(`    ${new Date(w.ts).toLocaleDateString()} — ${w.nadir} mg/dL at ${new Date(w.ts).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`));
    }
    L.push("");
    if (ins.avgTDD) {
      L.push("INSULIN");
      L.push(`  Avg total daily dose   ${ins.avgTDD.toFixed(1)} U`);
      if (ins.basalPct !== null) L.push(`  Basal / bolus split    ${ins.basalPct}% / ${100-ins.basalPct}%`);
      L.push(`  Boluses per day        ${ins.bolusesPerDay}`);
      L.push("");
    }
    L.push("BY MEAL WINDOW");
    byWindow.filter(w=>w.avg!==null).forEach(w =>
      L.push(`  ${WIN_LABEL[w.window].padEnd(10)} avg ${w.avg} mg/dL${w.ratio?`   pump ratio 1:${w.ratio}`:""}`));
    L.push("");
    if (lateBolusSplit) {
      L.push("OBSERVATION — late boluses vs overnight nadir");
      L.push(`  Nights with a bolus after 9pm (n=${lateBolusSplit.withLate.n}): median nadir ${lateBolusSplit.withLate.median}`);
      L.push(`  Nights without (n=${lateBolusSplit.without.n}): median nadir ${lateBolusSplit.without.median}`);
      L.push("  (association only — carbs and insulin move together)");
      L.push("");
    }
    const dv = devices.filter(d=>d.changes>0);
    if (dv.length) {
      L.push("DEVICES");
      dv.forEach(d => L.push(`  ${d.device==="pod"?"Pod":"Sensor"}: ${d.changes} changes${d.avgWear?`, avg wear ${d.avgWear}d`:""}, ${d.sites} sites used`));
      L.push("");
    }
    L.push("QUESTIONS FOR THE APPOINTMENT");
    L.push("  1. Given the overnight lows, is this basal, evening bolus tail, or both?");
    L.push("  2. Should the overnight Target Glucose change, to what value, over which hours?");
    L.push("  3. Do the meal ratios above match what should be programmed?");
    L.push("  4. Any change to how we handle activity days?");
    return L.join("\n");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText());
      setCopied(true); setTimeout(()=>setCopied(false), 2200);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex", gap:8, marginBottom:14 }}>
        <Btn onClick={copy} style={{ flex:1 }}>{copied ? "Copied ✓" : "Copy summary"}</Btn>
        <Btn variant="secondary" onClick={()=>window.print()} style={{ flex:1 }}>Print</Btn>
      </div>

      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.textDk }}>Last 30 days</div>
        <div style={{ fontSize:11, color:C.textLt, fontWeight:600, marginTop:2, marginBottom:12 }}>
          {m.n.toLocaleString()} readings · {m.daysWithData}/{m.days} days · {m.coverage}% CGM coverage
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
          {[["Avg glucose", m.mean, "mg/dL"], ["GMI", m.gmi, "%"], ["CV", m.cv, "%"]].map(([l,v,u])=>(
            <div key={l} style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
              <div style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>
                {v}<span style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>{u}</span>
              </div>
            </div>
          ))}
        </div>
        <MetricRow label="Time in range 70–180" value={`${m.tir}%`}      target=">70%"  met={m.tir>70}/>
        <MetricRow label="Below 70"             value={`${m.below70}%`}  target="<4%"   met={m.below70<4}/>
        <MetricRow label="Below 54"             value={`${m.below54}%`}  target="<1%"   met={m.below54<1}/>
        <MetricRow label="Above 180"            value={`${m.above180}%`} target="<25%"  met={m.above180<25}/>
        <MetricRow label="Above 250"            value={`${m.above250}%`} target="<5%"   met={m.above250<5}/>
        <MetricRow label="Coefficient of variation" value={`${m.cv}%`}   target="<36%"  met={m.cv<36}/>
      </Card>

      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.textDk, marginBottom:2 }}>Overnight (9pm–6am)</div>
        <div style={{ fontSize:11, color:C.textLt, fontWeight:600, marginBottom:12 }}>
          Lowest reading each night
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:12 }}>
          {[["Nights <70", on.below70, C.low], ["Nights <54", on.below54, C.high], ["Lowest", on.lowest, C.high]].map(([l,v,col])=>(
            <div key={l} style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
              <div style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>{l}</div>
              <div style={{ fontSize:22, fontWeight:800, color:col, marginTop:2 }}>{v ?? "—"}</div>
            </div>
          ))}
        </div>
        {peakHours.length>0 && (
          <div style={{ fontSize:12, color:C.textMd, fontWeight:700, marginBottom:10 }}>
            Lows cluster around {peakHours.map(p=>hourLabel(p.hour)).join(", ")}
          </div>
        )}
        {on.worst.map(w=>(
          <div key={w.ts} style={{ display:"flex", justifyContent:"space-between",
            padding:"7px 0", borderBottom:`1px solid ${C.border}`, fontSize:12 }}>
            <span style={{ color:C.textMd, fontWeight:600 }}>
              {new Date(w.ts).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
              {" · "}{new Date(w.ts).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
            </span>
            <span style={{ fontWeight:800, color: w.nadir<54 ? C.high : C.low }}>{w.nadir} mg/dL</span>
          </div>
        ))}
      </Card>

      {ins.avgTDD && (
        <Card style={{ marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:15, color:C.textDk, marginBottom:12 }}>Insulin</div>
          <MetricRow label="Avg total daily dose" value={`${ins.avgTDD.toFixed(1)}U`} target="—" met={null}/>
          {ins.basalPct !== null &&
            <MetricRow label="Basal share of TDD" value={`${ins.basalPct}%`} target="typ. 40–50%" met={null}/>}
          <MetricRow label="Boluses per day" value={ins.bolusesPerDay} target="—" met={null}/>
        </Card>
      )}

      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.textDk, marginBottom:12 }}>By meal window</div>
        {byWindow.filter(w=>w.avg!==null).map(w=>(
          <div key={w.window} style={{ display:"flex", justifyContent:"space-between",
            padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:12.5, fontWeight:700, color:C.textDk }}>{WIN_LABEL[w.window]}</span>
            <span style={{ fontSize:12.5, fontWeight:700, color:C.textMd }}>
              avg <b style={{ color:C.textDk }}>{w.avg}</b>
              {w.ratio ? <> · pump 1:{w.ratio}</> : null}
            </span>
          </div>
        ))}
      </Card>

      {lateBolusSplit && (
        <Card style={{ marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:15, color:C.textDk, marginBottom:2 }}>Pattern to discuss</div>
          <div style={{ fontSize:12.5, color:C.textMd, lineHeight:1.6, marginTop:8 }}>
            Nights with a bolus after 9pm (n={lateBolusSplit.withLate.n}) had a median nadir of{" "}
            <b style={{ color:C.textDk }}>{lateBolusSplit.withLate.median}</b>, versus{" "}
            <b style={{ color:C.textDk }}>{lateBolusSplit.without.median}</b> on nights without
            (n={lateBolusSplit.without.n}).
          </div>
          <div style={{ fontSize:11, color:C.textLt, marginTop:8, lineHeight:1.5 }}>
            Association only — larger evening meals mean both more carbs and more insulin,
            so this doesn't isolate a cause.
          </div>
        </Card>
      )}

      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, fontSize:15, color:C.textDk, marginBottom:10 }}>Questions for the appointment</div>
        {[
          "Given the overnight lows, is this basal, evening bolus tail, or both?",
          "Should the overnight Target Glucose change — to what value, over which hours?",
          "Do the meal ratios above match what should be programmed?",
          "Any change to how we handle activity days?",
        ].map((q,i)=>(
          <div key={i} style={{ display:"flex", gap:8, padding:"7px 0", fontSize:12.5, lineHeight:1.5 }}>
            <span style={{ color:C.ravens, fontWeight:800 }}>{i+1}.</span>
            <span style={{ color:C.textMd, fontWeight:600 }}>{q}</span>
          </div>
        ))}
      </Card>

      <div style={{ fontSize:10.5, color:C.textLt, lineHeight:1.6, textAlign:"center", padding:"0 8px 8px" }}>
        Prepared from home CGM and pump data for discussion at an appointment.
        Contains observations, not treatment recommendations — all dosing decisions
        belong to Hudson's care team.
      </div>
    </div>
  );
}

// ═══ Insulin Trends — from Glooko bolus data ═════════════════════════════════
function InsulinTrends({ insulin, readings, fromTs, toTs, mealWindows, ratios }) {
  const bol = (insulin?.boluses || []).filter(b => b && b.ts >= fromTs && b.ts <= toTs);
  const tot = (insulin?.dailyTotals || []).filter(t => {
    const d = new Date(t.d + "T12:00:00").getTime();
    return d >= fromTs && d <= toTs;
  });

  if (bol.length === 0) return (
    <Card style={{ marginBottom:12 }}>
      <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>💉 Insulin</div>
      <div style={{ color:C.textLt, fontSize:12, lineHeight:1.5 }}>
        No bolus data in this range. Import a Glooko export to fill this in.
      </div>
    </Card>
  );

  const days = new Set(bol.map(b => new Date(b.ts).toDateString())).size || 1;
  const totalU = bol.reduce((a,b)=>a+(b.u||0),0);
  const totalC = bol.reduce((a,b)=>a+(b.c||0),0);
  const avgDailyTotal = tot.length ? tot.reduce((a,t)=>a+(t.total||0),0)/tot.length : null;
  const avgBasal = tot.length ? tot.reduce((a,t)=>a+(t.basal||0),0)/tot.length : null;
  const basalPct = (avgDailyTotal && avgBasal) ? Math.round(avgBasal/avgDailyTotal*100) : null;

  // Boluses by meal window, with the ratio the pump actually used
  const byWin = {};
  bol.forEach(b => {
    const w = mealWindowFor(new Date(b.ts).getHours(), mealWindows);
    if (!byWin[w]) byWin[w] = { n:0, u:0, c:0, ratios:[] };
    byWin[w].n++; byWin[w].u += b.u||0; byWin[w].c += b.c||0;
    if (b.r) byWin[w].ratios.push(b.r);
  });
  const median = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y); return s[Math.floor(s.length/2)]; };
  const WINS = [
    { key:"breakfast", label:"Breakfast", icon:"☀️" },
    { key:"lunch",     label:"Lunch",     icon:"🌤️" },
    { key:"snack",     label:"Snack",     icon:"🍎" },
    { key:"dinner",    label:"Dinner",    icon:"🌙" },
    { key:"overnight", label:"Overnight", icon:"🌑" },
  ];

  return (
    <Card style={{ marginBottom:12 }}>
      <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>💉 Insulin</div>
      <div style={{ color:C.textLt, fontSize:11, marginBottom:14 }}>
        {bol.length} boluses over {days} days · from Glooko
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
        <div style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>Avg daily total</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>
            {avgDailyTotal ? avgDailyTotal.toFixed(1) : (totalU/days).toFixed(1)}<span style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>u</span>
          </div>
        </div>
        <div style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>Basal share</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>
            {basalPct !== null ? `${basalPct}%` : "—"}
          </div>
        </div>
        <div style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
          <div style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>Avg carbs/day</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>
            {Math.round(totalC/days)}<span style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>g</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize:12, fontWeight:800, color:C.textDk, marginBottom:8 }}>By meal window</div>
      {WINS.filter(w=>byWin[w.key]).map(w=>{
        const d = byWin[w.key];
        const pumpRatio = median(d.ratios);
        const appRatio = ratios?.[w.key];
        const mismatch = pumpRatio && appRatio && pumpRatio !== appRatio;
        return (
          <div key={w.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
            padding:"8px 0", borderBottom:`1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:C.textDk }}>{w.icon} {w.label}</div>
              <div style={{ fontSize:10, color:C.textLt, fontWeight:600 }}>
                {d.n} boluses · {(d.u/d.n).toFixed(1)}u avg · {Math.round(d.c/d.n)}g avg
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13, fontWeight:800, color: mismatch ? C.low : C.textDk }}>
                {pumpRatio ? `1:${pumpRatio}` : "—"}
              </div>
              <div style={{ fontSize:9, color:C.textLt, fontWeight:600 }}>
                {mismatch ? `app says 1:${appRatio}` : "pump ratio"}
              </div>
            </div>
          </div>
        );
      })}

      <div style={{ fontSize:10, color:C.textLt, marginTop:12, lineHeight:1.5 }}>
        Ratios shown are what the pump actually used. Any mismatch with the app's
        settings is worth reconciling — confirm with Hudson's endocrinologist.
      </div>
    </Card>
  );
}

// ═══ Site Trends — usage, wear, and BG-by-pod-age ════════════════════════════
function HBar({ label, count, max, color, note }) {
  const pct = max > 0 ? Math.max(4, (count/max)*100) : 0;
  return (
    <div style={{ marginBottom:8 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.textDk }}>{label}
          {note && <span style={{ color:C.textLt, fontWeight:600 }}> · {note}</span>}
        </span>
        <span style={{ fontSize:11, fontWeight:800, color:C.textDk }}>{count}</span>
      </div>
      <div style={{ height:8, background:C.white, borderRadius:4 }}>
        <div style={{ width:pct+"%", height:"100%", background:color, borderRadius:4, transition:"width .3s" }}/>
      </div>
    </div>
  );
}

function SiteTrends({ sites, readings, fromTs, toTs }) {
  const inRange = (sites||[]).filter(x => x && typeof x.ts==="number" && x.ts >= fromTs && x.ts <= toTs);
  const pods    = inRange.filter(x=>x.device==="pod").sort((a,b)=>a.ts-b.ts);
  const sensors = inRange.filter(x=>x.device==="sensor").sort((a,b)=>a.ts-b.ts);

  const fmtAgoDays = ts => {
    const dd = (Date.now()-ts)/86400000;
    return dd < 1 ? "today" : dd < 2 ? "1 day ago" : Math.floor(dd)+" days ago";
  };

  // Wear durations = time between consecutive changes of the same device
  const wears = list => {
    const out=[];
    for (let i=1;i<list.length;i++) out.push((list[i].ts-list[i-1].ts)/86400000);
    return out;
  };
  const avgW = list => { const w=wears(list); return w.length? (w.reduce((a,b)=>a+b,0)/w.length) : null; };
  const podWear = avgW(pods), senWear = avgW(sensors);

  // Usage per location
  const tally = list => {
    const t={}; list.forEach(x=>{ t[x.site]=(t[x.site]||0)+1; }); 
    return Object.entries(t).sort((a,b)=>b[1]-a[1]);
  };
  const podUse = tally(pods), senUse = tally(sensors);
  const podMax = podUse.length? podUse[0][1] : 0;
  const senMax = senUse.length? senUse[0][1] : 0;

  // Rotation freshness: last-used per site, all-time (not window-limited on purpose)
  const lastUsed = dev => {
    const m={};
    (sites||[]).filter(x=>x.device===dev).forEach(x=>{ if(!m[x.site]||x.ts>m[x.site]) m[x.site]=x.ts; });
    return m;
  };

  // BG by pod age — needs enough wears to mean anything
  const MIN_WEARS = 10;
  const podAgeStats = (() => {
    if (pods.length < MIN_WEARS + 1 || !readings || readings.length===0) return null;
    const buckets = [ {label:"Day 1", lo:0, hi:1, vals:[]}, {label:"Day 2", lo:1, hi:2, vals:[]}, {label:"Day 3+", lo:2, hi:4, vals:[]} ];
    for (let i=0;i<pods.length;i++) {
      const start = pods[i].ts;
      const end   = i+1<pods.length ? pods[i+1].ts : Math.min(start+3.5*86400000, Date.now());
      for (const r of readings) {
        if (r.ts < start) continue;
        if (r.ts >= end) continue;
        const age = (r.ts-start)/86400000;
        const b = buckets.find(b => age>=b.lo && age<b.hi);
        if (b) b.vals.push(r.value);
      }
    }
    if (buckets.some(b=>b.vals.length<50)) return null;
    return buckets.map(b=>({
      label:b.label,
      avg: Math.round(b.vals.reduce((a,v)=>a+v,0)/b.vals.length),
      hiPct: Math.round(b.vals.filter(v=>v>TARGET_HIGH).length/b.vals.length*100),
      n: b.vals.length,
    }));
  })();

  const expectedPods = Math.round((toTs-fromTs)/86400000/3);

  if (inRange.length===0) return (
    <Card style={{ marginBottom:12 }}>
      <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>📍 Site Trends</div>
      <div style={{ color:C.textLt, fontSize:12, lineHeight:1.5 }}>
        No pod or sensor changes logged in this date range yet.
        Log changes from the ➕ button → Log a site change, and this section fills in.
      </div>
    </Card>
  );

  return (
    <Card style={{ marginBottom:12 }}>
      <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>📍 Site Trends</div>
      <div style={{ color:C.textLt, fontSize:11, marginBottom:14 }}>
        From logged pod &amp; sensor changes in the selected range
      </div>

      {/* Summary tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, marginBottom:16 }}>
        <div style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.textDk, display:"flex", alignItems:"center", gap:5 }}><PodIcon size={13}/>Pod changes</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>{pods.length}</div>
          <div style={{ fontSize:10, color:C.textLt, fontWeight:600 }}>
            {expectedPods>0 && pods.length<expectedPods*0.7
              ? `~${expectedPods} expected — some may be unlogged`
              : podWear!==null ? `avg wear ${podWear.toFixed(1)}d` : "log more to see avg wear"}
          </div>
        </div>
        <div style={{ background:C.white, borderRadius:12, padding:"10px 12px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.textDk, display:"flex", alignItems:"center", gap:5 }}><SensorIcon size={13}/>Sensor changes</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.textDk, marginTop:2 }}>{sensors.length}</div>
          <div style={{ fontSize:10, color:C.textLt, fontWeight:600 }}>
            {senWear!==null ? `avg wear ${senWear.toFixed(1)}d` : "log more to see avg wear"}
          </div>
        </div>
      </div>

      {/* Usage bars */}
      {podUse.length>0 && (<>
        <div style={{ fontSize:12, fontWeight:800, color:C.textDk, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><PodIcon size={14}/>Pod sites used</div>
        {podUse.map(([site,n])=>(
          <HBar key={site} label={site} count={n} max={podMax} color={POD_ORANGE}
            note={fmtAgoDays(lastUsed("pod")[site])}/>
        ))}
      </>)}
      {senUse.length>0 && (<>
        <div style={{ fontSize:12, fontWeight:800, color:C.textDk, margin:"14px 0 8px", display:"flex", alignItems:"center", gap:6 }}><SensorIcon size={14}/>Sensor sites used</div>
        {senUse.map(([site,n])=>(
          <HBar key={site} label={site} count={n} max={senMax} color={SENSOR_GREEN}
            note={fmtAgoDays(lastUsed("sensor")[site])}/>
        ))}
      </>)}

      {/* Rotation nudge: heavy reuse of one spot */}
      {podMax >= 3 && podUse.length>=2 && podMax >= 2*(podUse[1]?.[1]||1) && (
        <div style={{ background:C.low+"14", borderRadius:10, padding:"8px 10px", marginTop:12,
          fontSize:11, fontWeight:700, color:C.low, lineHeight:1.4 }}>
          💡 {podUse[0][0]} is getting most of the pods — spreading sites out helps absorption stay predictable.
        </div>
      )}

      {/* BG by pod age */}
      <div style={{ marginTop:16 }}>
        <div style={{ fontSize:12, fontWeight:800, color:C.textDk, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><PodIcon size={14}/>BG by pod age</div>
        {podAgeStats ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
            {podAgeStats.map(b=>(
              <div key={b.label} style={{ background:C.white, borderRadius:12, padding:"10px 10px", textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.textMd }}>{b.label}</div>
                <div style={{ fontSize:20, fontWeight:800, color: b.avg>TARGET_HIGH?C.low:C.textDk, marginTop:2 }}>{b.avg}</div>
                <div style={{ fontSize:9, color:C.textLt, fontWeight:600 }}>avg mg/dL · {b.hiPct}% high</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize:11, color:C.textLt, fontWeight:600, lineHeight:1.5 }}>
            Unlocks after ~{MIN_WEARS} logged pod changes — shows whether BG drifts up as each pod ages.
            {pods.length>0 && ` (${pods.length} so far)`}
          </div>
        )}
      </div>
    </Card>
  );
}

// ═══ Analytics Tab ═══════════════════════════════════════════════════════════
const PRESET_PERIODS = [
  { label:"Today", days:0 },
  { label:"7D",  days:7  },
  { label:"14D", days:14 },
  { label:"30D", days:30 },
  { label:"60D", days:60 },
  { label:"90D", days:90 },
];

function toDateInputVal(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2,'0');
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function fromDateInputVal(s) {
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d).getTime();
}

function AnalyticsTab({ bgHistory, ratios, rangeLow, rangeHigh, mealWindows, sites, insulin }) {
  // insights | trends | pulse | ask. Notification deep link: /?open=pulse
  // lands directly on the T1D Pulse tab (App clears the query string after).
  const [view,       setView    ] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("open") === "pulse" ? "pulse" : "insights";
    } catch { return "insights"; }
  });
  const [loading,    setLoading ] = useState(true);
  const [readings,   setReadings] = useState([]);
  const [period,     setPeriod  ] = useState(7);
  const [useCustom,  setUseCustom] = useState(false);
  const ninetyAgo = Date.now() - 90*24*60*60*1000;
  const [customFrom, setCustomFrom] = useState(toDateInputVal(ninetyAgo));
  const [customTo,   setCustomTo  ] = useState(toDateInputVal(Date.now()));

  // Apply user-configured ranges to globals
  TARGET_LOW  = rangeLow;
  TARGET_HIGH = rangeHigh;

  useEffect(() => {
    fetch("/api/bg-store")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setReadings(d); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, []);

  // Compute date window
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  const fromTs = useCustom ? fromDateInputVal(customFrom)
    : period === 0 ? todayMidnight.getTime()
    : Date.now() - period*24*60*60*1000;
  const toTs   = useCustom ? fromDateInputVal(customTo) + 86400000 : Date.now();

  // Keep the date inputs showing the active preset window, not a stale range.
  const shownFrom = useCustom ? customFrom : toDateInputVal(fromTs);
  const shownTo   = useCustom ? customTo   : toDateInputVal(Math.min(toTs, Date.now()));

  const merged = (() => {
    const map = {};
    [...readings, ...(bgHistory||[])].forEach(r => { map[r.ts]=r; });
    return Object.values(map).sort((a,b)=>a.ts-b.ts);
  })();
  const all = merged.filter(r => r.ts >= fromTs && r.ts <= toTs);
  const periodLabel = useCustom
    ? `${new Date(fromTs).toLocaleDateString("en-US",{month:"short",day:"numeric"})}–${new Date(Math.min(toTs,Date.now())).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`
    : period === 0 ? "today" : `${period} days`;

  const stats = computeStats(all, mealWindows);
  const fmtH = h => h===0?"12am":h<12?`${h}am`:h===12?"12pm":`${h-12}pm`;
  const mw = mealWindows || DEFAULT_MEAL_WINDOWS;
  const MEAL_WINDOWS = [
    { key:"breakfast", label:"Breakfast", icon:"☀️",  hours:`${fmtH(mw.breakfast.start)}–${fmtH(mw.breakfast.end)}`  },
    { key:"lunch",     label:"Lunch",     icon:"🌤️", hours:`${fmtH(mw.lunch.start)}–${fmtH(mw.lunch.end)}`           },
    { key:"snack",     label:"Snack",     icon:"🍎",  hours:`${fmtH(mw.snack.start)}–${fmtH(mw.snack.end)}`           },
    { key:"dinner",    label:"Dinner",    icon:"🌙",  hours:`${fmtH(mw.dinner.start)}–${fmtH(mw.dinner.end)}`         },
    { key:"overnight", label:"Overnight", icon:"🌑",  hours:"Remaining hours"                                          },
  ];

  // Ratio recommendation engine
  const ratioRec = (mealKey, avgBG) => {
    if (!avgBG || mealKey === "overnight") return null;
    const current = ratios[mealKey] ?? 12;
    const idealBG = 140; // post-meal target

    if (avgBG > rangeHigh) {
      const suggested = Math.max(5, current - 1);
      return { type:"high", color:C.high,
        text:`Running high (avg ${avgBG}). Try tightening to 1:${suggested}g.`,
        current, suggested };
    }
    if (avgBG > idealBG) {
      return { type:"slightHigh", color:C.low,
        text:`Slightly elevated (avg ${avgBG}). Current 1:${current}g may need small adjustment.`,
        current, suggested: Math.max(5, current - 1) };
    }
    if (avgBG < rangeLow) {
      const suggested = current + 2;
      return { type:"low", color:C.high,
        text:`Running low (avg ${avgBG}). Loosen to 1:${suggested}g.`,
        current, suggested };
    }
    if (avgBG < 100) {
      return { type:"slightLow", color:C.low,
        text:`Trending low (avg ${avgBG}). Consider loosening to 1:${current+1}g.`,
        current, suggested: current + 1 };
    }
    return { type:"good", color:C.inRange,
      text:`Looking good! Avg ${avgBG} — current 1:${current}g ratio is working.`,
      current, suggested: null };
  };

  // Insights/Trends need BG history; T1D Pulse and Ask do not. Render the
  // loading / not-enough-data notices in place of the data views (instead of
  // returning early) so the tab bar — and Pulse/Ask — stay reachable, and the
  // period picker stays available to escape an empty custom range.
  const dataNotice = loading ? (
    <div style={{ textAlign:"center", padding:"60px 0", color:C.textLt }}>
      <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
      <div style={{ fontWeight:700 }}>Loading history…</div>
      <div style={{ fontSize:12, marginTop:6, color:C.textLt }}>Data accumulates every 5 min while app is open</div>
    </div>
  ) : (!stats || all.length < 10) ? (
    <div style={{ textAlign:"center", padding:"60px 20px", color:C.textLt }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📡</div>
      <div style={{ fontWeight:700, fontSize:16, color:C.textDk }}>Not enough data yet</div>
      <div style={{ fontSize:13, marginTop:8, lineHeight:1.5 }}>
        Keep the app open — it collects a reading every 5 minutes.<br/>Check back after a few days.
      </div>
      <div style={{ marginTop:16, background:C.tile, borderRadius:14, padding:"12px 16px", fontSize:13, color:C.textMd, fontWeight:700 }}>
        {all.length} readings stored so far
      </div>
    </div>
  ) : null;

  const oldest = all.length ? new Date(all[0].ts).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
  const newest = all.length ? new Date(all[all.length-1].ts).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";

  return (
    <div className="slideUp">

      {/* ── Insights / Trends / News / Ask / Endo switch ── */}
      <div style={{ display:"flex", gap:18, marginBottom:16, alignItems:"flex-end",
        overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        {[["insights","Insights"],["trends","Trends"],["pulse","News"],["ask","Ask"],["endo","Endo"]].map(([id,label])=>(
          <button key={id} type="button" onClick={()=>setView(id)}
            style={{ background:"none", border:"none", padding:"0 0 4px", cursor:"pointer",
              fontFamily:"inherit", fontWeight:800, fontSize:20, whiteSpace:"nowrap", flex:"0 0 auto",
              color: view===id ? C.textDk : C.textLt,
              borderBottom: view===id ? `3px solid ${C.ravens}` : "3px solid transparent" }}>
            {label}
          </button>
        ))}
      </div>

      {view!=="ask" && view!=="pulse" && view!=="endo" && !loading && (<>
      {/* Period picker */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:5, marginBottom:8 }}>
          {PRESET_PERIODS.map(p=>(
            <button key={p.days} type="button" onClick={()=>{
              setPeriod(p.days);
              setUseCustom(false);
              setCustomFrom(toDateInputVal(p.days === 0 ? Date.now() : Date.now() - p.days*24*60*60*1000));
              setCustomTo(toDateInputVal(Date.now()));
            }}
              style={{ padding:"8px 0", borderRadius:20, fontFamily:"inherit", textAlign:"center", fontWeight:800, fontSize:12,
                border: "none",
                background: (!useCustom && period===p.days) ? C.textDk : C.tile,
                color: (!useCustom && period===p.days) ? "#fff" : C.textMd, cursor:"pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Custom date range */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type="date" value={shownFrom}
            onChange={e=>{ setCustomFrom(e.target.value); setUseCustom(true); }}
            style={{ flex:1, padding:"8px 10px", borderRadius:12, fontSize:12, fontFamily:"inherit",
              border: useCustom ? `2px solid ${C.ravens}` : "2px solid transparent",
              color:C.textDk, outline:"none", background:C.tile }}/>
          <span style={{ color:C.textLt, fontSize:12, fontWeight:600 }}>to</span>
          <input type="date" value={shownTo}
            onChange={e=>{ setCustomTo(e.target.value); setUseCustom(true); }}
            style={{ flex:1, padding:"8px 10px", borderRadius:12, fontSize:12, fontFamily:"inherit",
              border: useCustom ? `2px solid ${C.ravens}` : "2px solid transparent",
              color:C.textDk, outline:"none", background:C.tile }}/>
        </div>
        <div style={{ fontSize:11, color:C.textLt, marginTop:6, textAlign:"center" }}>
          {all.length === 0
            ? "No readings in this range"
            : `${all.length.toLocaleString()} readings · ${new Date(fromTs).toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${new Date(Math.min(toTs,Date.now())).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
        </div>
      </div>


      </>)}

      {view==="insights" && (dataNotice ||
        <InsightsGrid periodReadings={all} allReadings={merged} periodLabel={periodLabel} mealWindows={mealWindows} fromTs={fromTs} toTs={toTs}/>)}

      {view==="pulse" && <T1DPulse/>}

      {view==="ask" && <AskTab/>}

      {view==="endo" && <EndoTab readings={merged} insulin={insulin} sites={sites} mealWindows={mealWindows}/>}

      {view==="trends" && dataNotice}
      {view==="trends" && !dataNotice && (<>
      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <div style={{ fontSize:11, color:C.textLt, fontWeight:700 }}>
          {all.length.toLocaleString()} readings · {oldest}–{newest}
        </div>
        <div style={{ fontSize:11, color:C.textLt, fontWeight:700 }}>
          Range: {rangeLow}–{rangeHigh}
        </div>
      </div>

      {/* Time in Range summary */}
      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:14 }}>🎯 Time in Range ({rangeLow}–{rangeHigh})</div>
        <div style={{ display:"flex", gap:0, height:20, borderRadius:10, overflow:"hidden", marginBottom:12 }}>
          <div style={{ flex:stats.tirPct,  background:C.inRange, transition:"flex .5s" }}/>
          <div style={{ flex:stats.highPct, background:C.high,    transition:"flex .5s" }}/>
          <div style={{ flex:stats.lowPct,  background:C.low,     transition:"flex .5s" }}/>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          {[
            { label:"In Range", pct:stats.tirPct,  color:C.inRange },
            { label:"High",     pct:stats.highPct, color:C.high    },
            { label:"Low",      pct:stats.lowPct,  color:C.low     },
          ].map(s=>(
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.pct}%</div>
              <div style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:C.textDk }}>{stats.avg}</div>
            <div style={{ fontSize:11, color:C.textLt, fontWeight:600 }}>Avg BG</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:700, color:C.textDk }}>{stats.a1c}%</div>
            <div style={{ fontSize:11, color:C.textLt, fontWeight:600 }}>Est. A1c</div>
          </div>
        </div>
      </Card>

      {/* Ratio analysis by meal time — the main event */}
      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>💉 Ratio Analysis by Meal</div>
        <div style={{ color:C.textLt, fontSize:11, marginBottom:16 }}>
          Based on avg BG during each meal window. Adjust ratios in ⚙️ Settings.
        </div>
        {MEAL_WINDOWS.filter(w => stats.byWindow[w.key]).map((w, idx) => {
          const avg = stats.byWindow[w.key];
          const rec = ratioRec(w.key, avg);
          const bgColor = avg < rangeLow ? C.low : avg > rangeHigh ? C.high : C.inRange;
          const currentRatio = ratios[w.key];
          return (
            <div key={w.key} style={{ marginBottom: idx < MEAL_WINDOWS.length-1 ? 18 : 0,
              paddingBottom: idx < MEAL_WINDOWS.length-1 ? 18 : 0,
              borderBottom: idx < MEAL_WINDOWS.length-1 ? `1px solid ${C.border}` : "none" }}>

              {/* Meal header row */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:800, color:C.textDk, fontSize:14 }}>{w.icon} {w.label}</div>
                  <div style={{ fontSize:10, color:C.textLt, fontWeight:600 }}>{w.hours}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:26, fontWeight:900, color:bgColor, lineHeight:1 }}>{avg}</div>
                  <div style={{ fontSize:10, color:C.textLt }}>mg/dL avg</div>
                </div>
              </div>

              {/* BG position bar */}
              <div style={{ position:"relative", height:8, background:C.tile, borderRadius:4, marginBottom:8 }}>
                {/* in-range zone */}
                <div style={{ position:"absolute", left:`${(rangeLow/320)*100}%`,
                  width:`${((rangeHigh-rangeLow)/320)*100}%`,
                  height:"100%", background:C.inRange+"33", borderRadius:4 }}/>
                {/* avg dot */}
                <div style={{ position:"absolute", top:-2, width:12, height:12, borderRadius:"50%",
                  background:bgColor, border:"2px solid #fff", boxShadow:`0 0 6px ${bgColor}88`,
                  left:`${Math.min((avg/320)*100,95)}%`, transform:"translateX(-50%)" }}/>
              </div>

              {/* Current ratio + recommendation */}
              {w.key !== "overnight" && (
                <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                  <div style={{ background:C.white, borderRadius:10, padding:"6px 12px",
                    fontSize:12, fontWeight:800, color:C.textMd, flexShrink:0 }}>
                    Current: 1:{currentRatio}g
                  </div>
                  {rec && (
                    <div style={{ flex:1, background:rec.color+"11", border:`1.5px solid ${rec.color}33`,
                      borderRadius:10, padding:"6px 10px", fontSize:11, fontWeight:700, color:rec.color,
                      lineHeight:1.4 }}>
                      {rec.type==="good" ? "✅ " : rec.type==="high"||rec.type==="low" ? "⚠️ " : "💡 "}
                      {rec.text}
                      {rec.suggested && rec.type!=="good" && (
                        <div style={{ marginTop:4, color:C.textMd, fontWeight:600, fontSize:10 }}>
                          Suggested: 1:{rec.suggested}g — confirm with endo before changing
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {w.key === "overnight" && (
                <div style={{ fontSize:11, color:C.textMd, fontWeight:600, lineHeight:1.4 }}>
                  {avg > rangeHigh ? "⚠️ High overnight — discuss basal rate with endo"
                   : avg < rangeLow ? "⚠️ Low overnight — discuss basal rate with endo"
                   : "✅ Overnight numbers look solid"}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* Highs & lows over time — raw daily counts */}
      <HighLowTrend readings={all} rangeLow={rangeLow} rangeHigh={rangeHigh} mealWindows={mealWindows}/>

      {/* Site trends — driven by the same date filters */}
      <InsulinTrends insulin={insulin} readings={all} fromTs={fromTs} toTs={toTs} mealWindows={mealWindows} ratios={ratios}/>

      <SiteTrends sites={sites} readings={all} fromTs={fromTs} toTs={toTs}/>

      </>)}

      <div style={{ textAlign:"center", color:C.textLt, fontSize:11, paddingBottom:20, lineHeight:1.6 }}>
        {readings.length.toLocaleString()} readings stored · accumulates every 5 min<br/>
        Always confirm ratio changes with Hudson's endocrinologist
      </div>
    </div>
  );
}

// ═══ Insights grid (Sugarmate-style tiles) ═══════════════════════════════════

// ═══ Metric trend sheet ══════════════════════════════════════════════════════
// Tap any Insights tile → that metric across every period bucket at once.
const TREND_BUCKETS = [
  { id:"today", label:"Today" },
  { id:"7",  label:"7D",  days:7  },
  { id:"14", label:"14D", days:14 },
  { id:"30", label:"30D", days:30 },
  { id:"60", label:"60D", days:60 },
  { id:"90", label:"90D", days:90 },
];

const TREND_METRICS = {
  avg:      { title:"Average Glucose",  unit:"mg/dL", kind:"single", pick: i => i.avgP },
  gmi:      { title:"GMI",              unit:"%",     kind:"single", pick: i => i.gmi !== null ? parseFloat(i.gmi) : null },
  sd:       { title:"Std. Dev.",        unit:"mg/dL", kind:"single", pick: i => i.sd },
  bedtime:  { title:"🌙 Bedtime Avg.",  unit:"mg/dL", kind:"single", pick: i => i.bedtimeP },
  wakeup:   { title:"☀️ Wake Up Avg.",  unit:"mg/dL", kind:"single", pick: i => i.wakeupP },
  quart:    { title:"Quartiles",        unit:"mg/dL", kind:"quart",  pick: i => i.q },
  inrange:  { title:"% In Range",       unit:"%",     kind:"single", pick: i => i.inRP },
  tir:      { title:"Normal Range %",   unit:"",      kind:"tir",    pick: i => (i.inRP===null ? null : { below:i.belowP, inR:i.inRP, above:i.aboveP }) },
  highlow:  { title:"Highs / Lows",     unit:"",      kind:"pair",   pick: i => ({ a:i.highsP, b:i.lowsP }) },
  unicorns: { title:"🦄 Unicorns",      unit:"",      kind:"single", pick: i => i.unicornsP },
  onhighs:  { title:"🌑 Overnight Highs", unit:"",    kind:"single", pick: i => i.onHighs },
  onlows:   { title:"🌑 Overnight Lows",  unit:"",    kind:"single", pick: i => i.onLows },
};

function MetricTrendSheet({ metric, allReadings, mealWindows, onClose }) {
  const def = TREND_METRICS[metric];
  const rows = useMemo(() => {
    if (!def) return [];
    const now = Date.now();
    const midnight = new Date(); midnight.setHours(0,0,0,0);
    return TREND_BUCKETS.map(b => {
      const from = b.id === "today" ? midnight.getTime() : now - b.days*86400000;
      const P = (allReadings || []).filter(r => r && r.ts >= from);
      const ins = P.length ? computeInsights(P, allReadings, mealWindows, from, now) : null;
      return { ...b, v: ins ? def.pick(ins) : null, n: P.length };
    });
  }, [metric, allReadings, mealWindows]);
  if (!def) return null;

  const nums = rows.map(r => (def.kind === "single" ? r.v : null)).filter(v => v !== null && !isNaN(v));
  const maxV = nums.length ? Math.max(...nums) : 1;
  const isCount = ["highlow","unicorns","onhighs","onlows"].includes(metric);

  return (
    <>
      <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:80 }}/>
      <div style={{ position:"fixed", left:0, right:0, bottom:0, zIndex:81,
        background:C.white, borderRadius:"20px 20px 0 0", padding:"18px 18px 26px",
        maxHeight:"75vh", overflowY:"auto", boxShadow:"0 -8px 30px rgba(0,0,0,0.18)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
          <div style={{ fontWeight:800, fontSize:16, color:C.textDk }}>{def.title}</div>
          <button type="button" onClick={onClose}
            style={{ border:"none", background:C.tile, borderRadius:"50%", width:30, height:30,
              fontSize:15, cursor:"pointer", color:C.textDk }}>✕</button>
        </div>
        <div style={{ fontSize:11, color:C.textLt, fontWeight:600, marginBottom:14 }}>
          across periods{isCount ? " · totals — longer periods naturally count more" : ""}
        </div>

        {rows.map(r => (
          <div key={r.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0" }}>
            <div style={{ width:44, fontSize:12, fontWeight:800, color:C.textDk, flexShrink:0 }}>{r.label}</div>

            {def.kind === "single" && (
              <>
                <div style={{ flex:1, height:16, background:C.tile, borderRadius:8, overflow:"hidden" }}>
                  {r.v !== null && !isNaN(r.v) && (
                    <div style={{ width:`${Math.max(3, (r.v/maxV)*100)}%`, height:"100%",
                      background:C.ravens, borderRadius:8, opacity:0.85 }}/>
                  )}
                </div>
                <div style={{ width:70, textAlign:"right", fontSize:13, fontWeight:800, color:C.textDk, flexShrink:0 }}>
                  {r.v ?? "—"}{r.v !== null && def.unit ? <span style={{ fontSize:9.5, color:C.textMd, fontWeight:600 }}> {def.unit}</span> : null}
                </div>
              </>
            )}

            {def.kind === "tir" && (
              r.v ? (
                <>
                  <div style={{ flex:1, height:16, borderRadius:8, overflow:"hidden", display:"flex" }}>
                    <div style={{ width:`${r.v.below}%`, background:C.low }}/>
                    <div style={{ width:`${r.v.inR}%`,  background:C.inRange }}/>
                    <div style={{ width:`${r.v.above}%`, background:C.high }}/>
                  </div>
                  <div style={{ width:70, textAlign:"right", fontSize:12, fontWeight:800, color:C.textDk, flexShrink:0 }}>{r.v.inR}%</div>
                </>
              ) : <div style={{ flex:1, fontSize:12, color:C.textLt }}>—</div>
            )}

            {def.kind === "pair" && (
              r.v && (r.v.a + r.v.b) > 0 ? (
                <>
                  <div style={{ flex:1, height:16, borderRadius:8, overflow:"hidden", display:"flex", background:C.tile }}>
                    <div style={{ width:`${(r.v.a/(r.v.a+r.v.b))*100}%`, background:C.high }}/>
                    <div style={{ width:`${(r.v.b/(r.v.a+r.v.b))*100}%`, background:C.low }}/>
                  </div>
                  <div style={{ width:70, textAlign:"right", fontSize:12, fontWeight:800, flexShrink:0 }}>
                    <span style={{ color:C.high }}>{r.v.a}</span>
                    <span style={{ color:C.textLt }}> / </span>
                    <span style={{ color:C.low }}>{r.v.b}</span>
                  </div>
                </>
              ) : <div style={{ flex:1, fontSize:12, color:C.textLt }}>0 / 0</div>
            )}

            {def.kind === "quart" && (
              r.v ? (
                <div style={{ flex:1, textAlign:"right", fontSize:13, fontWeight:700, color:C.textMd }}>
                  {r.v.p25} · <b style={{ color:C.textDk, fontSize:15 }}>{r.v.p50}</b> · {r.v.p75}
                </div>
              ) : <div style={{ flex:1, textAlign:"right", fontSize:12, color:C.textLt }}>—</div>
            )}
          </div>
        ))}
        <div style={{ fontSize:10, color:C.textLt, marginTop:10, textAlign:"center" }}>
          Rolling windows ending now · tap outside to close
        </div>
      </div>
    </>
  );
}

function InsightTile({ label, sub, children, onClick }) {
  return (
    <div onClick={onClick} role={onClick ? "button" : undefined}
      style={{ background:C.tile, borderRadius:14, padding:"12px 12px 13px",
      display:"flex", flexDirection:"column", minHeight:116,
      cursor: onClick ? "pointer" : "default",
      WebkitTapHighlightColor:"transparent" }}>
      <div style={{ fontSize:12, fontWeight:700, color:C.textDk, lineHeight:1.25, minHeight:30 }}>{label}</div>
      <div style={{ fontSize:10, color:C.textLt, fontWeight:600, marginTop:2 }}>{sub}</div>
      <div style={{ marginTop:"auto", paddingTop:8 }}>{children}</div>
    </div>
  );
}

function Big({ v, unit }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
      <span style={{ fontSize:26, fontWeight:800, color:C.textDk, letterSpacing:-0.5, lineHeight:1 }}>{v ?? "—"}</span>
      {unit && <span style={{ fontSize:10, color:C.textMd, fontWeight:600 }}>{unit}</span>}
    </div>
  );
}

function InsightsGrid({ periodReadings, allReadings, periodLabel, mealWindows, fromTs, toTs }) {
  const [trend, setTrend] = useState(null);
  const ins = computeInsights(periodReadings, allReadings, mealWindows, fromTs, toTs);
  if (!ins) return null;
  const P = periodLabel || "period";
  return (
    <div style={{ marginBottom:18 }}>
      {trend && <MetricTrendSheet metric={trend} allReadings={allReadings}
        mealWindows={mealWindows} onClose={()=>setTrend(null)}/>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
        <InsightTile label="Average Glucose" sub={P} onClick={()=>setTrend("avg")}><Big v={ins.avgP} unit="mg/dL"/></InsightTile>
        <InsightTile label="GMI" sub={P} onClick={()=>setTrend("gmi")}><Big v={ins.gmi} unit="%"/></InsightTile>
        <InsightTile label="Std. Dev." sub={P} onClick={()=>setTrend("sd")}><Big v={ins.sd !== null ? `±${ins.sd}` : null} unit="mg/dL"/></InsightTile>

        <InsightTile label="🌙 Bedtime Avg." sub={P} onClick={()=>setTrend("bedtime")}><Big v={ins.bedtimeP} unit="mg/dL"/></InsightTile>
        <InsightTile label="☀️ Wake Up Avg." sub={P} onClick={()=>setTrend("wakeup")}><Big v={ins.wakeupP} unit="mg/dL"/></InsightTile>
        <InsightTile label="Quartiles" sub={P} onClick={()=>setTrend("quart")}>
          {ins.q ? (
            <div style={{ display:"flex", alignItems:"baseline", gap:5 }}>
              <span style={{ fontSize:12, fontWeight:600, color:C.textMd }}>{ins.q.p25}</span>
              <span style={{ fontSize:26, fontWeight:800, color:C.textDk, letterSpacing:-0.5, lineHeight:1 }}>{ins.q.p50}</span>
              <span style={{ fontSize:12, fontWeight:600, color:C.textMd }}>{ins.q.p75}</span>
            </div>
          ) : <Big v={null}/>}
        </InsightTile>

        <InsightTile label="% In Range" sub={P} onClick={()=>setTrend("inrange")}>
          <Big v={ins.inRP !== null ? `${ins.inRP}%` : null}/>
        </InsightTile>
        <InsightTile label="Normal Range %" sub={P} onClick={()=>setTrend("tir")}>
          {ins.inRP !== null ? (
            <div style={{ display:"flex", gap:5, alignItems:"baseline" }}>
              <span style={{ fontSize:12, fontWeight:700, color:C.low }}>{ins.belowP}%</span>
              <span style={{ fontSize:26, fontWeight:800, color:C.textDk, letterSpacing:-0.5, lineHeight:1 }}>{ins.inRP}%</span>
              <span style={{ fontSize:12, fontWeight:700, color:C.high }}>{ins.aboveP}%</span>
            </div>
          ) : <Big v={null}/>}
        </InsightTile>
        <InsightTile label="Highs/Lows" sub={P} onClick={()=>setTrend("highlow")}>
          <div style={{ fontSize:26, fontWeight:800, letterSpacing:-0.5, lineHeight:1 }}>
            <span style={{ color:C.high }}>{ins.highsP}</span>
            <span style={{ color:C.textLt, fontWeight:600 }}> / </span>
            <span style={{ color:C.low }}>{ins.lowsP}</span>
          </div>
        </InsightTile>

        <InsightTile label="🦄 Unicorns" sub={P} onClick={()=>setTrend("unicorns")}><Big v={ins.unicornsP} unit="perfect 100s"/></InsightTile>
        <InsightTile label="🌑 Overnight Highs" sub={P} onClick={()=>setTrend("onhighs")}>
          <div style={{ display:"flex", alignItems:"baseline", gap:7 }}>
            <span style={{ fontSize:26, fontWeight:800, color:C.high, lineHeight:1, letterSpacing:-0.5 }}>{ins.onHighs}</span>
            {ins.onHighPct !== null && ins.onHighPct !== 0 && (
              <span style={{ fontSize:13, fontWeight:800,
                color: ins.onHighPct > 0 ? C.high : C.inRange }}>
                {ins.onHighPct > 0 ? "▲" : "▼"}{Math.abs(ins.onHighPct)}%
              </span>
            )}
          </div>
          <div style={{ fontSize:9, color:C.textLt, fontWeight:600, marginTop:2 }}>
            {ins.onPrev ? `vs ${ins.onPrev.highs} prior period` : "no prior period to compare"}
          </div>
        </InsightTile>
        <InsightTile label="🌑 Overnight Lows" sub={P} onClick={()=>setTrend("onlows")}>
          <div style={{ display:"flex", alignItems:"baseline", gap:7 }}>
            <span style={{ fontSize:26, fontWeight:800, color:C.low, lineHeight:1, letterSpacing:-0.5 }}>{ins.onLows}</span>
            {ins.onLowPct !== null && ins.onLowPct !== 0 && (
              <span style={{ fontSize:13, fontWeight:800,
                color: ins.onLowPct > 0 ? C.high : C.inRange }}>
                {ins.onLowPct > 0 ? "▲" : "▼"}{Math.abs(ins.onLowPct)}%
              </span>
            )}
          </div>
          <div style={{ fontSize:9, color:C.textLt, fontWeight:600, marginTop:2 }}>
            {ins.onPrev ? `vs ${ins.onPrev.lows} prior period` : "no prior period to compare"}
          </div>
        </InsightTile>
      </div>
    </div>
  );
}

// ═══ Quote Banner ══════════════════════════════════════════════════════════════
function QuoteBanner() {
  const q = getDailyQuote();
  return (
    <div style={{ background:C.tile, borderLeft:`3px solid ${C.ravens}`,
      borderRadius:14, padding:"16px 18px", marginBottom:14, position:"relative", overflow:"hidden" }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.ravens, letterSpacing:0.4, marginBottom:6 }}>
        🏈 MARK ANDREWS MODE
      </div>
      <div style={{ fontSize:15, fontWeight:500, color:C.textDk, lineHeight:1.45, marginBottom:6 }}>{q.text}</div>
      <div style={{ fontSize:12, color:C.textLt }}>— {q.attr}</div>
    </div>
  );
}

// ═══ Seed Button ═════════════════════════════════════════════════════════════
function SeedButton() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [count,  setCount ] = useState(0);

  const run = async () => {
    setStatus("loading");
    try {
      const r = await fetch("/api/seed");
      const j = await r.json();
      if (j.stored) { setCount(j.stored); setStatus("done"); }
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  if (status === "done") return (
    <div style={{ background:"#27AE6011", border:"1.5px solid #27AE6033", borderRadius:12,
      padding:"10px 14px", fontSize:12, fontWeight:700, color:"#27AE60", textAlign:"center" }}>
      ✅ {count.toLocaleString()} readings imported successfully
    </div>
  );

  return (
    <button type="button" onClick={run} disabled={status==="loading"}
      style={{ width:"100%", padding:"11px 0", borderRadius:10, fontFamily:"inherit",
        background: status==="error" ? C.white : C.textDk,
        color: status==="error" ? C.high : "#fff",
        border: status==="error" ? `1px solid ${C.high}55` : "none",
        fontWeight:800, fontSize:13, cursor:status==="loading"?"not-allowed":"pointer",
        opacity:status==="loading"?0.7:1 }}>
      {status==="loading" ? "⏳ Importing… this takes ~30 seconds"
       : status==="error"  ? "⚠️ Import failed — tap to retry"
       : "🔄 Re-import 90-Day History"}
    </button>
  );
}

// ═══ Push Notification Toggle ═════════════════════════════════════════════════
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  const view    = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return view;
}

function PushToggle() {
  const [status, setStatus]   = useState("loading"); // loading|unsupported|needs-install|off|on|blocked
  const [busy,   setBusy  ]   = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      const supported = "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        // iOS only exposes push from a home-screen-installed PWA.
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const standalone = window.matchMedia("(display-mode: standalone)").matches
          || window.navigator.standalone === true;
        setStatus(isIos && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") { setStatus("blocked"); return; }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setStatus(sub ? "on" : "off");
      } catch { setStatus("off"); }
    })();
  }, []);

  const enable = async () => {
    setBusy(true); setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        setBusy(false); return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!key) { setMessage("Notifications aren't configured yet."); setBusy(false); return; }

      const sub  = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON();

      const r = await fetch("/api/push-subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint:  json.endpoint,
          p256dh:    json.keys?.p256dh,
          auth:      json.keys?.auth,
          userAgent: navigator.userAgent,
          label:     /iphone|ipad/i.test(navigator.userAgent) ? "iPhone"
                   : /android/i.test(navigator.userAgent) ? "Android" : "Computer",
        }),
      });
      if (!r.ok) { setMessage("Couldn't save notification settings."); setBusy(false); return; }
      setStatus("on");
      setMessage("Notifications are on for this device.");
    } catch {
      setMessage("Couldn't turn on notifications on this device.");
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push-subscribe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint, remove: true }),
        }).catch(()=>{});
        await sub.unsubscribe();
      }
    } catch {}
    setStatus("off");
    setMessage("Notifications are off for this device.");
    setBusy(false);
  };

  if (status === "loading") return null;

  const box = { background:C.white, border:"none", borderRadius:12,
    padding:"10px 14px", fontSize:12, color:C.textMd, lineHeight:1.5, fontWeight:600 };

  if (status === "unsupported")
    return <div style={box}>This browser doesn't support notifications.</div>;

  if (status === "needs-install")
    return (
      <div style={box}>
        📲 To get notifications on this phone: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>,
        then open the app from the home screen and turn notifications on here.
      </div>
    );

  if (status === "blocked")
    return (
      <div style={box}>
        🔕 Notifications are blocked for this app. Turn them back on in your device settings, then reload.
      </div>
    );

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:C.textDk, fontSize:14 }}>
            {status === "on" ? "✅ On for this device" : "Off for this device"}
          </div>
          <div style={{ fontSize:11, color:C.textLt, marginTop:2 }}>
            Daily 8am pod &amp; sensor reminder
          </div>
        </div>
        <Btn variant={status==="on" ? "secondary" : "primary"}
          onClick={status === "on" ? disable : enable}
          disabled={busy}
          style={{ fontSize:13, padding:"9px 18px", flexShrink:0 }}>
          {busy ? "…" : status === "on" ? "Turn off" : "Turn on"}
        </Btn>
      </div>
      {message && <div style={{ fontSize:11, color:C.textLt, marginTop:8 }}>{message}</div>}
      <div style={{ fontSize:11, color:C.textLt, marginTop:8, lineHeight:1.5 }}>
        Each phone needs turning on separately — do this on Hudson's phone and each parent's.
      </div>
    </div>
  );
}

// ═══ Settings Modal ═══════════════════════════════════════════════════════════
function SettingsModal({ ratios, setRatios, rangeLow, setRangeLow, rangeHigh, setRangeHigh, mealWindows, setMealWindows, onClose }) {
  const [local, setLocal]               = useState({ ...ratios });
  const [localMW, setLocalMW]           = useState({ ...(mealWindows||DEFAULT_MEAL_WINDOWS) });
  const fmtH = h => h===0?"12am":h<12?`${h}am`:h===12?"12pm":`${h-12}pm`;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(0,0,0,0.35)",
        display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:C.white, borderRadius:"16px 16px 0 0", padding:"22px 22px 44px",
        width:"100%", maxWidth:480, boxShadow:"0 -8px 40px rgba(0,0,0,0.3)",
        animation:"slideUp .28s ease both", overflowY:"auto", maxHeight:"90vh" }}>
        <div style={{ width:36, height:4, borderRadius:2, background:C.border, margin:"0 auto 20px" }}/>

        <div style={{ fontWeight:900, fontSize:19, color:C.textDk, marginBottom:4 }}>⚙️ Insulin Ratios</div>
        <div style={{ color:C.textMd, fontSize:13, marginBottom:22 }}>1 unit covers this many grams of carbs</div>

        {MEALS.map(m=>(
          <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
            <div style={{ fontWeight:700, color:C.textDk, fontSize:15, minWidth:90 }}>{m.icon} {m.label}</div>
            <NumPad value={local[m.id]??m.defaultRatio} onChange={v=>setLocal(p=>({...p,[m.id]:v}))} step={1} min={5} max={40} unit="g"/>
          </div>
        ))}

        <div style={{ background:C.tile, borderRadius:12, padding:"10px 14px", color:C.textMd, fontSize:12, marginBottom:24 }}>
          📐 Correction: 1u drops BG by {CORRECTION_FACTOR} mg/dL · Target: {TARGET_BG} mg/dL
        </div>

        {/* BG Target Range */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:900, fontSize:16, color:C.textDk, marginBottom:4 }}>🎯 Target BG Range</div>
          <div style={{ color:C.textMd, fontSize:12, marginBottom:16 }}>Used for Time in Range and Trends analysis</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontWeight:700, color:C.textDk, fontSize:15 }}>🟡 Low threshold</div>
            <NumPad value={rangeLow} onChange={setRangeLow} step={5} min={60} max={100} unit=""/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontWeight:700, color:C.textDk, fontSize:15 }}>🔴 High threshold</div>
            <NumPad value={rangeHigh} onChange={setRangeHigh} step={5} min={140} max={250} unit=""/>
          </div>
        </div>

        {/* Meal Window Times */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:900, fontSize:16, color:C.textDk, marginBottom:4 }}>⏰ Meal Time Windows</div>
          <div style={{ color:C.textMd, fontSize:12, marginBottom:16 }}>
            Adjust which hours count as each meal — affects Trends analysis
          </div>
          {["breakfast","lunch","snack","dinner"].map(key => {
            const m     = MEALS.find(x=>x.id===key);
            const win   = localMW[key];
            return (
              <div key={key} style={{ marginBottom:14 }}>
                <div style={{ fontWeight:700, color:C.textDk, fontSize:14, marginBottom:8 }}>
                  {m?.icon} {m?.label}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:C.textLt, fontWeight:700, marginBottom:4 }}>START</div>
                    <NumPad value={win.start} step={1} min={0} max={23} unit="h"
                      onChange={v=>setLocalMW(p=>({...p,[key]:{...p[key],start:v}}))}/>
                    <div style={{ textAlign:"center", fontSize:10, color:C.textMd, marginTop:2 }}>{fmtH(win.start)}</div>
                  </div>
                  <div style={{ color:C.textLt, fontWeight:700 }}>→</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:C.textLt, fontWeight:700, marginBottom:4 }}>END</div>
                    <NumPad value={win.end} step={1} min={0} max={23} unit="h"
                      onChange={v=>setLocalMW(p=>({...p,[key]:{...p[key],end:v}}))}/>
                    <div style={{ textAlign:"center", fontSize:10, color:C.textMd, marginTop:2 }}>{fmtH(win.end)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Push notifications */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:900, fontSize:16, color:C.textDk, marginBottom:4 }}>🔔 Daily Reminders</div>
          <div style={{ color:C.textMd, fontSize:12, marginBottom:12 }}>
            An 8am notification with pod and sensor wear time remaining
          </div>
          <PushToggle />
        </div>

        {/* Re-import history */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:900, fontSize:16, color:C.textDk, marginBottom:4 }}>📂 BG History</div>
          <div style={{ color:C.textMd, fontSize:12, marginBottom:12 }}>
            Re-import the 90-day Sugarmate export (Mar 13 – Jun 11, 2026)
          </div>
          <SeedButton />
          <GlookoImport />
        </div>

        <div style={{ display:"flex", gap:12 }}>
          <Btn variant="secondary" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
          <Btn onClick={()=>{ setRatios(local); setMealWindows(localMW); onClose(); }} style={{ flex:1 }}>Save Changes</Btn>
        </div>
      </div>
    </div>
  );
}

// ═══ Log Row ══════════════════════════════════════════════════════════════════
function LogRow({ entry, onDelete }) {
  const st   = getBGStatus(entry.bg);
  const meal = MEALS.find(m=>m.id===entry.mealId);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"36px 1fr auto auto",
      alignItems:"center", gap:10, padding:"10px 4px", borderBottom:`1px solid ${C.border}` }}>
      <div style={{ fontSize:22, textAlign:"center" }}>{meal?.icon}</div>
      <div>
        <div style={{ fontWeight:700, color:C.textDk, fontSize:14 }}>
          {meal?.label} · <span style={{ color:C.textMd, fontWeight:500 }}>{entry.time}</span>
        </div>
        <div style={{ fontSize:12, color:C.textLt, marginTop:1 }}>
          {entry.carbs}g carbs{entry.bg?` · BG ${entry.bg}`:""}
        </div>
      </div>
      {st&&<Badge color={st.color}>{entry.bg}</Badge>}
      <div style={{ textAlign:"right" }}>
        <div style={{ fontSize:20, fontWeight:600, color:C.textDk }}>{entry.dose}u</div>
        <button type="button" onClick={()=>onDelete(entry.id)}
          style={{ background:"none", border:"none", cursor:"pointer", color:C.textLt, fontSize:11, padding:"2px 0", fontFamily:"inherit" }}>remove</button>
      </div>
    </div>
  );
}

// ═══ Sites Tab ════════════════════════════════════════════════════════════════
function pad2(n){ return String(n).padStart(2,"0"); }
function toDateVal(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
function toTimeVal(d){ return pad2(d.getHours())+":"+pad2(d.getMinutes()); }

function tsFromInputs(dateStr, timeStr) {
  const [y,m,d] = dateStr.split("-").map(Number);
  const [hh,mm] = timeStr.split(":").map(Number);
  return new Date(y, m-1, d, hh, mm).getTime();
}

function SitesTab({ sites, onAdd, onDelete }) {
  const now = new Date();
  const [device, setDevice] = useState("pod");
  const [date,   setDate  ] = useState(toDateVal(now));
  const [time,   setTime  ] = useState(toTimeVal(now));
  const [site,   setSite  ] = useState(SITE_OPTIONS.pod[0]);
  const [saved,  setSaved ] = useState(false);

  const pickDevice = d => { setDevice(d); setSite(SITE_OPTIONS[d][0]); };

  // Most recent entry per device
  const latest = {};
  ["pod","sensor"].forEach(d => {
    const list = sites.filter(s => s.device===d).sort((a,b)=>b.ts-a.ts);
    if (list.length) latest[d] = list[0];
  });

  // Sites used in the last 21 days — used to nudge rotation
  const recentSites = sites
    .filter(s => s.device===device && Date.now()-s.ts < 21*86400000)
    .map(s => s.site);
  const lastUsed = {};
  sites.filter(s => s.device===device).forEach(s => {
    if (!lastUsed[s.site] || s.ts > lastUsed[s.site]) lastUsed[s.site] = s.ts;
  });

  const submit = () => {
    const ts = tsFromInputs(date, time);
    if (!ts || isNaN(ts)) return;
    onAdd({ id: Date.now(), device, site, ts });
    setSaved(true); setTimeout(()=>setSaved(false), 2200);
  };

  const daysAgo = ts => (Date.now()-ts)/86400000;

  // Expiry as a wall-clock moment rather than a countdown.
  const fmtExpiry = ts => {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
    const startOf = x => { const y = new Date(x); y.setHours(0,0,0,0); return y.getTime(); };
    const dayDiff = Math.round((startOf(d) - startOf(new Date())) / 86400000);
    if (dayDiff === 0)  return `Today at ${time}`;
    if (dayDiff === 1)  return `Tomorrow at ${time}`;
    if (dayDiff === -1) return `Yesterday at ${time}`;
    const day = d.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
    return `${day} at ${time}`;
  };
  const fmtAgo = ts => {
    const h = (Date.now()-ts)/3600000;
    if (h < 1)  return "just now";
    if (h < 24) return `${Math.floor(h)}h ago`;
    const d = Math.floor(h/24);
    return d===1 ? "1 day ago" : `${d} days ago`;
  };

  return (
    <div className="slideUp">

      {/* Current wear status */}
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14, marginTop:14 }}>
        {["pod","sensor"].map(d => {
          const dev = DEVICES[d];
          const cur = latest[d];
          const age = cur ? daysAgo(cur.ts) : null;
          const left = cur ? dev.wearDays - age : null;
          const overdue = left !== null && left <= 0;
          const soon    = left !== null && left > 0 && left <= 0.75;
          const col = overdue ? C.high : soon ? C.low : C.inRange;
          return (
            <Card key={d} style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
              <DevIcon device={d} size={22}/>
              <div style={{ fontWeight:800, color:C.textDk, fontSize:13 }}>{dev.label}</div>
              {cur ? (
                <div style={{ display:"flex", alignItems:"baseline", gap:8, marginLeft:"auto" }}>
                  <span style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>{cur.site}</span>
                  <span style={{ fontSize:10, color:C.textLt }}>{fmtAgo(cur.ts)}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:col, lineHeight:1.2 }}>
                    {overdue ? "Change now" : fmtExpiry(cur.ts + dev.wearDays*86400000)}
                  </span>
                </div>
              ) : (
                <div style={{ fontSize:11, color:C.textLt, fontWeight:600, marginLeft:"auto" }}>No entries yet</div>
              )}
            </Card>
          );
        })}
      </div>

      {/* New entry */}
      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:14 }}>➕ Log a Change</div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
          {["pod","sensor"].map(d=>(
            <button key={d} type="button" onClick={()=>pickDevice(d)}
              style={{ border:device===d?`2px solid ${C.textDk}`:"2px solid transparent",
                background:C.tile, borderRadius:12, padding:"10px 4px",
                cursor:"pointer", textAlign:"center", fontFamily:"inherit" }}>
              <div style={{ display:"flex", justifyContent:"center" }}><DevIcon device={d} size={22}/></div>
              <div style={{ fontSize:12, fontWeight:700, marginTop:2, color:device===d?C.textDk:C.textMd }}>
                {DEVICES[d].label}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.textLt, fontWeight:800, marginBottom:5 }}>DATE</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)}
              style={{ width:"100%", padding:"9px 10px", borderRadius:12, fontSize:13, fontFamily:"inherit",
                border:"none", color:C.textDk, outline:"none", background:C.tile }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.textLt, fontWeight:800, marginBottom:5 }}>TIME</div>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)}
              style={{ width:"100%", padding:"9px 10px", borderRadius:12, fontSize:13, fontFamily:"inherit",
                border:"none", color:C.textDk, outline:"none", background:C.tile }}/>
          </div>
        </div>

        <div style={{ fontSize:10, color:C.textLt, fontWeight:800, marginBottom:6 }}>LOCATION</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
          {SITE_OPTIONS[device].map(s=>{
            const used = lastUsed[s];
            const recent = used && (Date.now()-used) < 10*86400000;
            return (
              <button key={s} type="button" onClick={()=>setSite(s)}
                style={{ padding:"9px 6px", borderRadius:12, fontFamily:"inherit", textAlign:"left",
                  border: site===s ? `2px solid ${C.textDk}` : "2px solid transparent",
                  background: C.tile,
                  color: site===s ? C.textDk : C.textMd, fontWeight:700, fontSize:12, cursor:"pointer",
                  position:"relative", lineHeight:1.3 }}>
                {s}
                {recent && <span style={{ display:"block", fontSize:9, color:C.low, fontWeight:700, marginTop:2 }}>
                  used {fmtAgo(used)}
                </span>}
              </button>
            );
          })}
        </div>

        {lastUsed[site] && (Date.now()-lastUsed[site]) < 10*86400000 && (
          <div style={{ background:C.low+"11", border:`1.5px solid ${C.low}33`, borderRadius:10,
            padding:"7px 10px", fontSize:11, fontWeight:700, color:C.low, marginBottom:10, lineHeight:1.4 }}>
            💡 This spot was used {fmtAgo(lastUsed[site])} — rotating further helps avoid absorption problems.
          </div>
        )}

        <Btn onClick={submit} style={{ width:"100%", fontSize:15, padding:"13px 0" }}>
          {saved ? "✓ Logged!" : `Log ${DEVICES[device].label} change`}
        </Btn>
      </Card>

      {/* History */}
      <Card style={{ marginBottom:12 }}>
        <div style={{ fontWeight:800, color:C.textDk, fontSize:15, marginBottom:4 }}>📋 Change History</div>
        <div style={{ color:C.textLt, fontSize:11, marginBottom:14 }}>
          Most recent first · shared with everyone
        </div>
        {sites.length===0 ? (
          <div style={{ textAlign:"center", color:C.textLt, fontSize:13, padding:"20px 0" }}>
            Nothing logged yet
          </div>
        ) : sites.slice(0,40).map(s=>{
          const dev = DEVICES[s.device] || DEVICES.pod;
          const d = new Date(s.ts);
          return (
            <div key={s.id} style={{ display:"grid", gridTemplateColumns:"32px 1fr auto",
              alignItems:"center", gap:10, padding:"9px 2px", borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:"flex", justifyContent:"center" }}><DevIcon device={s.device} size={20}/></div>
              <div>
                <div style={{ fontWeight:700, color:C.textDk, fontSize:13 }}>
                  {dev.label} · <span style={{ color:C.textMd, fontWeight:600 }}>{s.site}</span>
                </div>
                <div style={{ fontSize:11, color:C.textLt, marginTop:1 }}>
                  {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})} at {d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})} · {fmtAgo(s.ts)}
                </div>
              </div>
              <button type="button" onClick={()=>onDelete(s.id)}
                style={{ background:"none", border:"none", cursor:"pointer", color:C.textLt,
                  fontSize:11, fontFamily:"inherit", padding:"2px 0" }}>remove</button>
            </div>
          );
        })}
      </Card>

      <div style={{ textAlign:"center", color:C.textLt, fontSize:11, paddingBottom:20, lineHeight:1.6 }}>
        Pods ~3 days · G7 sensors ~10 days<br/>
        Rotating sites helps prevent lipohypertrophy and absorption issues
      </div>
    </div>
  );
}

// ═══ Full-screen Sheet (opened from the + button) ════════════════════════════
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div style={{ position:"fixed", inset:0, zIndex:9000, background:C.white,
      overflowY:"auto", WebkitOverflowScrolling:"touch", animation:"slideUp .22s ease both" }}>
      <div style={{ maxWidth:480, margin:"0 auto", padding:"0 16px 48px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"18px 0 12px", position:"sticky", top:0, background:C.white, zIndex:2 }}>
          <div style={{ fontWeight:800, fontSize:20, color:C.textDk }}>{title}</div>
          <button type="button" onClick={onClose}
            style={{ background:C.tile, border:"none", borderRadius:"50%", width:36, height:36,
              fontSize:15, cursor:"pointer", color:C.textDk, fontFamily:"inherit",
              display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ═══ Main App ═════════════════════════════════════════════════════════════════
export default function App() {
  const [sheet,        setSheet       ] = useState(null); // null | "dose" | "log" | "sites"
  const [fabOpen,      setFabOpen     ] = useState(false);
  const [fabHidden,    setFabHidden   ] = useState(false);

  // Tuck the + button out of the way while the page is actively scrolling so it
  // doesn't sit on top of the content being read; bring it back on scroll end.
  useEffect(() => {
    let timer;
    const onScroll = () => {
      setFabHidden(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFabHidden(false), 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, []);
  const [mealId,       setMealId      ] = useState(timeLabel);
  const [carbs,        setCarbs       ] = useState(30);
  const [bg,           setBg          ] = useState(120);
  const [bgEntered,    setBgEntered   ] = useState(false);
  const [ratios,       setRatios      ] = useState({breakfast:10,lunch:16,dinner:13,snack:13});
  const [log,          setLog         ] = useState([]);
  const [sites,        setSites       ] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmed,    setConfirmed   ] = useState(false);
  const [rangeLow,     setRangeLow    ] = useState(()=>localStore.get("hud-range-low",  80));
  const [rangeHigh,    setRangeHigh   ] = useState(()=>localStore.get("hud-range-high", 180));
  const [mealWindows,  setMealWindows ] = useState(()=>localStore.get("hud-meal-windows", DEFAULT_MEAL_WINDOWS));
  const [dex,          setDex         ] = useState(null);
  const [dexLoading,   setDexLoading  ] = useState(true);
  const [dexError,     setDexError    ] = useState(null);
  const [history,      setHistory     ] = useState([]);
  const [storeAll,     setStoreAll    ] = useState([]);
  const [nowTick,      setNowTick     ] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);
  const liveAgeMin = dex?.timestamp ? Math.max(0, Math.round((nowTick - dex.timestamp)/60000)) : dex?.ageMinutes;

  // ── Browser tab: live BG in the favicon + title with the I>∧V mark ────────
  // (Desktop pinned-tab glanceability; iOS home-screen PWA ignores favicons.)
  useEffect(() => {
    if (!dex || typeof dex.value !== "number") return;
    const v = dex.value;
    const stale = liveAgeMin != null && liveAgeMin >= 15;
    const col = stale ? "#9CA3AF"
      : v < TARGET_LOW ? C.high : v > TARGET_HIGH ? C.low : C.inRange;

    document.title = `${v} ${trendArrow(dex.trend) || ""} · I>∧V`.trim();

    try {
      const c = document.createElement("canvas");
      c.width = 64; c.height = 64;
      const x = c.getContext("2d");
      x.fillStyle = col;
      // Rounded square backdrop
      const r = 14;
      x.beginPath();
      x.moveTo(r,0); x.lineTo(64-r,0); x.quadraticCurveTo(64,0,64,r);
      x.lineTo(64,64-r); x.quadraticCurveTo(64,64,64-r,64);
      x.lineTo(r,64); x.quadraticCurveTo(0,64,0,64-r);
      x.lineTo(0,r); x.quadraticCurveTo(0,0,r,0); x.fill();
      x.fillStyle = "#fff";
      x.font = `800 ${v >= 100 ? 30 : 36}px -apple-system, Arial, sans-serif`;
      x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(String(v), 32, 35);
      let link = document.querySelector("link#live-favicon");
      if (!link) {
        link = document.createElement("link");
        link.id = "live-favicon"; link.rel = "icon"; link.type = "image/png";
        document.head.appendChild(link);
      }
      link.href = c.toDataURL("image/png");
    } catch { /* favicon is decorative — never break the app for it */ }

    // iOS home-screen icon: artwork is fixed at install, but the badge number
    // is settable (iOS 16.4+ installed PWAs). Shows BG in the red corner badge.
    // Cleared when stale so an old number can't pose as current.
    try {
      if ("setAppBadge" in navigator) {
        if (stale) navigator.clearAppBadge?.();
        else navigator.setAppBadge(v);
      }
    } catch { /* unsupported — fine */ }
  }, [dex, liveAgeMin]);

  const [insulin,      setInsulin     ] = useState({ boluses:[], dailyTotals:[] });
  const pollRef      = useRef();
  const lastAlertRef = useRef(null);

  useEffect(() => {
    sharedLog.get().then(setLog);
    sharedSites.get().then(d => setSites(Array.isArray(d) ? d : []));
    // Deep link from notifications: /?open=sites opens the site-change sheet
    try {
      const open = new URLSearchParams(window.location.search).get("open");
      if (open === "sites" || open === "dose" || open === "log") setSheet(open);
      if (open) window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    fetch("/api/bg-store").then(r=>r.json())
      .then(d => { if (Array.isArray(d)) setStoreAll(d); }).catch(()=>{});
    fetch("/api/insulin-store").then(r=>r.json())
      .then(d => { if (d && Array.isArray(d.boluses)) setInsulin(d); }).catch(()=>{});
    setRatios(localStore.get("hud-ratios",{breakfast:10,lunch:16,dinner:13,snack:13}));
  }, []);

  // Dexcom polling + save to bg-store
  useEffect(() => {
    let fetchDex = async () => {
      try {
        const [latest, hist] = await Promise.all([
          fetch("/api/dexcom").then(r=>r.json()),
          fetch("/api/dexcom-history").then(r=>r.json()),
        ]);
        if (latest.error) { setDexError(latest.error); setDex(null); }
        else {
          if (typeof latest.timestamp === "number") lastReadingTs = latest.timestamp;
          setDex(latest); setDexError(null);
          // Fire SMS alerts
          const v=latest.value, tr=latest.trend;
          const isDblDn = tr===7||tr==="DoubleDown";
          const isSglDn = tr===6||tr==="SingleDown";
          const isAngDn = tr===5||tr==="FortyFiveDown";
          if      (v<80)                       sendAlert("under80",     `BG ${v} — Juice or Skittles immediately!`);
          else if (v<90 && isDblDn)            sendAlert("doubleDown",  `BG ${v} dropping fast ↓↓ — Drink juice NOW!`);
          else if (v<90 && (isSglDn||isAngDn)) sendAlert("singleDown",  `BG ${v} and dropping — Consider some Skittles`);
        }
        if (Array.isArray(hist) && hist.length>0) {
          setHistory(hist);
          // Persist to 4-week store
          fetch("/api/bg-store",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({readings:hist}) }).catch(()=>{});
        }
      } catch { setDexError("network"); }
      finally { setDexLoading(false); }
    };
    // ── Smart scheduling ─────────────────────────────────────────────────────
    // Dexcom emits a reading every 5 minutes. Instead of a blind interval
    // (average staleness ≈ 2.5 min), predict when the next reading is due from
    // the last reading's timestamp, poll just after it, and retry briefly
    // until it actually appears. This is how Sugarmate/xDrip stay current.
    const READ_CYCLE = 5*60*1000;
    const ARRIVAL_BUFFER = 20*1000;   // Share-server upload latency
    const RETRY_MS = 25*1000;
    let lastReadingTs = 0;
    let retries = 0;

    const schedule = (ms) => {
      clearTimeout(pollRef.current);
      pollRef.current = setTimeout(tick, Math.max(4000, ms));
    };

    const tick = async () => {
      const gotNew = await fetchDex();
      if (gotNew || lastReadingTs === 0) {
        retries = 0;
        const next = lastReadingTs > 0
          ? (lastReadingTs + READ_CYCLE + ARRIVAL_BUFFER) - Date.now()
          : DEXCOM_POLL_MS;
        schedule(next);
      } else if (retries < 8) {
        retries += 1;                 // expected a reading; not there yet
        schedule(RETRY_MS);
      } else {
        retries = 0;                  // sensor gap/warmup — back off
        schedule(60*1000);
      }
    };

    // fetchDex reports whether it saw a NEW reading
    const origFetch = fetchDex;
    fetchDex = async () => {
      const before = lastReadingTs;
      await origFetch();
      return lastReadingTs > before;
    };

    tick();
    // iOS resumes a PWA through several paths (visibilitychange, focus,
    // pageshow-from-bfcache) and not all of them fire every time. Listen to
    // all three; a 4s guard stops the same resume from triggering 3 fetches.
    let lastKick = 0;
    const kick = () => {
      const now = Date.now();
      if (now - lastKick < 4000) return;
      lastKick = now;
      retries = 0;
      tick();
    };
    const onVis = ()=>{ if(document.visibilityState==="visible") kick(); };
    window.addEventListener("focus", kick);
    window.addEventListener("pageshow", kick);
    document.addEventListener("visibilitychange", onVis);
    return ()=>{
      clearTimeout(pollRef.current);
      window.removeEventListener("focus", kick);
      window.removeEventListener("pageshow", kick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const syncSettings = (patch) => {
    fetch("/api/settings-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(patch) }).catch(()=>{});
  };
  const saveRatios = r => { setRatios(r); localStore.set("hud-ratios",r); syncSettings({ratios:r}); };
  const saveMealWindows  = w => { setMealWindows(w); localStore.set("hud-meal-windows",w); syncSettings({mealWindows:w}); };

  const sendAlert = async (key, message) => {
    const now = Date.now(), last = lastAlertRef.current;
    if (last && last.key===key && now-last.ts < 10*60*1000) return;
    lastAlertRef.current = { key, ts:now };
    // Push notification to all registered family devices (server dedupes too)
    try { await fetch("/api/alert-push",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ key, message }) }); } catch {}
  };

  const dose   = calcDose({ carbs, bg:bgEntered?bg:0, mealId, ratios });
  const meal   = MEALS.find(m=>m.id===mealId);
  const bgSt   = bgEntered&&bg>0 ? getBGStatus(bg) : null;
  const today  = new Date().toLocaleDateString();
  const todayE = log.filter(e=>e.date===today);

  const handleLog = () => {
    const now=new Date();
    const entry={ id:Date.now(), mealId, carbs, bg:bgEntered&&bg>0?bg:null,
      dose:dose.total, time:now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}), date:now.toLocaleDateString() };
    const next=[entry,...log].slice(0,100);
    setLog(next); sharedLog.save(next);
    setConfirmed(true); setTimeout(()=>setConfirmed(false),2500);
  };

  const removeEntry = id => {
    const next=log.filter(e=>e.id!==id); setLog(next); sharedLog.save(next);
  };

  const addSite = entry => {
    const next=[entry,...sites].sort((a,b)=>b.ts-a.ts).slice(0,500);
    setSites(next); sharedSites.save(next);
  };
  const removeSite = id => {
    const next=sites.filter(s=>s.id!==id); setSites(next); sharedSites.save(next);
  };

  return (
    <>
      <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;}
        body{background:#FFFFFF;font-family:'Nunito Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pop{0%{transform:scale(.88);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.75;transform:scale(1.04)}}
        .pop{animation:pop .25s ease both;}
        .slideUp{animation:slideUp .3s ease both;}
      `}</style>

      <div style={{ fontFamily:FONT, minHeight:"100vh", background:C.offWhite,
        maxWidth:480, margin:"0 auto", paddingBottom:110 }}>

        {/* ── Header ── */}
        <div style={{ background:C.white,
          padding:"14px 20px 6px", position:"relative" }}>


          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>

              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                
                {dex?.value ? (() => {
                  const bgColor = dex.value<TARGET_LOW?C.high:dex.value>TARGET_HIGH?C.low:C.textDk;
                  const tr=dex.trend;
                  const isDblDn=tr===7||tr==="DoubleDown";
                  const isSglDn=tr===6||tr==="SingleDown";
                  const isAngDn=tr===5||tr==="FortyFiveDown";
                  const isFlat =tr===4||tr==="Flat";
                  const low90s =dex.value<90;
                  const allWell=isFlat&&dex.value>=80&&dex.value<=125;
                  let alert=null;
                  if      (dex.value<80)              alert={key:"under80",    msg:"Juice or Skittles! 🧃🍬",        color:C.high,pulse:true};
                  else if (low90s&&isDblDn)            alert={key:"dblDown",    msg:"Drink juice NOW! 🧃",             color:C.high,pulse:true};
                  else if (low90s&&(isSglDn||isAngDn)) alert={key:"dropping",   msg:"Consider Skittles 🍬",            color:C.low,pulse:false};
                  else if (allWell)                    alert={key:"allWell",    msg:"All is well ✅",                  color:C.inRange,pulse:false};
                  return (
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                        <span style={{ color:bgColor,fontWeight:900,fontSize:46,letterSpacing:-1.5,lineHeight:1 }}>{dex.value}</span>
                        <span style={{ color:bgColor,fontWeight:800,fontSize:28,lineHeight:1 }}>{trendArrow(dex.trend)}</span>
                        {(() => {
                          const sorted=[...history].sort((a,b)=>a.ts-b.ts);
                          let delta=null;
                          if (sorted.length>=2) {
                            const lastTwo=sorted.slice(-2);
                            delta=lastTwo[1].value-lastTwo[0].value;
                          }
                          return (
                            <span style={{ display:"flex",flexDirection:"column",lineHeight:1.1 }}>
                              <span style={{ color:C.textDk,fontSize:14,fontWeight:700,minHeight:15 }}>
                                {delta===null?"":delta>0?`+${delta}`:`${delta}`}
                              </span>
                              <span style={{ color:C.textMd,fontSize:12,fontWeight:500 }}>mg/dL</span>
                            </span>
                          );
                        })()}
                      </div>
                      {alert&&(
                        <div style={{ fontSize:12,fontWeight:600,color:alert.color,background:alert.color+"14",
                          border:`1px solid ${alert.color}33`,borderRadius:8,padding:"4px 10px",
                          animation:alert.pulse?"pulse 1s ease-in-out infinite":"none",maxWidth:160,lineHeight:1.3 }}>
                          {alert.msg}
                        </div>
                      )}
                    </div>
                  );
                })() : dexLoading ? (
                  <div style={{ color:C.textLt,fontSize:13,fontWeight:500 }}>Connecting…</div>
                ) : null}
              </div>
              {(
                <div style={{ color:C.textMd, fontSize:14, marginTop:4,
                  display:"flex", alignItems:"center", gap:7 }}>
                  <span>{liveAgeMin>0 ? `${liveAgeMin} min ago | ` : "just now | "}Hudson's data</span>
                  <svg viewBox="0 0 100 34" width="46" height="16"
                    title="I am greater than my highs and lows"
                    aria-label="I am greater than my highs and lows"
                    style={{ display:"block", flexShrink:0 }}>
                    <g fill="none" stroke={C.ravens} strokeWidth="4.2"
                       strokeLinecap="butt" strokeLinejoin="miter" strokeMiterlimit="4">
                      <line x1="6" y1="5" x2="6" y2="29"/>
                      <polyline points="17,6.8 29,17 17,27.2"/>
                      <polyline points="40,27 51.5,7 63,27"/>
                      <polyline points="66,7 77.5,27 89,7"/>
                    </g>
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* 3-hr chart — hide on trends tab */}
          {history.length>1&&(
            <div style={{ marginTop:10, marginBottom:2 }}>
              <div style={{ fontSize:12,fontWeight:600,color:C.textDk,marginBottom:6 }}>
                Today
              </div>
              <BGChart live={history} store={storeAll} boluses={insulin.boluses}/>
            </div>
          )}

        </div>

        <div style={{ padding:"0 16px" }}>

          {/* ══ DOSE ══ */}
          {sheet==="dose"&&(<Sheet title="💉 Dose Calculator" onClose={()=>setSheet(null)}>
            <div className="slideUp">
              <div style={{ padding:"0 0 14px" }}><QuoteBanner /></div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14 }}>
                {MEALS.map(m=>(
                  <button key={m.id} type="button" onClick={()=>setMealId(m.id)}
                    style={{ border:mealId===m.id?`2px solid ${C.textDk}`:"2px solid transparent",
                      background:C.tile,
                      borderRadius:14,padding:"10px 4px",cursor:"pointer",textAlign:"center",transition:"all .18s",fontFamily:"inherit" }}>
                    <div style={{ fontSize:22 }}>{m.icon}</div>
                    <div style={{ fontSize:11,fontWeight:700,marginTop:2,color:mealId===m.id?C.textDk:C.textMd }}>{m.label}</div>
                  </button>
                ))}
              </div>

              <Card style={{ marginBottom:12 }}>
                <div style={{ fontWeight:800,color:C.textDk,fontSize:15,marginBottom:14 }}>🍽️ Carbohydrates</div>
                <NumPad value={carbs} onChange={setCarbs} step={5} min={0} max={300} unit="g"/>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:6,marginTop:14 }}>
                  {[15,30,45,60,75,90].map(v=>(
                    <button key={v} type="button" onClick={()=>setCarbs(v)}
                      style={{ padding:"6px 0",borderRadius:20,fontFamily:"inherit",textAlign:"center",
                        border:"none",
                        background:carbs===v?C.textDk:C.tile,
                        color:carbs===v?"#fff":C.textMd,fontWeight:700,fontSize:13,cursor:"pointer" }}>{v}g</button>
                  ))}
                </div>
              </Card>

              <Card style={{ marginBottom:14 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
                  <div style={{ fontWeight:800,color:C.textDk,fontSize:15 }}>🩸 Blood Sugar</div>
                  <label style={{ display:"flex",alignItems:"center",gap:8,cursor:"pointer" }}>
                    <span style={{ fontSize:12,color:C.textMd,fontWeight:600 }}>Correction</span>
                    <div onClick={()=>setBgEntered(p=>!p)}
                      style={{ width:42,height:24,borderRadius:12,cursor:"pointer",
                        background:bgEntered?C.blue:C.border,transition:"background .2s",position:"relative",flexShrink:0 }}>
                      <div style={{ position:"absolute",top:3,left:bgEntered?21:3,width:18,height:18,
                        borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px rgba(0,0,0,.25)" }}/>
                    </div>
                  </label>
                </div>
                {bgEntered ? (
                  <>
                    <NumPad value={bg} onChange={setBg} step={5} min={0} max={600}/>
                    <div style={{ textAlign:"center",marginTop:8 }}>
                      {bgSt&&<Badge color={bgSt.color}>{bgSt.label} · {bg} mg/dL</Badge>}
                    </div>
                    {dex?.value&&(
                      <div style={{ textAlign:"center",marginTop:10 }}>
                        <button type="button" onClick={()=>setBg(dex.value)}
                          style={{ background:C.white,border:"none",borderRadius:20,
                            padding:"5px 12px",fontSize:12,fontWeight:500,color:C.textDk,cursor:"pointer",fontFamily:"inherit" }}>
                          📡 Pull from Dexcom ({dex.value} {trendArrow(dex.trend)})
                        </button>
                      </div>
                    )}
                    <div style={{ display:"flex",gap:6,justifyContent:"center",marginTop:12,flexWrap:"wrap" }}>
                      {[80,100,120,150,180,220,280].map(v=>(
                        <button key={v} type="button" onClick={()=>setBg(v)}
                          style={{ padding:"5px 10px",borderRadius:20,fontFamily:"inherit",
                            border:"none",
                            background:bg===v?C.textDk:C.tile,
                            color:bg===v?"#fff":C.textMd,fontWeight:700,fontSize:12,cursor:"pointer" }}>{v}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign:"center",color:C.textLt,fontSize:13 }}>Toggle on to include a correction dose</div>
                )}
              </Card>

              <Card style={{ marginBottom:14 }}>
                <div style={{ color:C.textLt,fontSize:12,fontWeight:500,marginBottom:6 }}>Recommended dose</div>
                <div style={{ display:"flex",alignItems:"baseline",gap:6,marginBottom:16 }}>
                  <div className="pop" key={dose.total}
                    style={{ fontSize:56,fontWeight:700,color:C.textDk,lineHeight:1,letterSpacing:-2 }}>{dose.total}</div>
                  <div style={{ fontSize:18,color:C.textLt,fontWeight:500 }}>units</div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  {[
                    { label:"Meal dose",          val:dose.carbDose+"u" },
                    { label:"Correction",          val:dose.correction+"u" },
                    { label:`1:${ratios[mealId]}g`, val:carbs+"g" },
                  ].map(b=>(
                    <div key={b.label} style={{ background:C.white,
                      borderRadius:10,padding:"8px 10px",flex:1,textAlign:"center" }}>
                      <div style={{ color:C.textLt,fontSize:10,fontWeight:500 }}>{b.label}</div>
                      <div style={{ color:C.textDk,fontSize:16,fontWeight:600 }}>{b.val}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Btn onClick={handleLog} disabled={carbs===0} style={{ width:"100%",fontSize:16,padding:"15px 0" }}>
                {confirmed?"✓ Logged!":`Log ${dose.total}u for ${meal?.label}`}
              </Btn>
              <div style={{ textAlign:"center",color:C.textLt,fontSize:11,margin:"10px 0 20px" }}>
                🏈 Like #89 — manage it, don't let it manage you · Rounds to nearest 0.5u
              </div>
            </div>
          </Sheet>)}

          {/* ══ LOG ══ */}
          {sheet==="log"&&(<Sheet title="📋 Dose Log" onClose={()=>setSheet(null)}>
            <div className="slideUp">
              {log.length===0 ? (
                <div style={{ textAlign:"center",padding:"60px 0",color:C.textLt }}>
                  <div style={{ fontSize:48,marginBottom:12 }}>💉</div>
                  <div style={{ fontWeight:700,fontSize:16 }}>No doses logged yet</div>
                </div>
              ) : (
                <>
                  {[...new Set(log.map(e=>e.date))].map(date=>(
                    <div key={date} style={{ marginBottom:16 }}>
                      <div style={{ fontWeight:800,color:C.textMd,fontSize:12,
                        letterSpacing:1,textTransform:"uppercase",marginBottom:8,paddingLeft:4 }}>
                        {date===today?"Today":date}
                      </div>
                      <Card>
                        {log.filter(e=>e.date===date).map(entry=>(
                          <LogRow key={entry.id} entry={entry} onDelete={removeEntry}/>
                        ))}
                      </Card>
                    </div>
                  ))}
                  <div style={{ textAlign:"center",marginTop:8,paddingBottom:20 }}>
                    <Btn variant="danger" onClick={()=>{ setLog([]); sharedLog.save([]); }} style={{ fontSize:12,padding:"8px 20px" }}>
                      Clear All History
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </Sheet>)}

          {/* ══ SITES ══ */}
          {sheet==="sites"&&(<Sheet title="📍 Device Management" onClose={()=>setSheet(null)}>
            <SitesTab sites={sites} onAdd={addSite} onDelete={removeSite}/>
          </Sheet>)}

          {/* ══ HOME = TRENDS ══ */}
          <AnalyticsTab bgHistory={history} ratios={ratios} rangeLow={rangeLow} rangeHigh={rangeHigh} mealWindows={mealWindows} sites={sites} insulin={insulin}/>
        </div>


      </div>

      {/* ── + button (Sugarmate-style) ── */}
      {!sheet && (
        <>
          {fabOpen && (
            <div onClick={()=>setFabOpen(false)}
              style={{ position:"fixed", inset:0, zIndex:8000, background:"rgba(0,0,0,0.28)" }}/>
          )}
          <div style={{ position:"fixed", left:0, right:0, bottom:26, zIndex:8500,
            display:"flex", flexDirection:"column", alignItems:"center", gap:10, pointerEvents:"none",
            transform: fabHidden && !fabOpen ? "translateY(110px)" : "none",
            opacity: fabHidden && !fabOpen ? 0 : 1,
            transition:"transform .25s ease, opacity .25s ease" }}>
            {fabOpen && [
              ["sites",null,"Devices"],
              ["settings","⚙️","Settings"],
              ["log",  "📋","Dose history"],
              ["dose", "💉","Calculate a dose"],
            ].map(([id,icon,label])=>(
              <button key={id} type="button"
                onClick={()=>{ if(id==="settings"){ setShowSettings(true); } else { setSheet(id); } setFabOpen(false); }}
                style={{ pointerEvents:"auto", display:"flex", alignItems:"center", gap:10,
                  background:C.white, border:"none", borderRadius:26, padding:"12px 20px",
                  fontWeight:700, fontSize:15, color:C.textDk, fontFamily:"inherit",
                  whiteSpace:"nowrap",
                  boxShadow:"0 4px 18px rgba(0,0,0,0.18)", cursor:"pointer",
                  animation:"slideUp .18s ease both" }}>
                {icon === null ? (
                  <span style={{ display:"flex", alignItems:"center", gap:3 }}>
                    <PodIcon size={17}/><SensorIcon size={17}/>
                  </span>
                ) : (
                  <span style={{ fontSize:18 }}>{icon}</span>
                )}{label}
              </button>
            ))}
            <button type="button" onClick={()=>setFabOpen(o=>!o)}
              style={{ pointerEvents:"auto", width:58, height:58, borderRadius:"50%",
                background:C.ravens, color:"#fff", fontSize:28, fontWeight:400, border:"none",
                cursor:"pointer", boxShadow:"0 6px 22px rgba(36,23,115,0.45)", fontFamily:"inherit",
                display:"flex", alignItems:"center", justifyContent:"center",
                transform:fabOpen?"rotate(45deg)":"none", transition:"transform .18s" }}>+</button>
          </div>
        </>
      )}

      {showSettings&&(
        <SettingsModal ratios={ratios} setRatios={saveRatios}
          rangeLow={rangeLow}   setRangeLow={v=>{setRangeLow(v);   localStore.set("hud-range-low",v);}}
          rangeHigh={rangeHigh} setRangeHigh={v=>{setRangeHigh(v); localStore.set("hud-range-high",v);}}
          mealWindows={mealWindows} setMealWindows={saveMealWindows}
          onClose={()=>setShowSettings(false)}/>
      )}
    </>
  );
}
