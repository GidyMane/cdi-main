import {
  Thermometer, Droplets, Wind, CloudRain,
  ArrowRight, MapPin, TrendingUp, TrendingDown, Minus, Clock,
} from "lucide-react";
import React, { useState, useEffect } from "react";
import type { PageType } from "../App";
import { overviewAPI, weatherAPI } from "../services/api";
import { useAppStore } from "@/store/useAppStore";

interface OverviewPageProps { onNavigate: (page: PageType) => void; isDarkMode?: boolean }

const FAO_BLUE = "#318DDE";

const formatTimeAgo = (ds: string) => {
  try {
    const s = Math.floor((Date.now() - new Date(ds).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    return `${Math.floor(s / 3600)} hr ago`;
  } catch { return "recently"; }
};

/* ── Sparkline ─────────────────────────────────────────────────── */
const PATHS = {
  up:       "M2,20 C12,17 24,13 34,9  C44,5  54,3  68,2",
  down:     "M2,2  C12,5  24,9  34,13 C44,17 54,19 68,21",
  flat:     "M2,12 C12,7  18,16 28,11 C38,6  52,15 68,10",
  volatile: "M2,13 C8,4  15,20 23,8  C31,2  41,18 51,7 C59,2 65,15 68,11",
};
const Sparkline = ({ type, color }: { type: keyof typeof PATHS; color: string }) => (
  <svg width="72" height="24" viewBox="0 0 72 24" fill="none">
    <path d={PATHS[type]} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/* ── Threshold bar ─────────────────────────────────────────────── */
const ThresholdBar = ({ value, min, max, segments, isDarkMode }: {
  value: number; min: number; max: number;
  segments: { label: string; color: string; end: number }[];
  isDarkMode: boolean;
}) => {
  const pct = Math.min(97, Math.max(3, ((value - min) / (max - min)) * 100));
  let prev = min;
  const widths = segments.map(s => { const w = ((s.end - prev) / (max - min)) * 100; prev = s.end; return w; });
  return (
    <div className="mt-3">
      <div className="relative h-1.5 flex gap-px rounded-full overflow-visible">
        {segments.map((s, i) => (
          <div key={i} className="h-full rounded-full" style={{ width: `${widths[i]}%`, backgroundColor: s.color }}/>
        ))}
        <div className="absolute -top-0.5 w-2.5 h-2.5 rounded-full border-2 shadow-md z-10"
          style={{ left: `calc(${pct}% - 5px)`, backgroundColor: isDarkMode ? "#1e293b" : "#fff", borderColor: isDarkMode ? "#94a3b8" : "#64748b" }}/>
      </div>
      <div className="flex justify-between mt-1.5">
        {segments.map(s => (
          <span key={s.label} className="text-[9px]" style={{ color: isDarkMode ? "#475569" : "#94a3b8" }}>{s.label}</span>
        ))}
      </div>
    </div>
  );
};

/* ── Module art SVGs ───────────────────────────────────────────── */
const WeatherArtCard = () => (
  <svg viewBox="0 0 300 200" fill="none" className="w-full h-full">
    {/* subtle grid */}
    {[0,1,2,3,4].map(i=><line key={i} x1="0" y1={i*50} x2="300" y2={i*50} stroke="white" strokeOpacity="0.04" strokeWidth="1"/>)}
    {[0,1,2,3,4,5].map(i=><line key={i} x1={i*60} y1="0" x2={i*60} y2="200" stroke="white" strokeOpacity="0.04" strokeWidth="1"/>)}
    {/* low-pressure isobar rings */}
    {[82,62,44,29,17,9].map((r,i)=>(
      <circle key={i} cx="238" cy="58" r={r}
        stroke="white" strokeOpacity={0.07+i*0.05} strokeWidth={i===5?1.5:1}
        strokeDasharray={i%2===0?"4 7":"none"}
        fill={i>=4?"white":"none"} fillOpacity={i===5?0.7:i===4?0.25:0}/>
    ))}
    <text x="232" y="63" fontSize="11" fontWeight="bold" fill="white" fillOpacity="0.85">L</text>
    <line x1="238" y1="58" x2="298" y2="8"  stroke="white" strokeOpacity="0.18" strokeWidth="1.2"/>
    <line x1="238" y1="58" x2="298" y2="108" stroke="white" strokeOpacity="0.10" strokeWidth="1"/>
    {/* cloud mass */}
    <ellipse cx="92"  cy="118" rx="70" ry="30" fill="white" fillOpacity="0.16"/>
    <ellipse cx="124" cy="100" rx="52" ry="30" fill="white" fillOpacity="0.20"/>
    <ellipse cx="60"  cy="124" rx="40" ry="22" fill="white" fillOpacity="0.12"/>
    <ellipse cx="158" cy="108" rx="36" ry="22" fill="white" fillOpacity="0.14"/>
    <ellipse cx="118" cy="93"  rx="30" ry="13" fill="white" fillOpacity="0.10"/>
    {/* rain streaks */}
    {[48,64,82,100,118,136,154,58,90,110,130,148].map((x,i)=>(
      <line key={i} x1={x} y1={143+(i%3)*9} x2={x-4} y2={158+(i%3)*9}
        stroke="white" strokeOpacity="0.38" strokeWidth="1.2" strokeLinecap="round"/>
    ))}
    {/* wind streamlines */}
    <path d="M162 152 Q200 140 244 152 Q272 160 296 154"
      stroke="white" strokeOpacity="0.15" strokeWidth="1.5" fill="none"/>
    <path d="M130 168 Q190 156 248 168 Q276 175 300 168"
      stroke="white" strokeOpacity="0.10" strokeWidth="1" fill="none"/>
  </svg>
);

const DroughtArtCard = () => (
  <svg viewBox="0 0 300 200" fill="none" className="w-full h-full">
    {/* sun glow halos */}
    <circle cx="222" cy="70" r="95" fill="white" fillOpacity="0.02"/>
    <circle cx="222" cy="70" r="70" fill="white" fillOpacity="0.04"/>
    <circle cx="222" cy="70" r="48" fill="white" fillOpacity="0.07"/>
    <circle cx="222" cy="70" r="30" fill="white" fillOpacity="0.16"/>
    <circle cx="222" cy="70" r="17" fill="white" fillOpacity="0.55"/>
    {/* sun rays */}
    {Array.from({length:18},(_,i)=>{
      const a=(i*20*Math.PI)/180, r1=32, r2=53;
      return <line key={i}
        x1={222+r1*Math.cos(a)} y1={70+r1*Math.sin(a)}
        x2={222+r2*Math.cos(a)} y2={70+r2*Math.sin(a)}
        stroke="white" strokeOpacity={i%2===0?0.55:0.32} strokeWidth={i%2===0?1.8:1.2} strokeLinecap="round"/>;
    })}
    {/* heat shimmer waves */}
    {[0,1,2,3,4].map(y=>(
      <path key={y} d={`M0 ${122+y*9} Q50 ${117+y*9} 100 ${122+y*9} Q150 ${127+y*9} 200 ${122+y*9} Q240 ${117+y*9} 280 ${122+y*9}`}
        stroke="white" strokeOpacity={0.13-y*0.02} strokeWidth="1" fill="none"/>
    ))}
    {/* cracked earth silhouette */}
    <path d="M0 158 L42 148 L85 156 L132 144 L178 154 L224 143 L268 152 L300 144 L300 200 L0 200 Z"
      fill="white" fillOpacity="0.09"/>
    {/* crack lines */}
    <path d="M48 153 L60 166 L54 180" stroke="white" strokeOpacity="0.22" strokeWidth="0.9" fill="none"/>
    <path d="M115 149 L128 163 L121 177 M128 163 L140 171" stroke="white" strokeOpacity="0.22" strokeWidth="0.9" fill="none"/>
    <path d="M202 147 L214 161 L207 174 M214 161 L226 168" stroke="white" strokeOpacity="0.20" strokeWidth="0.9" fill="none"/>
    <path d="M262 150 L274 163 L267 177" stroke="white" strokeOpacity="0.18" strokeWidth="0.9" fill="none"/>
    {/* thermometer left */}
    <rect x="20" y="42" width="9" height="82" rx="4.5" stroke="white" strokeOpacity="0.28" strokeWidth="1" fill="none"/>
    <circle cx="24.5" cy="130" r="8.5" stroke="white" strokeOpacity="0.28" strokeWidth="1" fill="none"/>
    <rect x="22.5" y="72" width="4" height="56" rx="2" fill="white" fillOpacity="0.42"/>
    <circle cx="24.5" cy="130" r="5.5" fill="white" fillOpacity="0.42"/>
    {[52,67,82,97,112].map((y,i)=>(
      <line key={i} x1="29" y1={y} x2="36" y2={y} stroke="white" strokeOpacity="0.28" strokeWidth="0.8"/>
    ))}
  </svg>
);

const FloodArtCard = () => (
  <svg viewBox="0 0 300 200" fill="none" className="w-full h-full">
    {/* rain drops */}
    {[22,52,88,126,165,204,245,282,38,106,178,255].map((x,i)=>(
      <ellipse key={i} cx={x} cy={10+(i%5)*14} rx="1.8" ry="5.5"
        fill="white" fillOpacity="0.42"/>
    ))}
    {/* basin fill */}
    <ellipse cx="150" cy="160" rx="200" ry="70" fill="white" fillOpacity="0.05"/>
    {/* wave crests */}
    {[0,1,2,3].map(i=>(
      <path key={i}
        d={`M${-10+i*3} ${98-i*13} C${72+i*3} ${85-i*13} ${144+i*2} ${106-i*13} ${208} ${92-i*13} C${258-i*2} ${78-i*13} ${288-i*3} ${98-i*13} ${315} ${88-i*13}`}
        stroke="white" strokeOpacity={0.42-i*0.08} strokeWidth={2.4-i*0.35} fill="none"/>
    ))}
    {/* water fill layers */}
    <path d="M-10 152 C62 139 124 160 186 146 C244 132 278 152 315 143 L315 200 L-10 200 Z"
      fill="white" fillOpacity="0.12"/>
    <path d="M-10 138 C72 125 148 146 212 132 C262 120 290 138 315 130 L315 200 L-10 200 Z"
      fill="white" fillOpacity="0.09"/>
    <path d="M-10 122 C82 109 158 130 222 116 C270 105 296 122 315 114 L315 200 L-10 200 Z"
      fill="white" fillOpacity="0.07"/>
    {/* ripple rings */}
    {[[72,136],[188,142],[272,132]].map(([cx,cy],i)=>(
      <React.Fragment key={i}>
        <circle cx={cx} cy={cy} r="7"  stroke="white" strokeOpacity="0.24" strokeWidth="1" fill="none"/>
        <circle cx={cx} cy={cy} r="15" stroke="white" strokeOpacity="0.14" strokeWidth="1" fill="none"/>
        <circle cx={cx} cy={cy} r="26" stroke="white" strokeOpacity="0.07" strokeWidth="1" fill="none"/>
      </React.Fragment>
    ))}
    {/* water-level gauge */}
    <rect x="272" y="68" width="7" height="92" rx="3.5" stroke="white" strokeOpacity="0.28" strokeWidth="1" fill="none"/>
    <rect x="273.5" y="120" width="4" height="40" rx="2" fill="white" fillOpacity="0.38"/>
    {[78,93,108,123,138,153].map((y,i)=>(
      <line key={i} x1="279" y1={y} x2="285" y2={y} stroke="white" strokeOpacity="0.25" strokeWidth="0.8"/>
    ))}
    <text x="268" y="118" fontSize="7" fill="white" fillOpacity="0.40" textAnchor="end">HWM</text>
  </svg>
);

const StationsArtCard = () => (
  <svg viewBox="0 0 300 200" fill="none" className="w-full h-full">
    {/* topographic grid */}
    {[0,1,2,3].map(i=>(
      <path key={i}
        d={`M0 ${48+i*42} Q75 ${42+i*42} 150 ${48+i*42} Q225 ${54+i*42} 300 ${48+i*42}`}
        stroke="white" strokeOpacity="0.05" strokeWidth="1" fill="none"/>
    ))}
    {[0,1,2,3,4,5].map(i=>(
      <line key={i} x1={i*60} y1="0" x2={i*60} y2="200" stroke="white" strokeOpacity="0.04" strokeWidth="1"/>
    ))}
    {/* broadcast rings from main hub */}
    {[22,40,58,78].map((r,i)=>(
      <circle key={i} cx="150" cy="75" r={r}
        stroke="white" strokeOpacity={0.17-i*0.03}
        strokeWidth="1" strokeDasharray={i%2===0?"3 6":"none"} fill="none"/>
    ))}
    {/* connection lines */}
    {[
      [150,75, 52,42],[150,75,250,48],[150,75,108,125],
      [150,75,222,112],[108,125,52,42],[108,125,68,156],
      [222,112,250,48],[222,112,268,145],[250,48,292,32],
      [68,156,40,180],[268,145,290,168],
    ].map(([x1,y1,x2,y2],i)=>(
      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="white" strokeOpacity={i<4?0.38:0.20}
        strokeWidth={i<4?1.3:0.9}
        strokeDasharray={i>=4?"3 5":"none"}/>
    ))}
    {/* station nodes */}
    {[
      [150,75,13,0.88],[52,42,7.5,0.72],[250,48,7.5,0.72],
      [108,125,7,0.65],[222,112,7,0.65],
      [68,156,6,0.55],[268,145,6,0.55],[292,32,5.5,0.50],[40,180,5,0.45],[290,168,5,0.45],
    ].map(([cx,cy,r,op],i)=>(
      <g key={i}>
        <circle cx={cx as number} cy={cy as number} r={(r as number)*2.2} fill="white" fillOpacity="0.06"/>
        <circle cx={cx as number} cy={cy as number} r={r as number} fill="white" fillOpacity={op as number}/>
      </g>
    ))}
    {/* telemetry bar */}
    {[0,1,2,3,4,5,6,7,8].map(i=>(
      <rect key={i} x={10+i*32} y={178-(6+(i%3)*5)} width="22" height={6+(i%3)*5} rx="1.5"
        fill="white" fillOpacity={0.10+i*0.02}/>
    ))}
  </svg>
);

type ModuleStat = { label: string; value: string };

/* ── Module definitions ─────────────────────────────────────────── */
const MODULES: {
  id: string; title: string; color: string; tag: string;
  desc: string; gradient: string; Art: React.FC;
  stats: ModuleStat[];
}[] = [
  {
    id: "weather", title: "Weather Forecast", color: FAO_BLUE,
    tag: "7-Day Forecast",
    desc: "High-resolution precipitation, temperature and wind predictions across all Uganda districts using ICON & GFS models.",
    gradient: "linear-gradient(150deg, #1d4ed8 0%, #1e3a8a 100%)",
    Art: WeatherArtCard,
    stats: [
      { label: "Forecast Range", value: "7 Days" },
      { label: "Models", value: "ICON & GFS" },
      { label: "Districts", value: "135" },
    ],
  },
  {
    id: "drought", title: "Drought Monitor", color: "#f97316",
    tag: "Risk Assessment",
    desc: "Composite drought risk index combining temperature, precipitation deficit and vegetation stress signals per district.",
    gradient: "linear-gradient(150deg, #c2410c 0%, #7c2d12 100%)",
    Art: DroughtArtCard,
    stats: [
      { label: "Districts at Risk", value: "--" },
      { label: "Coverage", value: "135 Districts" },
      { label: "Index", value: "CDI" },
    ],
  },
  {
    id: "flood", title: "Flood Monitor", color: "#06b6d4",
    tag: "Early Warning",
    desc: "Real-time basin-level river discharge tracking for the Nile, Kagera and Victoria basins with automated thresholds.",
    gradient: "linear-gradient(150deg, #0891b2 0%, #155e75 100%)",
    Art: FloodArtCard,
    stats: [
      { label: "Alert Areas", value: "--" },
      { label: "River Basins", value: "9" },
      { label: "Active Alerts", value: "--" },
    ],
  },
  {
    id: "stations", title: "Weather Stations", color: "#22c55e",
    tag: "AWS Network",
    desc: "Live sensor network spanning Uganda — temperature, humidity, wind and rainfall at 15-minute reporting intervals.",
    gradient: "linear-gradient(150deg, #16a34a 0%, #14532d 100%)",
    Art: StationsArtCard,
    stats: [
      { label: "Online", value: "--" },
      { label: "Network Health", value: "--" },
      { label: "Report Interval", value: "15 min" },
    ],
  },
];

/* ── Page ────────────────────────────────────────────────────────── */
export default function OverviewPage({ onNavigate, isDarkMode = true }: OverviewPageProps) {
  const { selectedDistrictId } = useAppStore((s) => s);

  const [isLoading,   setIsLoading]   = useState(true);
  const [weather,     setWeather]     = useState<any>(null);
  const [moduleStats, setModuleStats] = useState<any>(null);
  const [quickStats,  setQuickStats]  = useState({ lastUpdated: "", alerts: 0, online: 0, total: 0 });
  const [modules,     setModules]     = useState(MODULES);
  const [apiError,    setApiError]    = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ms, qs, wd] = await Promise.all([
          overviewAPI.getModuleStats() as Promise<any>,
          overviewAPI.getQuickStats()  as Promise<any>,
          weatherAPI.getDashboard()    as Promise<any>,
        ]);
        if (ms) setModuleStats(ms);
        setQuickStats({
          lastUpdated: qs?.last_updated ? formatTimeAgo(qs.last_updated) : "",
          alerts: qs?.active_alerts ?? 0,
          online: qs?.stations_online ?? 0,
          total:  qs?.stations_total  ?? 0,
        });
        if (wd) setWeather(wd);
        if (ms) {
          const tags = [
            ms.weather_forecast?.accuracy_pct     ? `Accuracy ${ms.weather_forecast.accuracy_pct}%` : "7-Day Forecast",
            ms.drought_monitor?.districts_at_risk  ? `${ms.drought_monitor.districts_at_risk} Districts at Risk` : "Risk Assessment",
            ms.flood_monitor?.alert_areas          ? `${ms.flood_monitor.alert_areas} Alert Areas` : "Early Warning",
            ms.weather_stations?.online            ? `${ms.weather_stations.online}/${ms.weather_stations.total} Online` : "AWS Network",
          ];
          const netPct = ms.weather_stations?.total > 0
            ? Math.round((ms.weather_stations.online / ms.weather_stations.total) * 100) : null;
          const statsPerModule: ModuleStat[][] = [
            [
              { label: "Model Accuracy", value: ms.weather_forecast?.accuracy_pct != null ? `${ms.weather_forecast.accuracy_pct}%` : "--" },
              { label: "Forecast Range", value: "7 Days" },
              { label: "Districts", value: "135" },
            ],
            [
              { label: "Districts at Risk", value: ms.drought_monitor?.districts_at_risk != null ? String(ms.drought_monitor.districts_at_risk) : "--" },
              { label: "Coverage", value: "135 Districts" },
              { label: "Index", value: "CDI" },
            ],
            [
              { label: "Alert Areas", value: ms.flood_monitor?.alert_areas != null ? String(ms.flood_monitor.alert_areas) : "--" },
              { label: "River Basins", value: "9" },
              { label: "Active Alerts", value: String(qs?.active_alerts ?? 0) },
            ],
            [
              { label: "Online", value: ms.weather_stations?.online != null ? `${ms.weather_stations.online}/${ms.weather_stations.total}` : "--" },
              { label: "Network Health", value: netPct !== null ? `${netPct}%` : "--" },
              { label: "Report Interval", value: "15 min" },
            ],
          ];
          setModules(prev => prev.map((m, i) => ({ ...m, tag: tags[i], stats: statsPerModule[i] })));
        }
        setApiError(null);
      } catch { setApiError("Live data unavailable."); }
      finally { setIsLoading(false); }
    };
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [selectedDistrictId]);

  const temp  = weather?.temperature   ?? 0;
  const humid = weather?.humidity      ?? 0;
  const wind  = weather?.wind_speed    ?? 0;
  const rain  = weather?.rainfall_24h  ?? 0;
  const tΔ    = weather?.temperature_delta  ?? 0;
  const hΔ    = weather?.humidity_delta     ?? 0;
  const wΔ    = weather?.wind_speed_delta   ?? 0;
  const rΔ    = weather?.rainfall_24h_delta ?? 0;

  /* theme */
  const bg   = isDarkMode ? "#0f172a"              : "#f0f5fb";
  const card = isDarkMode ? "#1e293b"              : "#ffffff";
  const bdr  = isDarkMode ? "rgba(71,85,105,0.45)" : "#e2e8f0";
  const hd   = isDarkMode ? "#f1f5f9"              : "#0f172a";
  const bd   = isDarkMode ? "#cbd5e1"              : "#475569";
  const mt   = isDarkMode ? "#94a3b8"              : "#64748b";

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: bg }}>
      <div className="text-center">
        <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}/>
        <p className="text-sm" style={{ color: mt }}>Loading Dashboard…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 py-6 space-y-6">

        {apiError && (
          <div className="text-xs px-3 py-2 rounded-lg border-l-4 border-yellow-500 bg-yellow-500/10"
            style={{ color: isDarkMode ? "#fcd34d" : "#92400e" }}>{apiError}</div>
        )}

        {/* ── HEADER ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black" style={{ color: hd }}>Dashboard Overview</h1>
            <p className="text-xs mt-0.5" style={{ color: mt }}>Uganda Multi Hazard Observatory System</p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <MapPin className="w-3 h-3" style={{ color: FAO_BLUE }}/>
              <span className="text-xs font-medium" style={{ color: bd }}>Kampala, Central Region</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: `${FAO_BLUE}18`, color: FAO_BLUE }}>Live</span>
            </div>
          </div>
          {quickStats.lastUpdated && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: mt }}>
              <Clock className="w-3.5 h-3.5"/>
              <span>Updated {quickStats.lastUpdated}</span>
              <span className="flex items-center gap-1 text-green-500 font-semibold ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/>
                Live
              </span>
            </div>
          )}
        </div>

        {/* ── WEATHER STATS ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { label: "Temperature", Icon: Thermometer, color: "#f97316", val: temp,  Δ: tΔ, unit: "°C",    valStr: `${temp}°C`,    spark: (tΔ>=0?"up":"down") as keyof typeof PATHS, min:15, max:40,
              segs: [{label:"Cool",color:"#93c5fd",end:20},{label:"Normal",color:"#86efac",end:28},{label:"Warm",color:"#fdba74",end:35},{label:"Hot",color:"#f87171",end:40}] },
            { label: "Rainfall",    Icon: CloudRain,   color: "#0284c7", val: rain,  Δ: rΔ, unit: " mm",   valStr: `${rain} mm`,   spark: "flat" as keyof typeof PATHS,              min:0,  max:100,
              segs: [{label:"Dry",color:"#bfdbfe",end:5},{label:"Light",color:"#7dd3fc",end:25},{label:"Moderate",color:"#0284c7",end:50},{label:"Heavy",color:"#1e3a8a",end:100}] },
            { label: "Humidity",    Icon: Droplets,    color: FAO_BLUE,  val: humid, Δ: hΔ, unit: "%",     valStr: `${humid}%`,    spark: (hΔ>=0?"up":"down") as keyof typeof PATHS, min:0,  max:100,
              segs: [{label:"Dry",color:"#fca5a5",end:30},{label:"Low",color:"#fde68a",end:50},{label:"Normal",color:"#86efac",end:70},{label:"High",color:"#f87171",end:100}] },
            { label: "Wind Speed",  Icon: Wind,        color: "#64748b", val: wind,  Δ: wΔ, unit: " km/h", valStr: `${wind} km/h`, spark: "volatile" as keyof typeof PATHS,          min:0,  max:60,
              segs: [{label:"Calm",color:"#86efac",end:10},{label:"Breezy",color:"#93c5fd",end:25},{label:"Windy",color:"#fdba74",end:40},{label:"Strong",color:"#f87171",end:60}] },
          ].map((m) => {
            const Icon = m.Icon;
            const up = m.Δ > 0;
            const DeltaIcon = m.Δ > 0 ? TrendingUp : m.Δ < 0 ? TrendingDown : Minus;
            const dCol = m.Δ > 0 ? "#22c55e" : m.Δ < 0 ? "#ef4444" : mt;
            return (
              <div key={m.label} className="rounded-xl p-4 border" style={{ background: card, borderColor: bdr }}>
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: `${m.color}15` }}>
                      <Icon className="w-4 h-4" style={{ color: m.color }}/>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: bd }}>{m.label}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-medium mb-0.5" style={{ color: mt }}>7-Day Trend</span>
                    <Sparkline type={m.spark} color={m.color}/>
                  </div>
                </div>
                <p className="text-2xl font-black leading-none mb-1" style={{ color: hd }}>{m.valStr}</p>
                <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: dCol }}>
                  <DeltaIcon className="w-3 h-3"/>
                  <span>{up?"+":""}{m.Δ}{m.unit} (24h)</span>
                </div>
                <ThresholdBar value={m.val} min={m.min} max={m.max} segments={m.segs} isDarkMode={isDarkMode}/>
              </div>
            );
          })}
        </div>

        {/* ── MONITORING SYSTEMS HEADER ─────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: FAO_BLUE }}>Monitoring Systems</p>
            <h2 className="text-lg font-black mt-0.5" style={{ color: hd }}>Select a module to explore</h2>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: mt }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/>
            Live Data
          </div>
        </div>

        {/* ── MODULE CARDS ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {modules.map((mod) => {
            const Art = mod.Art;
            return (
              <button
                key={mod.id}
                onClick={() => onNavigate(mod.id as PageType)}
                className="group relative rounded-2xl overflow-hidden border text-left focus:outline-none"
                style={{
                  background: card,
                  borderColor: bdr,
                  minHeight: "240px",
                  transition: "box-shadow 0.25s ease, border-color 0.25s ease, transform 0.25s ease",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 36px ${mod.color}22`;
                  (e.currentTarget as HTMLElement).style.borderColor = `${mod.color}55`;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLElement).style.borderColor = bdr;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                {/* LEFT — content */}
                <div className="absolute inset-y-0 left-0 flex flex-col justify-between p-5 z-10"
                  style={{
                    width: "58%",
                    background: card,
                    boxShadow: isDarkMode ? "8px 0 24px rgba(0,0,0,0.55)" : "8px 0 24px rgba(0,0,0,0.18)",
                  }}>
                  {/* Top: tag + title + desc */}
                  <div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3"
                      style={{ background: `${mod.color}18`, color: mod.color, border: `1px solid ${mod.color}30` }}>
                      {mod.tag}
                    </span>
                    <h3 className="text-base font-black leading-tight mb-1.5" style={{ color: hd }}>{mod.title}</h3>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: mt }}>{mod.desc}</p>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 py-3"
                    style={{ borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                    {mod.stats.map((s) => (
                      <div key={s.label} className="flex flex-col gap-0.5">
                        <span className="text-sm font-black leading-none" style={{ color: hd }}>{s.value}</span>
                        <span className="text-[9px] font-medium leading-none" style={{ color: mt }}>{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Bottom CTA */}
                  <div className="flex items-center gap-1.5 text-xs font-bold group-hover:gap-2.5 transition-all duration-200"
                    style={{ color: mod.color }}>
                    <span>View Details</span>
                    <ArrowRight className="w-3.5 h-3.5"/>
                  </div>
                </div>

                {/* RIGHT — art with slant separator */}
                <div className="absolute inset-y-0 right-0 overflow-hidden"
                  style={{
                    width: "48%",
                    background: mod.gradient,
                    clipPath: "polygon(18% 0%, 100% 0%, 100% 100%, 0% 100%)",
                  }}>
                  <div className="absolute inset-0 opacity-30"
                    style={{ background: "radial-gradient(ellipse at 70% 40%, rgba(255,255,255,0.25), transparent 70%)" }}/>
                  <div className="w-full h-full">
                    <Art/>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 z-20 pointer-events-none"
                  style={{ width: "58%", height: "40px", background: `linear-gradient(transparent, ${card})` }}/>
              </button>
            );
          })}
        </div>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <footer className="pt-4" style={{ borderTop: `1px solid ${bdr}` }}>
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs gap-1" style={{ color: mt }}>
            <p>© 2025 FAO Uganda · Uganda Multi Hazard Observatory System</p>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
              All Systems Operational
            </span>
          </div>
        </footer>

      </div>

      <style>{`
        .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      `}</style>
    </div>
  );
}
