import { useState, useEffect, useRef } from "react";

// ═══ Ravens Palette ══════════════════════════════════════════════════════════
const C = {
  navy:    "#1A0033",
  navyDk:  "#0D0020",
  blue:    "#9B3FC8",
  teal:    "#FFB612",
  white:   "#FFFFFF",
  offWhite:"#F5F0FA",
  border:  "#E2D5F0",
  textDk:  "#1A0033",
  textMd:  "#5A3A7A",
  textLt:  "#9B7FBB",
  low:     "#F5A623",
  high:    "#E84040",
  inRange: "#27AE60",
};

// ═══ Config ═══════════════════════════════════════════════════════════════════
const MEALS = [
  { id:"breakfast", label:"Breakfast", icon:"☀️",  defaultRatio:10 },
  { id:"lunch",     label:"Lunch",     icon:"🌤️", defaultRatio:13 },
  { id:"dinner",    label:"Dinner",    icon:"🌙",  defaultRatio:13 },
  { id:"snack",     label:"Snack",     icon:"🍎",  defaultRatio:15 },
];

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
  return <div style={{ background:C.white, borderRadius:18, border:`1px solid ${C.border}`,
    boxShadow:"0 2px 16px rgba(0,0,0,0.06)", padding:20, ...style }}>{children}</div>;
}

function Badge({ color, children }) {
  return <span style={{ background:color+"22", color, fontWeight:700, fontSize:12,
    borderRadius:20, padding:"3px 10px" }}>{children}</span>;
}

function Btn({ onClick, children, variant="primary", style={}, disabled=false }) {
  const v = {
    primary:   { background:`linear-gradient(135deg,${C.blue},#C060F0)`, color:"#fff", boxShadow:`0 4px 18px ${C.blue}44`, border:"none" },
    secondary: { background:C.offWhite, color:C.blue, border:`1.5px solid ${C.border}` },
    danger:    { background:"#FFF0F0",  color:C.high, border:"1.5px solid #F5CCCC" },
  }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} style={{ borderRadius:30, fontWeight:700,
    cursor:disabled?"not-allowed":"pointer", fontSize:15, padding:"12px 28px",
    fontFamily:"inherit", opacity:disabled?0.5:1, ...v, ...style }}>{children}</button>;
}

function NumPad({ value, onChange, step=1, min=0, max=500, unit="" }) {
  const bs = { width:44, height:44, borderRadius:"50%", border:`2px solid ${C.border}`,
    background:C.offWhite, fontSize:22, cursor:"pointer", color:C.blue,
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
  const dc  = v  => v<TARGET_LOW?"#F5A623":v>TARGET_HIGH?"#E84040":"#4ADE80";
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
    <div style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)",
      borderRadius:16, padding:"10px 12px 6px" }} onClick={()=>setTooltip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{ width:"100%", height:"auto", display:"block", overflow:"visible", touchAction:"none" }}
        onTouchStart={handleTouch} onTouchMove={handleTouch} onClick={handleTouch}>
        <rect x={PAD.left} y={yH} width={cW} height={yL-yH} fill="rgba(74,222,128,0.10)" rx="2"/>
        <line x1={PAD.left} y1={yH} x2={PAD.left+cW} y2={yH} stroke="rgba(74,222,128,0.35)" strokeWidth="1" strokeDasharray="4 3"/>
        <line x1={PAD.left} y1={yL} x2={PAD.left+cW} y2={yL} stroke="rgba(245,166,35,0.45)" strokeWidth="1" strokeDasharray="4 3"/>
        <text x={W-PAD.right+4} y={yH+4} fontSize="9" fill="rgba(74,222,128,0.8)" fontWeight="700">{TARGET_HIGH}</text>
        <text x={W-PAD.right+4} y={yL+4} fontSize="9" fill="rgba(245,166,35,0.9)" fontWeight="700">{TARGET_LOW}</text>
        {pts.length>1&&<path d={path} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="12" fill="transparent"/>
            <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)}
              r={tooltip?.x===p.x?6:i===pts.length-1?5:3}
              fill={dc(p.v)}
              stroke={tooltip?.x===p.x?"#fff":i===pts.length-1?"rgba(255,255,255,0.9)":"none"}
              strokeWidth={tooltip?.x===p.x?2.5:i===pts.length-1?2:0} opacity="0.9"/>
          </g>
        ))}
        {latest&&!tooltip&&(
          <text x={Math.min(latest.x,W-PAD.right-10)} y={latest.y-9}
            fontSize="11" fontWeight="900" fill={dc(latest.v)} textAnchor="middle">{latest.v}</text>
        )}
        {tooltip&&(
          <g>
            <rect x={tx-28} y={ty-16} width="56" height="22" rx="8" fill={dc(tooltip.v)} opacity="0.95"/>
            <text x={tx} y={ty-1} fontSize="12" fontWeight="900" fill="#fff" textAnchor="middle" fontFamily="Nunito,sans-serif">{tooltip.v}</text>
            <text x={tx} y={ty+18} fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)" textAnchor="middle" fontFamily="Nunito,sans-serif">{tooltip.time}</text>
            <line x1={tx} y1={ty+6} x2={tooltip.x.toFixed(1)} y2={tooltip.y-7} stroke={dc(tooltip.v)} strokeWidth="1.5" opacity="0.6"/>
          </g>
        )}
        {tLbls.map((t,i)=>(
          <text key={i} x={t.x.toFixed(1)} y={H-3} fontSize="9" fill="rgba(255,255,255,0.4)"
            textAnchor={i===0?"start":i===tLbls.length-1?"end":"middle"} fontWeight="600" fontFamily="Nunito,sans-serif">
            {t.label}
          </text>
        ))}
      </svg>
    </div>
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
                border: (!useCustom && period===p.days) ? `2px solid ${C.blue}` : `1.5px solid ${C.border}`,
                background: (!useCustom && period===p.days) ? `${C.blue}18` : C.offWhite,
                color: (!useCustom && period===p.days) ? C.blue : C.textMd, cursor:"pointer" }}>
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
              <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.pct}%</div>
              <div style={{ fontSize:11, color:C.textMd, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:900, color:C.textDk }}>{stats.avg}</div>
            <div style={{ fontSize:11, color:C.textLt, fontWeight:600 }}>Avg BG</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:22, fontWeight:900, color:C.blue }}>{stats.a1c}%</div>
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
    <div style={{ background:`linear-gradient(135deg,#1A0033 0%,#3B0075 60%,#9B3FC8 100%)`,
      borderRadius:18, padding:"18px 20px", marginBottom:14,
      boxShadow:"0 4px 20px rgba(155,63,200,0.25)", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", right:10, top:-10, fontSize:80, color:"rgba(255,255,255,0.07)",
        fontWeight:900, lineHeight:1, fontFamily:"Georgia,serif", userSelect:"none" }}>"</div>
      <div style={{ fontSize:10, fontWeight:800, color:C.teal, letterSpacing:2, textTransform:"uppercase", marginBottom:8 }}>
        🏈 Mark Andrews Mode
      </div>
      <div style={{ fontSize:15, fontWeight:700, color:"#fff", lineHeight:1.5, marginBottom:8 }}>"{q.text}"</div>
      <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", fontStyle:"italic" }}>— {q.attr}</div>
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
      style={{ width:"100%", padding:"11px 0", borderRadius:12, fontFamily:"inherit",
        background: status==="error" ? "#FFF0F0" : `linear-gradient(135deg,${C.blue},#C060F0)`,
        color: status==="error" ? C.high : "#fff",
        border: status==="error" ? `1.5px solid #F5CCCC` : "none",
        fontWeight:800, fontSize:13, cursor:status==="loading"?"not-allowed":"pointer",
        opacity:status==="loading"?0.7:1 }}>
      {status==="loading" ? "⏳ Importing… this takes ~30 seconds"
       : status==="error"  ? "⚠️ Import failed — tap to retry"
       : "🔄 Re-import 90-Day History"}
    </button>
  );
}

// ═══ Settings Modal ═══════════════════════════════════════════════════════════
function SettingsModal({ ratios, setRatios, alertNumbers, setAlertNumbers, rangeLow, setRangeLow, rangeHigh, setRangeHigh, mealWindows, setMealWindows, onClose }) {
  const [local, setLocal]               = useState({ ...ratios });
  const [localNumbers, setLocalNumbers] = useState([...alertNumbers]);
  const [localMW, setLocalMW]           = useState({ ...(mealWindows||DEFAULT_MEAL_WINDOWS) });
  const fmtH = h => h===0?"12am":h<12?`${h}am`:h===12?"12pm":`${h-12}pm`;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(13,0,32,0.80)",
        display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div style={{ background:C.white, borderRadius:"24px 24px 0 0", padding:"24px 24px 48px",
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

        {/* Alert Numbers */}
        <div style={{ marginBottom:24 }}>
          <div style={{ fontWeight:900, fontSize:16, color:C.textDk, marginBottom:4 }}>📱 Alert Numbers</div>
          <div style={{ color:C.textMd, fontSize:12, marginBottom:12 }}>Text alerts sent when BG goes low or critical</div>
          {localNumbers.map((n,i)=>(
            <div key={i} style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center" }}>
              <input value={n}
                onChange={e=>{ const u=[...localNumbers]; u[i]=e.target.value; setLocalNumbers(u); }}
                placeholder="e.g. 267-481-2133"
                style={{ flex:1, padding:"10px 14px", borderRadius:12, fontSize:14,
                  border:`1.5px solid ${C.border}`, fontFamily:"inherit", color:C.textDk, outline:"none" }}/>
              <button type="button"
                onClick={()=>setLocalNumbers(localNumbers.filter((_,j)=>j!==i))}
                style={{ background:"#FFF0F0", border:"1.5px solid #F5CCCC", borderRadius:10,
                  color:C.high, fontWeight:700, fontSize:18, width:36, height:36,
                  cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={()=>setLocalNumbers([...localNumbers,""])}
            style={{ background:C.offWhite, border:`1.5px dashed ${C.border}`, borderRadius:12,
              padding:"8px 16px", color:C.blue, fontWeight:700, fontSize:13,
              cursor:"pointer", fontFamily:"inherit", width:"100%" }}>+ Add Number</button>
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
          <Btn onClick={()=>{ setRatios(local); setAlertNumbers(localNumbers.filter(n=>n.trim().length>=10)); setMealWindows(localMW); onClose(); }} style={{ flex:1 }}>Save Changes</Btn>
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
        <div style={{ fontSize:22, fontWeight:800, color:C.blue }}>{entry.dose}u</div>
        <button type="button" onClick={()=>onDelete(entry.id)}
          style={{ background:"none", border:"none", cursor:"pointer", color:C.textLt, fontSize:11, padding:"2px 0", fontFamily:"inherit" }}>remove</button>
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

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;}
        body{background:${C.offWhite};font-family:'Nunito',sans-serif;}
        ::-webkit-scrollbar{display:none;}
        @keyframes pop{0%{transform:scale(.88);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1}}
        @keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.75;transform:scale(1.04)}}
        .pop{animation:pop .25s ease both;}
        .slideUp{animation:slideUp .3s ease both;}
      `}</style>

      <div style={{ fontFamily:"'Nunito',sans-serif", minHeight:"100vh", background:C.offWhite,
        maxWidth:480, margin:"0 auto", paddingBottom:20 }}>

        {/* ── Header ── */}
        <div style={{ background:`linear-gradient(160deg,${C.navyDk} 0%,#200040 40%,#2D0057 100%)`,
          padding:"36px 20px 16px", position:"relative", overflow:"hidden" }}>


          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div style={{ flex:1 }}>
              <div style={{ color:C.teal, fontSize:10, fontWeight:800, letterSpacing:1.5, textTransform:"uppercase" }}>
                Insulin Tracker
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginTop:4, flexWrap:"wrap" }}>
                {tab !== "stats" && <div style={{ color:"#fff", fontSize:22, fontWeight:900, lineHeight:1.1 }}>Hey Hudson 🏈</div>}
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
                      <div style={{ display:"flex",alignItems:"center",gap:8,background:bgColor+"22",
                        border:`2px solid ${bgColor}55`,borderRadius:30,padding:"6px 16px",boxShadow:`0 0 16px ${bgColor}33` }}>
                        <div style={{ width:10,height:10,borderRadius:"50%",background:bgColor,boxShadow:`0 0 8px ${bgColor}` }}/>
                        <span style={{ color:"#fff",fontWeight:900,fontSize:22,letterSpacing:-0.5 }}>{dex.value}</span>
                        <span style={{ color:arrowColor,fontWeight:900,fontSize:22,lineHeight:1 }}>{trendArrow(dex.trend)}</span>
                        {dex.ageMinutes>0&&<span style={{ color:"rgba(255,255,255,0.4)",fontSize:10,fontWeight:700 }}>{dex.ageMinutes}m</span>}
                      </div>
                      {alert&&(
                        <div style={{ fontSize:12,fontWeight:800,color:alert.color,background:alert.color+"18",
                          border:`1.5px solid ${alert.color}44`,borderRadius:20,padding:"4px 12px",
                          animation:alert.pulse?"pulse 1s ease-in-out infinite":"none",maxWidth:160,lineHeight:1.3 }}>
                          {alert.msg}
                        </div>
                      )}
                    </div>
                  );
                })() : dexLoading ? (
                  <div style={{ background:"rgba(255,255,255,0.08)",borderRadius:30,padding:"6px 16px",
                    color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:600 }}>📡 Connecting…</div>
                ) : null}
              </div>
              {tab !== "stats" && (
                <div style={{ color:"rgba(255,255,255,0.45)", fontSize:11, marginTop:2 }}>
                  {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                </div>
              )}
            </div>
            <button type="button" onClick={()=>setShowSettings(true)}
              style={{ background:"rgba(255,255,255,0.12)",border:"1.5px solid rgba(255,255,255,0.20)",
                borderRadius:12,width:44,height:44,cursor:"pointer",fontSize:20,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:0,marginLeft:12 }}>⚙️</button>
          </div>

          {/* 3-hr chart — hide on trends tab */}
          {tab !== "stats" && history.length>1&&(
            <div style={{ marginTop:10, marginBottom:2 }}>
              <div style={{ fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.4)",letterSpacing:1.5,textTransform:"uppercase",marginBottom:4 }}>
                Last 3 Hours
              </div>
              <BGTrendChart history={history}/>
            </div>
          )}

          {/* Today strip — hide on trends tab */}
          {tab !== "stats" && <div style={{ marginTop:10,background:"rgba(255,255,255,0.07)",borderRadius:12,padding:"8px 14px",display:"flex",gap:20 }}>
            {[
              { label:"Doses",         value:todayE.length||"—" },
              { label:"Total carbs",   value:todayE.length?todayE.reduce((s,e)=>s+e.carbs,0)+"g":"—" },
              { label:"Total insulin", value:todayE.length?todayE.reduce((s,e)=>s+e.dose,0)+"u":"—" },
            ].map(s=>(
              <div key={s.label}>
                <div style={{ color:"#fff",fontWeight:800,fontSize:16 }}>{s.value}</div>
                <div style={{ color:"rgba(255,255,255,0.45)",fontSize:11,fontWeight:600 }}>{s.label}</div>
              </div>
            ))}
          </div>}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display:"flex",background:C.white,borderBottom:`1px solid ${C.border}`,
          position:"sticky",top:0,zIndex:10 }}>
          {[["dose","💉 Calculate"],["log","📋 History"],["stats","📊 Trends"]].map(([id,label])=>(
            <button key={id} type="button" onClick={()=>setTab(id)}
              style={{ flex:1,padding:"14px 0",border:"none",background:"none",cursor:"pointer",
                fontWeight:700,fontSize:13,fontFamily:"inherit",
                color:tab===id?C.blue:C.textLt,
                borderBottom:tab===id?`3px solid ${C.blue}`:"3px solid transparent",transition:"all .18s" }}>{label}</button>
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
                    style={{ border:mealId===m.id?`2.5px solid ${C.blue}`:`2px solid ${C.border}`,
                      background:mealId===m.id?`${C.blue}11`:C.white,
                      borderRadius:14,padding:"10px 4px",cursor:"pointer",textAlign:"center",transition:"all .18s",fontFamily:"inherit" }}>
                    <div style={{ fontSize:22 }}>{m.icon}</div>
                    <div style={{ fontSize:11,fontWeight:700,marginTop:2,color:mealId===m.id?C.blue:C.textMd }}>{m.label}</div>
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
                        border:carbs===v?`2px solid ${C.blue}`:`1.5px solid ${C.border}`,
                        background:carbs===v?`${C.blue}18`:C.offWhite,
                        color:carbs===v?C.blue:C.textMd,fontWeight:700,fontSize:13,cursor:"pointer" }}>{v}g</button>
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
                            padding:"5px 12px",fontSize:12,fontWeight:700,color:C.blue,cursor:"pointer",fontFamily:"inherit" }}>
                          📡 Pull from Dexcom ({dex.value} {trendArrow(dex.trend)})
                        </button>
                      </div>
                    )}
                    <div style={{ display:"flex",gap:6,justifyContent:"center",marginTop:12,flexWrap:"wrap" }}>
                      {[80,100,120,150,180,220,280].map(v=>(
                        <button key={v} type="button" onClick={()=>setBg(v)}
                          style={{ padding:"5px 10px",borderRadius:20,fontFamily:"inherit",
                            border:bg===v?`2px solid ${C.blue}`:`1.5px solid ${C.border}`,
                            background:bg===v?`${C.blue}18`:C.offWhite,
                            color:bg===v?C.blue:C.textMd,fontWeight:700,fontSize:12,cursor:"pointer" }}>{v}</button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign:"center",color:C.textLt,fontSize:13 }}>Toggle on to include a correction dose</div>
                )}
              </Card>

              <Card style={{ background:`linear-gradient(135deg,#1A0033 0%,#3B0075 100%)`,
                border:"none",marginBottom:14,position:"relative",overflow:"hidden" }}>
                <div style={{ position:"absolute",right:-30,top:-30,width:130,height:130,
                  borderRadius:"50%",background:"rgba(255,182,18,.08)",pointerEvents:"none" }}/>
                <div style={{ color:"rgba(255,255,255,.6)",fontSize:11,fontWeight:800,
                  letterSpacing:1.5,textTransform:"uppercase",marginBottom:8 }}>Recommended Dose</div>
                <div style={{ display:"flex",alignItems:"baseline",gap:6,marginBottom:16 }}>
                  <div className="pop" key={dose.total}
                    style={{ fontSize:64,fontWeight:900,color:"#fff",lineHeight:1 }}>{dose.total}</div>
                  <div style={{ fontSize:22,color:"#FFB612",fontWeight:800 }}>units</div>
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  {[
                    { label:"Meal dose",          val:dose.carbDose+"u" },
                    { label:"Correction",          val:dose.correction+"u" },
                    { label:`1:${ratios[mealId]}g`, val:carbs+"g" },
                  ].map(b=>(
                    <div key={b.label} style={{ background:"rgba(255,255,255,.09)",borderRadius:12,padding:"8px 10px",flex:1,textAlign:"center" }}>
                      <div style={{ color:"rgba(255,255,255,.55)",fontSize:10,fontWeight:700 }}>{b.label}</div>
                      <div style={{ color:"#fff",fontSize:17,fontWeight:800 }}>{b.val}</div>
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

          {/* ══ ANALYTICS ══ */}
          {tab==="stats"&&<AnalyticsTab bgHistory={history} ratios={ratios} rangeLow={rangeLow} rangeHigh={rangeHigh} mealWindows={mealWindows}/>}
        </div>


      </div>

      {showSettings&&(
        <SettingsModal ratios={ratios} setRatios={saveRatios}
          alertNumbers={alertNumbers} setAlertNumbers={saveAlertNumbers}
          rangeLow={rangeLow}   setRangeLow={v=>{setRangeLow(v);   localStore.set("hud-range-low",v);}}
          rangeHigh={rangeHigh} setRangeHigh={v=>{setRangeHigh(v); localStore.set("hud-range-high",v);}}
          mealWindows={mealWindows} setMealWindows={saveMealWindows}
          onClose={()=>setShowSettings(false)}/>
      )}
    </>
  );
}
