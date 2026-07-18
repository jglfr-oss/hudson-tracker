import { useState, useEffect, useRef } from "react";

// ═══ Ravens Palette ══════════════════════════════════════════════════════════
const C = {
  navy:    "#FFFFFF",
  navyDk:  "#FFFFFF",
  blue:    "#0A84FF",
  teal:    "#8E8E93",
  white:   "#FFFFFF",
  offWhite:"#F7F7F8",
  border:  "#E5E5EA",
  textDk:  "#000000",
  textMd:  "#6E6E73",
  textLt:  "#A1A1A6",
  low:     "#FF9500",
  high:    "#FF3B30",
  inRange: "#34C759",
  band:    "#F0F0F2",
};

// ═══ Config ═══════════════════════════════════════════════════════════════════
const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

const MEALS = [
  { id:"breakfast", label:"Breakfast", icon:"☀️",  defaultRatio:10 },
  { id:"lunch",     label:"Lunch",     icon:"🌤️", defaultRatio:13 },
  { id:"dinner",    label:"Dinner",    icon:"🌙",  defaultRatio:13 },
  { id:"snack",     label:"Snack",     icon:"🍎",  defaultRatio:15 },
];

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
  const ratio      = ratios[mealId] ?? 12;
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

// ═══ Atoms ═══════════════════════════════════════════════════════════════════
function Card({ children, style={} }) {
  return <div style={{ background:C.white, borderRadius:12, border:`1px solid ${C.border}`,
    padding:18, ...style }}>{children}</div>;
}

function Badge({ color, children }) {
  return <span style={{ background:color+"22", color, fontWeight:700, fontSize:12,
    borderRadius:20, padding:"3px 10px" }}>{children}</span>;
}

function Btn({ onClick, children, variant="primary", style={}, disabled=false }) {
  const v = {
    primary:   { background:C.textDk, color:"#fff", border:"none" },
    secondary: { background:C.white, color:C.textDk, border:`1px solid ${C.border}` },
    danger:    { background:C.white,  color:C.high, border:`1px solid ${C.high}55` },
  }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius:10, fontWeight:600,
    cursor:disabled?"not-allowed":"pointer", fontSize:15, padding:"12px 28px",
    fontFamily:"inherit", opacity:disabled?0.5:1, ...v, ...style }}>{children}</button>;
}

function NumPad({ value, onChange, step=1, min=0, max=500, unit="" }) {
  const bs = { width:40, height:40, borderRadius:"50%", border:`1px solid ${C.border}`,
    background:C.white, fontSize:20, cursor:"pointer", color:C.textDk,
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

// ═══ BG Sparkline with touch tooltips ════════════════════════════════════════
function BGTrendChart({ history }) {
  const [tooltip, setTooltip] = useState(null);
  if (!history || history.length < 2) return null;

  const W=440, H=140, PAD={ top:20, right:36, bottom:24, left:10 };
  const cW=W-PAD.left-PAD.right, cH=H-PAD.top-PAD.bottom;
  const sorted=[...history].sort((a,b)=>a.ts-b.ts);
  const minTs=sorted[0].ts, tsR=(sorted[sorted.length-1].ts-minTs)||1;
  const xS = ts  => PAD.left+((ts-minTs)/tsR)*cW;
  const yS = val => PAD.top+cH-((Math.min(Math.max(val,40),320)-40)/280)*cH;
  const dc  = v  => v<TARGET_LOW?C.high:v>TARGET_HIGH?C.low:C.textDk;
  const yH=yS(TARGET_HIGH), yL=yS(TARGET_LOW);
  const pts=sorted.map(r=>({ x:xS(r.ts), y:yS(r.value), v:r.value,
    time:new Date(r.ts).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}) }));
  const path=pts.map((p,i)=>`${i===0?"M":"L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const latest=pts[pts.length-1];
  const tLbls=[0,Math.floor(sorted.length/2),sorted.length-1].map(i=>({
    x:xS(sorted[i].ts), label:new Date(sorted[i].ts).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})
  }));

  const handleTouch = e => {
    e.preventDefault();
    const svg=e.currentTarget, rect=svg.getBoundingClientRect();
    const cx=(e.touches?e.touches[0].clientX:e.clientX);
    const svgX=((cx-rect.left)/rect.width)*W;
    let closest=null, minD=Infinity;
    pts.forEach(p=>{ const d=Math.abs(p.x-svgX); if(d<minD){minD=d;closest=p;} });
    if(closest&&minD<30) setTooltip(closest); else setTooltip(null);
  };

  const tx=tooltip?Math.min(Math.max(tooltip.x,30),W-50):0;
  const ty=tooltip?Math.max(tooltip.y-28,PAD.top):0;

  return (
    <div style={{ background:C.white, border:`1px solid ${C.border}`,
      borderRadius:12, padding:"10px 12px 6px" }} onClick={()=>setTooltip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{ width:"100%", height:"auto", display:"block", overflow:"visible", touchAction:"none" }}
        onTouchStart={handleTouch} onTouchMove={handleTouch} onClick={handleTouch}>
        <rect x={PAD.left} y={yH} width={cW} height={yL-yH} fill={C.band} rx="2"/>
        <line x1={PAD.left} y1={yH} x2={PAD.left+cW} y2={yH} stroke={C.border} strokeWidth="1"/>
        <line x1={PAD.left} y1={yL} x2={PAD.left+cW} y2={yL} stroke={C.high} strokeWidth="1"/>
        <text x={W-PAD.right+4} y={yH+4} fontSize="9" fill={C.textLt} fontWeight="500">{TARGET_HIGH}</text>
        <text x={W-PAD.right+4} y={yL+4} fontSize="9" fill={C.textLt} fontWeight="500">{TARGET_LOW}</text>
        {pts.length>1&&<path d={path} fill="none" stroke="none" strokeWidth="0" strokeLinecap="round" strokeLinejoin="round"/>}
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="12" fill="transparent"/>
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
              r={tooltip?.x===p.x?5:2.4}
              fill={dc(p.v)}
              stroke={tooltip?.x===p.x?C.textDk:"none"}
              strokeWidth={tooltip?.x===p.x?2:0} opacity="1"/>
          </g>
        ))}
        {latest&&!tooltip&&(
          <text x={Math.min(latest.x,W-PAD.right-10)} y={latest.y-9}
            fontSize="11" fontWeight="900" fill={dc(latest.v)} textAnchor="middle">{latest.v}</text>
        )}
        {tooltip&&(
          <g>
            <rect x={tx-28} y={ty-16} width="56" height="22" rx="8" fill={dc(tooltip.v)} opacity="0.95"/>
            <text x={tx} y={ty-1} fontSize="12" fontWeight="900" fill="#fff" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">{tooltip.v}</text>
            <text x={tx} y={ty+18} fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.75)" textAnchor="middle" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">{tooltip.time}</text>
            <line x1={tx} y1={ty+6} x2={tooltip.x.toFixed(1)} y2={tooltip.y-7} stroke={dc(tooltip.v)} strokeWidth="1.5" opacity="0.6"/>
          </g>
        )}
        {tLbls.map((t,i)=>(
          <text key={i} x={t.x.toFixed(1)} y={H-3} fontSize="9" fill={C.textLt}
            textAnchor={i===0?"start":i===tLbls.length-1?"end":"middle"} fontWeight="600" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">
            {t.label}
          </text>
        ))}
      </svg>
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
              border: filter===f.key ? `1px solid ${C.textDk}` : `1px solid ${C.border}`,
              background: filter===f.key ? C.textDk : C.white,
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
        <text x={PAD.left+2} y={PAD.top-5} fontSize="9" fill={C.high} fontWeight="800" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">▲ highs</text>
        <text x={PAD.left+2} y={H-PAD.bottom+13} fontSize="9" fill={C.low} fontWeight="800" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif">▼ lows</text>
        {labelIdx.map((i,k)=>(
          <text key={k} x={xOf(i)} y={H-4} fontSize="9" fill={C.textLt} fontWeight="600" fontFamily="-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif"
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

// ═══ Analytics Tab ═══════════════════════════════════════════════════════════
const PRESET_PERIODS = [
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

function AnalyticsTab({ bgHistory, ratios, rangeLow, rangeHigh, mealWindows }) {
  const [loading,    setLoading ] = useState(true);
  const [readings,   setReadings] = useState([]);
  const [period,     setPeriod  ] = useState(30);
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
  const fromTs = useCustom ? fromDateInputVal(customFrom) : Date.now() - period*24*60*60*1000;
  const toTs   = useCustom ? fromDateInputVal(customTo) + 86400000 : Date.now();

  const all = (() => {
    const map = {};
    [...readings, ...(bgHistory||[])].forEach(r => { map[r.ts]=r; });
    return Object.values(map).filter(r => r.ts >= fromTs && r.ts <= toTs).sort((a,b)=>a.ts-b.ts);
  })();

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

  if (loading) return (
    <div style={{ textAlign:"center", padding:"60px 0", color:C.textLt }}>
      <div style={{ fontSize:36, marginBottom:12 }}>📊</div>
      <div style={{ fontWeight:700 }}>Loading history…</div>
      <div style={{ fontSize:12, marginTop:6, color:C.textLt }}>Data accumulates every 5 min while app is open</div>
    </div>
  );

  if (!stats || all.length < 10) return (
    <div style={{ textAlign:"center", padding:"60px 20px", color:C.textLt }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📡</div>
      <div style={{ fontWeight:700, fontSize:16, color:C.textDk }}>Not enough data yet</div>
      <div style={{ fontSize:13, marginTop:8, lineHeight:1.5 }}>
        Keep the app open — it collects a reading every 5 minutes.<br/>Check back after a few days.
      </div>
      <div style={{ marginTop:16, background:C.offWhite, borderRadius:14, padding:"12px 16px", fontSize:13, color:C.textMd, fontWeight:700 }}>
        {all.length} readings stored so far
      </div>
    </div>
  );

  const oldest = new Date(all[0].ts).toLocaleDateString("en-US",{month:"short",day:"numeric"});
  const newest = new Date(all[all.length-1].ts).toLocaleDateString("en-US",{month:"short",day:"numeric"});

  return (
    <div className="slideUp">

      {/* Period picker */}
      <div style={{ marginBottom:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6, marginBottom:8 }}>
          {PRESET_PERIODS.map(p=>(
            <button key={p.days} type="button" onClick={()=>{
              setPeriod(p.days);
              setUseCustom(false);
              setCustomFrom(toDateInputVal(Date.now() - p.days*24*60*60*1000));
              setCustomTo(toDateInputVal(Date.now()));
            }}
              style={{ padding:"8px 0", borderRadius:20, fontFamily:"inherit", textAlign:"center", fontWeight:800, fontSize:12,
                border: (!useCustom && period===p.days) ? `1px solid ${C.textDk}` : `1px solid ${C.border}`,
                background: (!useCustom && period===p.days) ? C.textDk : C.white,
                color: (!useCustom && period===p.days) ? "#fff" : C.textMd, cursor:"pointer" }}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Custom date range */}
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <input type="date" value={customFrom}
            onChange={e=>{ setCustomFrom(e.target.value); setUseCustom(true); }}
            style={{ flex:1, padding:"8px 10px", borderRadius:12, fontSize:12, fontFamily:"inherit",
              border: useCustom ? `2px solid ${C.blue}` : `1.5px solid ${C.border}`,
              color:C.textDk, outline:"none", background: useCustom ? `${C.blue}08` : C.white }}/>
          <span style={{ color:C.textLt, fontSize:12, fontWeight:600 }}>to</span>
          <input type="date" value={customTo}
            onChange={e=>{ setCustomTo(e.target.value); setUseCustom(true); }}
            style={{ flex:1, padding:"8px 10px", borderRadius:12, fontSize:12, fontFamily:"inherit",
              border: useCustom ? `2px solid ${C.blue}` : `1.5px solid ${C.border}`,
              color:C.textDk, outline:"none", background: useCustom ? `${C.blue}08` : C.white }}/>
        </div>
        <div style={{ fontSize:11, color:C.textLt, marginTop:6, textAlign:"center" }}>
          {all.length === 0
            ? "No readings in this range"
            : `${all.length.toLocaleString()} readings · ${new Date(fromTs).toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${new Date(Math.min(toTs,Date.now())).toLocaleDateString("en-US",{month:"short",day:"numeric"})}`}
        </div>
      </div>

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
              <div style={{ position:"relative", height:8, background:C.offWhite, borderRadius:4, marginBottom:8 }}>
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
                  <div style={{ background:C.offWhite, borderRadius:10, padding:"6px 12px",
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

      <div style={{ textAlign:"center", color:C.textLt, fontSize:11, paddingBottom:20, lineHeight:1.6 }}>
        {readings.length.toLocaleString()} readings stored · accumulates every 5 min<br/>
        Always confirm ratio changes with Hudson's endocrinologist
      </div>
    </div>
  );
}

// ═══ Quote Banner ══════════════════════════════════════════════════════════════
function QuoteBanner() {
  const q = getDailyQuote();
  return (
    <div style={{ background:C.white, border:`1px solid ${C.border}`,
      borderRadius:12, padding:"16px 18px", marginBottom:14, position:"relative", overflow:"hidden" }}>
      <div style={{ fontSize:11, fontWeight:600, color:C.textLt, marginBottom:6 }}>
        Daily note
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

  const box = { background:C.offWhite, border:`1.5px solid ${C.border}`, borderRadius:12,
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

        <div style={{ background:C.offWhite, borderRadius:12, padding:"10px 14px", color:C.textMd, fontSize:12, marginBottom:24 }}>
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
      <div style={{ display:"flex", gap:10, marginBottom:14, marginTop:14 }}>
        {["pod","sensor"].map(d => {
          const dev = DEVICES[d];
          const cur = latest[d];
          const age = cur ? daysAgo(cur.ts) : null;
          const left = cur ? dev.wearDays - age : null;
          const overdue = left !== null && left <= 0;
          const soon    = left !== null && left > 0 && left <= 0.75;
          const col = overdue ? C.high : soon ? C.low : C.inRange;
          return (
            <Card key={d} style={{ flex:1, padding:14, textAlign:"center" }}>
              <div style={{ fontSize:22 }}>{dev.icon}</div>
              <div style={{ fontWeight:800, color:C.textDk, fontSize:13, marginTop:2 }}>{dev.label}</div>
              {cur ? (
                <>
                  <div style={{ fontSize:20, fontWeight:900, color:col, marginTop:6, lineHeight:1 }}>
                    {overdue ? "Due" : `${Math.max(0,left).toFixed(1)}d`}
                  </div>
                  <div style={{ fontSize:10, color:C.textLt, fontWeight:700, marginTop:3 }}>
                    {overdue ? "change now" : "remaining"}
                  </div>
                  <div style={{ fontSize:10, color:C.textMd, marginTop:6, fontWeight:600 }}>{cur.site}</div>
                  <div style={{ fontSize:10, color:C.textLt }}>{fmtAgo(cur.ts)}</div>
                </>
              ) : (
                <div style={{ fontSize:11, color:C.textLt, marginTop:10, fontWeight:600 }}>No entries yet</div>
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
              style={{ border:device===d?`1px solid ${C.textDk}`:`1px solid ${C.border}`,
                background:device===d?C.offWhite:C.white, borderRadius:10, padding:"10px 4px",
                cursor:"pointer", textAlign:"center", fontFamily:"inherit" }}>
              <div style={{ fontSize:20 }}>{DEVICES[d].icon}</div>
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
                border:`1.5px solid ${C.border}`, color:C.textDk, outline:"none", background:C.white }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:C.textLt, fontWeight:800, marginBottom:5 }}>TIME</div>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)}
              style={{ width:"100%", padding:"9px 10px", borderRadius:12, fontSize:13, fontFamily:"inherit",
                border:`1.5px solid ${C.border}`, color:C.textDk, outline:"none", background:C.white }}/>
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
                  border: site===s ? `1px solid ${C.textDk}` : `1px solid ${C.border}`,
                  background: site===s ? C.offWhite : C.white,
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
              <div style={{ fontSize:19, textAlign:"center" }}>{dev.icon}</div>
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

// ═══ Main App ═════════════════════════════════════════════════════════════════
export default function App() {
  const [tab,          setTab         ] = useState("dose");
  const [mealId,       setMealId      ] = useState(timeLabel);
  const [carbs,        setCarbs       ] = useState(30);
  const [bg,           setBg          ] = useState(120);
  const [bgEntered,    setBgEntered   ] = useState(false);
  const [ratios,       setRatios      ] = useState({breakfast:10,lunch:12,dinner:12,snack:15});
  const [log,          setLog         ] = useState([]);
  const [sites,        setSites       ] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmed,    setConfirmed   ] = useState(false);
  const [alertNumbers, setAlertNumbers] = useState(()=>localStore.get("hud-alert-numbers",["2674812133"]));
  const [rangeLow,     setRangeLow    ] = useState(()=>localStore.get("hud-range-low",  80));
  const [rangeHigh,    setRangeHigh   ] = useState(()=>localStore.get("hud-range-high", 180));
  const [mealWindows,  setMealWindows ] = useState(()=>localStore.get("hud-meal-windows", DEFAULT_MEAL_WINDOWS));
  const [dex,          setDex         ] = useState(null);
  const [dexLoading,   setDexLoading  ] = useState(true);
  const [dexError,     setDexError    ] = useState(null);
  const [history,      setHistory     ] = useState([]);
  const pollRef      = useRef();
  const lastAlertRef = useRef(null);

  useEffect(() => {
    sharedLog.get().then(setLog);
    sharedSites.get().then(d => setSites(Array.isArray(d) ? d : []));
    setRatios(localStore.get("hud-ratios",{breakfast:10,lunch:12,dinner:12,snack:15}));
  }, []);

  // Dexcom polling + save to bg-store
  useEffect(() => {
    const fetchDex = async () => {
      try {
        const [latest, hist] = await Promise.all([
          fetch("/api/dexcom").then(r=>r.json()),
          fetch("/api/dexcom-history").then(r=>r.json()),
        ]);
        if (latest.error) { setDexError(latest.error); setDex(null); }
        else {
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
    fetchDex();
    pollRef.current = setInterval(fetchDex, DEXCOM_POLL_MS);
    const onVis = ()=>{ if(document.visibilityState==="visible") fetchDex(); };
    document.addEventListener("visibilitychange", onVis);
    return ()=>{ clearInterval(pollRef.current); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const syncSettings = (patch) => {
    fetch("/api/settings-sync", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(patch) }).catch(()=>{});
  };
  const saveRatios = r => { setRatios(r); localStore.set("hud-ratios",r); syncSettings({ratios:r}); };
  const saveAlertNumbers = n => { setAlertNumbers(n); localStore.set("hud-alert-numbers",n); };
  const saveMealWindows  = w => { setMealWindows(w); localStore.set("hud-meal-windows",w); syncSettings({mealWindows:w}); };

  const sendAlert = async (key, message) => {
    const now = Date.now(), last = lastAlertRef.current;
    if (last && last.key===key && now-last.ts < 10*60*1000) return;
    lastAlertRef.current = { key, ts:now };
    if (!alertNumbers||alertNumbers.length===0) return;
    try { await fetch("/api/notify",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message,numbers:alertNumbers}) }); } catch {}
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
                *,*::before,*::after{box-sizing:border-box;margin:0;}
        body{background:${C.offWhite};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pop{0%{transform:scale(.88);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.75;transform:scale(1.04)}}
        .pop{animation:pop .25s ease both;}
        .slideUp{animation:slideUp .3s ease both;}
      `}</style>

      <div style={{ fontFamily:FONT, minHeight:"100vh", background:C.offWhite,
        maxWidth:480, margin:"0 auto", paddingBottom:20 }}>

        {/* ── Header ── */}
        <div style={{ background:C.white, borderBottom:`1px solid ${C.border}`,
          padding:"20px 20px 14px", position:"relative" }}>


          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ color:C.textLt, fontSize:11, fontWeight:600, letterSpacing:0.3 }}>
                Hudson's data
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                {tab !== "stats" && <div style={{ color:C.textDk, fontSize:17, fontWeight:600, lineHeight:1.1 }}>Hey Hudson</div>}
                {tab !== "stats" && dex?.value ? (() => {
                  const bgColor = dex.value<TARGET_LOW?"#F5A623":dex.value>TARGET_HIGH?"#E84040":"#4ADE80";
                  const tr=dex.trend;
                  const arrowColor=(tr===1||tr==="DoubleUp"||tr===7||tr==="DoubleDown")?"#E84040"
                    :(tr===2||tr==="SingleUp"||tr===6||tr==="SingleDown")?"#F5A623"
                    :(tr===3||tr==="FortyFiveUp"||tr===5||tr==="FortyFiveDown")?"#FFD166":"#4ADE80";
                  const isDblDn=tr===7||tr==="DoubleDown";
                  const isSglDn=tr===6||tr==="SingleDown";
                  const isAngDn=tr===5||tr==="FortyFiveDown";
                  const isFlat =tr===4||tr==="Flat";
                  const low90s =dex.value<90;
                  const allWell=isFlat&&dex.value>=80&&dex.value<=125;
                  let alert=null;
                  if      (dex.value<80)              alert={key:"under80",    msg:"Juice or Skittles! 🧃🍬",        color:"#E84040",pulse:true};
                  else if (low90s&&isDblDn)            alert={key:"dblDown",    msg:"Drink juice NOW! 🧃",             color:"#E84040",pulse:true};
                  else if (low90s&&(isSglDn||isAngDn)) alert={key:"dropping",   msg:"Consider Skittles 🍬",            color:"#F5A623",pulse:false};
                  else if (allWell)                    alert={key:"allWell",    msg:"All is well ✅",                  color:"#4ADE80",pulse:false};
                  return (
                    <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                      <div style={{ display:"flex",alignItems:"baseline",gap:8 }}>
                        <span style={{ color:C.textDk,fontWeight:700,fontSize:40,letterSpacing:-1.5,lineHeight:1 }}>{dex.value}</span>
                        <span style={{ color:C.textDk,fontWeight:400,fontSize:26,lineHeight:1 }}>{trendArrow(dex.trend)}</span>
                        <span style={{ color:C.textLt,fontSize:11,fontWeight:500 }}>
                          mg/dL{dex.ageMinutes>0?` · ${dex.ageMinutes} min ago`:""}
                        </span>
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
              {tab !== "stats" && (
                <div style={{ color:C.textLt, fontSize:12, marginTop:3 }}>
                  {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                </div>
              )}
            </div>
            <button type="button" onClick={()=>setShowSettings(true)}
              style={{ background:C.white,border:`1px solid ${C.border}`,
                borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:16,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0,marginLeft:12 }}>⚙️</button>
          </div>

          {/* 3-hr chart — hide on trends tab */}
          {tab !== "stats" && history.length>1&&(
            <div style={{ marginTop:10, marginBottom:2 }}>
              <div style={{ fontSize:12,fontWeight:600,color:C.textDk,marginBottom:6 }}>
                Today
              </div>
              <BGTrendChart history={history}/>
            </div>
          )}

          {/* Today strip — hide on trends tab */}
          {tab !== "stats" && <div style={{ marginTop:12,display:"flex",gap:8 }}>
            {[
              { label:"Doses",         value:todayE.length||"—" },
              { label:"Total carbs",   value:todayE.length?todayE.reduce((s,e)=>s+e.carbs,0)+"g":"—" },
              { label:"Total insulin", value:todayE.length?todayE.reduce((s,e)=>s+e.dose,0)+"u":"—" },
            ].map(s=>(
              <div key={s.label} style={{ flex:1,background:C.white,border:`1px solid ${C.border}`,
                borderRadius:10,padding:"9px 10px" }}>
                <div style={{ color:C.textLt,fontSize:10,fontWeight:500 }}>{s.label}</div>
                <div style={{ color:C.textDk,fontWeight:700,fontSize:18,marginTop:2 }}>{s.value}</div>
              </div>
            ))}
          </div>}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:"flex",background:C.white,borderBottom:`1px solid ${C.border}`,
          position:"sticky",top:0,zIndex:10 }}>
          {[["dose","💉 Dose"],["log","📋 Log"],["sites","📍 Sites"],["stats","📊 Trends"]].map(([id,label])=>(
            <button key={id} type="button" onClick={()=>setTab(id)}
              style={{ flex:1,padding:"14px 0",border:"none",background:"none",cursor:"pointer",
                fontWeight:700,fontSize:12,fontFamily:"inherit",
                color:tab===id?C.textDk:C.textLt,
                borderBottom:tab===id?`2px solid ${C.textDk}`:"2px solid transparent",transition:"all .15s" }}>{label}</button>
          ))}
        </div>

        <div style={{ padding:"0 16px" }}>

          {/* ══ DOSE ══ */}
          {tab==="dose"&&(
            <div className="slideUp">
              <div style={{ padding:"0 0 14px" }}><QuoteBanner /></div>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14 }}>
                {MEALS.map(m=>(
                  <button key={m.id} type="button" onClick={()=>setMealId(m.id)}
                    style={{ border:mealId===m.id?`1px solid ${C.textDk}`:`1px solid ${C.border}`,
                      background:mealId===m.id?C.offWhite:C.white,
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
                        border:carbs===v?`1px solid ${C.textDk}`:`1px solid ${C.border}`,
                        background:carbs===v?C.textDk:C.white,
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
                          style={{ background:"none",border:`1.5px solid ${C.border}`,borderRadius:20,
                            padding:"5px 12px",fontSize:12,fontWeight:500,color:C.textDk,cursor:"pointer",fontFamily:"inherit" }}>
                          📡 Pull from Dexcom ({dex.value} {trendArrow(dex.trend)})
                        </button>
                      </div>
                    )}
                    <div style={{ display:"flex",gap:6,justifyContent:"center",marginTop:12,flexWrap:"wrap" }}>
                      {[80,100,120,150,180,220,280].map(v=>(
                        <button key={v} type="button" onClick={()=>setBg(v)}
                          style={{ padding:"5px 10px",borderRadius:20,fontFamily:"inherit",
                            border:bg===v?`1px solid ${C.textDk}`:`1px solid ${C.border}`,
                            background:bg===v?C.textDk:C.white,
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
                    <div key={b.label} style={{ background:C.offWhite,border:`1px solid ${C.border}`,
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
                💜 Like #89 — manage it, don't let it manage you · Rounds to nearest 0.5u
              </div>
            </div>
          )}

          {/* ══ LOG ══ */}
          {tab==="log"&&(
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
          )}

          {/* ══ SITES ══ */}
          {tab==="sites"&&<SitesTab sites={sites} onAdd={addSite} onDelete={removeSite}/>}

          {/* ══ ANALYTICS ══ */}
          {tab==="stats"&&<AnalyticsTab bgHistory={history} ratios={ratios} rangeLow={rangeLow} rangeHigh={rangeHigh} mealWindows={mealWindows}/>}
        </div>


      </div>

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
