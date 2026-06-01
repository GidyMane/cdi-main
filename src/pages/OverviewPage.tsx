import {
  Radio, Thermometer, Droplets, Wind, CloudRain, Sun, Waves,
  ArrowRight, MapPin, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle,
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
  <svg viewBox="0 0 300 180" fill="none" className="w-full h-full">
    <circle cx="230" cy="60"  r="90"  fill="#1d4ed8" fillOpacity="0.35"/>
    <circle cx="230" cy="60"  r="60"  fill="#2563eb" fillOpacity="0.30"/>
    <circle cx="230" cy="60"  r="35"  fill="#3b82f6" fillOpacity="0.45"/>
    <circle cx="230" cy="60"  r="18"  fill="#60a5fa" fillOpacity="0.70"/>
    <circle cx="230" cy="60"  r="100" stroke="#93c5fd" strokeOpacity="0.10" strokeWidth="1" strokeDasharray="4 8"/>
    <circle cx="230" cy="60"  r="120" stroke="#93c5fd" strokeOpacity="0.07" strokeWidth="1" strokeDasharray="4 8"/>
    <line x1="230" y1="60" x2="295" y2="5" stroke="#93c5fd" strokeOpacity="0.25" strokeWidth="1.5"/>
    <ellipse cx="95"  cy="110" rx="62" ry="27" fill="white" fillOpacity="0.13"/>
    <ellipse cx="128" cy="95"  rx="42" ry="24" fill="white" fillOpacity="0.13"/>
    <ellipse cx="65"  cy="116" rx="32" ry="18" fill="white" fillOpacity="0.09"/>
    {[64,80,96,112,128,74,106].map((x,i)=>(
      <line key={i} x1={x} y1={137+(i%3)*6} x2={x-5} y2={152+(i%3)*6}
        stroke="#93c5fd" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round"/>
    ))}
    {[0,1,2,3,4].map(i=><line key={i} x1="0" y1={i*45} x2="300" y2={i*45} stroke="#3b82f6" strokeOpacity="0.05" strokeWidth="1"/>)}
    {[0,1,2,3,4,5].map(i=><line key={i} x1={i*60} y1="0" x2={i*60} y2="180" stroke="#3b82f6" strokeOpacity="0.05" strokeWidth="1"/>)}
  </svg>
);

const DroughtArtCard = () => (
  <svg viewBox="0 0 300 180" fill="none" className="w-full h-full">
    <circle cx="150" cy="72" r="100" fill="#92400e" fillOpacity="0.22"/>
    <circle cx="150" cy="72" r="68"  fill="#b45309" fillOpacity="0.28"/>
    <circle cx="150" cy="72" r="44"  fill="#d97706" fillOpacity="0.42"/>
    <circle cx="150" cy="72" r="26"  fill="#f59e0b" fillOpacity="0.68"/>
    <circle cx="150" cy="72" r="14"  fill="#fbbf24" fillOpacity="0.92"/>
    {Array.from({length:12},(_,i)=>{const a=(i*30*Math.PI)/180,r1=48,r2=64;return(
      <line key={i} x1={150+r1*Math.cos(a)} y1={72+r1*Math.sin(a)} x2={150+r2*Math.cos(a)} y2={72+r2*Math.sin(a)}
        stroke="#fcd34d" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round"/>
    );})}
    {[0,1,2].map(y=>(
      <path key={y} d={`M0 ${118+y*14} Q75 ${111+y*14} 150 ${118+y*14} Q225 ${125+y*14} 300 ${118+y*14}`}
        stroke="#f97316" strokeOpacity={0.18-y*0.04} strokeWidth="1.5" fill="none"/>
    ))}
    <path d="M 20 158 L 80 145 L 130 156 L 180 146 L 230 158 L 280 147" stroke="#92400e" strokeOpacity="0.28" strokeWidth="1" fill="none"/>
    {[[80,145],[180,146],[280,147]].map(([x,y],i)=>(
      <line key={i} x1={x} y1={y} x2={x+10} y2={y+18} stroke="#92400e" strokeOpacity="0.18" strokeWidth="1"/>
    ))}
  </svg>
);

const FloodArtCard = () => (
  <svg viewBox="0 0 300 180" fill="none" className="w-full h-full">
    <ellipse cx="150" cy="128" rx="200" ry="70" fill="#0e7490" fillOpacity="0.28"/>
    {[0,1,2,3].map(i=>(
      <path key={i}
        d={`M${-10+i*4} ${95-i*9} C${70+i*3} ${82-i*9} ${130+i*2} ${106-i*9} ${190} ${92-i*9} C${240-i*2} ${78-i*9} ${275-i*3} ${100-i*9} ${310} ${90-i*9}`}
        stroke="#22d3ee" strokeOpacity={0.35-i*0.06} strokeWidth={2.5-i*0.4} fill="none"/>
    ))}
    <path d="M-10 100 C70 86 130 110 190 96 C245 82 278 106 310 96 L310 180 L-10 180 Z"
      fill="#0891b2" fillOpacity="0.22"/>
    <path d="M-10 112 C80 98 150 122 210 108 C265 94 295 114 310 106 L310 180 L-10 180 Z"
      fill="#0e7490" fillOpacity="0.28"/>
    {[30,65,105,148,192,235,268,50,130,210].map((x,i)=>(
      <ellipse key={i} cx={x} cy={22+(i%4)*18} rx="1.8" ry="5" fill="#67e8f9" fillOpacity="0.42"/>
    ))}
    {[[80,108],[185,116],[270,104]].map(([cx,cy],i)=>(
      <circle key={i} cx={cx} cy={cy} r={8+i*5} stroke="#22d3ee" strokeOpacity="0.18" strokeWidth="1" fill="none"/>
    ))}
  </svg>
);

const StationsArtCard = () => (
  <svg viewBox="0 0 300 180" fill="none" className="w-full h-full">
    {[[55,38],[155,28],[255,52],[115,105],[215,90],[78,130],[272,120]].flatMap(([x1,y1],i,arr)=>{
      if(i>=arr.length-1) return [];
      const [x2,y2]=arr[(i+2)%arr.length];
      return [<line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#4ade80" strokeOpacity="0.16" strokeWidth="1" strokeDasharray="3 5"/>];
    })}
    <line x1="55"  y1="38"  x2="155" y2="28"  stroke="#4ade80" strokeOpacity="0.28" strokeWidth="1"/>
    <line x1="155" y1="28"  x2="255" y2="52"  stroke="#4ade80" strokeOpacity="0.28" strokeWidth="1"/>
    <line x1="155" y1="28"  x2="115" y2="105" stroke="#4ade80" strokeOpacity="0.25" strokeWidth="1"/>
    <line x1="115" y1="105" x2="215" y2="90"  stroke="#4ade80" strokeOpacity="0.22" strokeWidth="1"/>
    <line x1="255" y1="52"  x2="215" y2="90"  stroke="#4ade80" strokeOpacity="0.22" strokeWidth="1"/>
    <line x1="78"  y1="130" x2="115" y2="105" stroke="#4ade80" strokeOpacity="0.20" strokeWidth="1"/>
    <line x1="272" y1="120" x2="215" y2="90"  stroke="#4ade80" strokeOpacity="0.20" strokeWidth="1"/>
    <circle cx="155" cy="28" r="24" stroke="#22c55e" strokeOpacity="0.20" strokeWidth="1" strokeDasharray="3 5"/>
    <circle cx="155" cy="28" r="42" stroke="#22c55e" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="3 7"/>
    <circle cx="155" cy="28" r="60" stroke="#22c55e" strokeOpacity="0.07" strokeWidth="1"/>
    {[[55,38,"#4ade80"],[155,28,"#22c55e"],[255,52,"#4ade80"],[115,105,"#86efac"],[215,90,"#86efac"],[78,130,"#4ade80"],[272,120,"#86efac"]].map(([cx,cy,col],i)=>(
      <g key={i}>
        <circle cx={cx as number} cy={cy as number} r="9"  fill={col as string} fillOpacity="0.18"/>
        <circle cx={cx as number} cy={cy as number} r="4.5" fill={col as string} fillOpacity="0.75"/>
      </g>
    ))}
  </svg>
);

/* ── Module definitions ─────────────────────────────────────────── */
const MODULES = [
  {
    id: "weather", title: "Weather Forecast", color: FAO_BLUE,
    tag: "7-Day Forecast",
    desc: "High-resolution precipitation, temperature and wind predictions across all Uganda districts using ICON & GFS models.",
    gradient: "linear-gradient(150deg, #1d4ed8 0%, #1e3a8a 100%)",
    Art: WeatherArtCard,
  },
  {
    id: "drought", title: "Drought Monitor", color: "#f97316",
    tag: "Risk Assessment",
    desc: "Composite drought risk index combining temperature, precipitation deficit and vegetation stress signals per district.",
    gradient: "linear-gradient(150deg, #c2410c 0%, #7c2d12 100%)",
    Art: DroughtArtCard,
  },
  {
    id: "flood", title: "Flood Monitor", color: "#06b6d4",
    tag: "Early Warning",
    desc: "Real-time basin-level river discharge tracking for the Nile, Kagera and Victoria basins with automated thresholds.",
    gradient: "linear-gradient(150deg, #0891b2 0%, #155e75 100%)",
    Art: FloodArtCard,
  },
  {
    id: "stations", title: "Weather Stations", color: "#22c55e",
    tag: "AWS Network",
    desc: "Live sensor network spanning Uganda — temperature, humidity, wind and rainfall at 15-minute reporting intervals.",
    gradient: "linear-gradient(150deg, #16a34a 0%, #14532d 100%)",
    Art: StationsArtCard,
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
          setModules(prev => prev.map((m, i) => ({ ...m, tag: tags[i] })));
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
  const bg   = isDarkMode ? "#0f172a"         : "#f0f5fb";
  const card = isDarkMode ? "#1e293b"         : "#ffffff";
  const bdr  = isDarkMode ? "rgba(71,85,105,0.45)" : "#e2e8f0";
  const hd   = isDarkMode ? "#f1f5f9"         : "#0f172a";
  const bd   = isDarkMode ? "#cbd5e1"         : "#475569";
  const mt   = isDarkMode ? "#94a3b8"         : "#64748b";

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
            { label: "Temperature",      Icon: Thermometer, color: "#f97316", val: temp,  Δ: tΔ,  unit: "°C",    valStr: `${temp}°C`,    spark: (tΔ>=0?"up":"down") as keyof typeof PATHS, min:15, max:40,
              segs: [{label:"Cool",color:"#93c5fd",end:20},{label:"Normal",color:"#86efac",end:28},{label:"Warm",color:"#fdba74",end:35},{label:"Hot",color:"#f87171",end:40}] },
            { label: "Rainfall",         Icon: CloudRain,   color: "#0284c7", val: rain,  Δ: rΔ,  unit: " mm",   valStr: `${rain} mm`,   spark: "flat" as keyof typeof PATHS,              min:0,  max:100,
              segs: [{label:"Dry",color:"#bfdbfe",end:5},{label:"Light",color:"#7dd3fc",end:25},{label:"Moderate",color:"#0284c7",end:50},{label:"Heavy",color:"#1e3a8a",end:100}] },
            { label: "Humidity",         Icon: Droplets,    color: FAO_BLUE,  val: humid, Δ: hΔ,  unit: "%",     valStr: `${humid}%`,    spark: (hΔ>=0?"up":"down") as keyof typeof PATHS, min:0,  max:100,
              segs: [{label:"Dry",color:"#fca5a5",end:30},{label:"Low",color:"#fde68a",end:50},{label:"Normal",color:"#86efac",end:70},{label:"High",color:"#f87171",end:100}] },
            { label: "Wind Speed",       Icon: Wind,        color: "#64748b", val: wind,  Δ: wΔ,  unit: " km/h", valStr: `${wind} km/h`, spark: "volatile" as keyof typeof PATHS,          min:0,  max:60,
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

        {/* ── HAZARD STATUS ─────────────────────────────────────── */}
        {(() => {
          const droughtRaw   = moduleStats?.drought_monitor?.districts_at_risk as number | undefined;
          const floodRaw     = moduleStats?.flood_monitor?.alert_areas          as number | undefined;
          const droughtCount = droughtRaw ?? 0;
          const floodCount   = floodRaw   ?? 0;
          const alertCount   = quickStats.alerts;
          const onlinePct    = quickStats.total > 0
            ? Math.round((quickStats.online / quickStats.total) * 100) : null;

          type StatusChip = { label: string; color: string };
          const droughtChip: StatusChip =
            droughtRaw == null           ? { label: "LOADING",   color: mt       } :
            droughtCount > 15            ? { label: "CRITICAL",  color: "#ef4444"} :
            droughtCount > 5             ? { label: "WARNING",   color: "#f97316"} :
            droughtCount > 0             ? { label: "ELEVATED",  color: "#f59e0b"} :
                                           { label: "NORMAL",    color: "#22c55e"};
          const floodChip: StatusChip =
            floodRaw == null             ? { label: "LOADING",   color: mt       } :
            floodCount > 3               ? { label: "CRITICAL",  color: "#ef4444"} :
            floodCount > 1               ? { label: "WARNING",   color: "#0891b2"} :
            floodCount > 0               ? { label: "ELEVATED",  color: "#06b6d4"} :
                                           { label: "NORMAL",    color: "#22c55e"};
          const alertChip: StatusChip =
            alertCount > 5               ? { label: "CRITICAL",  color: "#ef4444"} :
            alertCount > 0               ? { label: "ACTIVE",    color: "#f97316"} :
                                           { label: "ALL CLEAR", color: "#22c55e"};
          const netChip: StatusChip =
            onlinePct === null           ? { label: "LOADING",   color: mt       } :
            onlinePct < 60               ? { label: "DEGRADED",  color: "#ef4444"} :
            onlinePct < 80               ? { label: "REDUCED",   color: "#f59e0b"} :
                                           { label: "HEALTHY",   color: "#22c55e"};

          const cards: {
            label: string; value: string; unit: string; sub: string;
            color: string; Icon: React.FC<any>;
            chip: StatusChip; fillPct: number; fillNote: string; urgent: boolean;
          }[] = [
            {
              label: "Drought Risk Districts",
              value: droughtRaw != null ? `${droughtCount}` : "--",
              unit: "districts",
              sub: droughtCount > 0
                ? "Districts showing active drought stress"
                : "No drought anomaly detected",
              color: "#f97316", Icon: Sun, chip: droughtChip,
              fillPct: (droughtCount / 135) * 100,
              fillNote: "of 135 Uganda districts",
              urgent: droughtCount > 0,
            },
            {
              label: "Flood Alert Zones",
              value: floodRaw != null ? `${floodCount}` : "--",
              unit: "basins",
              sub: floodCount > 0
                ? "River basins above discharge threshold"
                : "All basins within safe levels",
              color: "#0891b2", Icon: Waves, chip: floodChip,
              fillPct: Math.min((floodCount / 9) * 100, 100),
              fillNote: "of 9 major river basins",
              urgent: floodCount > 0,
            },
            {
              label: "Active Hazard Alerts",
              value: `${alertCount}`,
              unit: alertCount === 1 ? "alert" : "alerts",
              sub: alertCount > 0
                ? "Requiring immediate field attention"
                : "No active alerts across modules",
              color: alertCount > 0 ? "#ef4444" : "#22c55e",
              Icon: AlertTriangle, chip: alertChip,
              fillPct: Math.min((alertCount / 10) * 100, 100),
              fillNote: "relative severity index",
              urgent: alertCount > 0,
            },
            {
              label: "Station Network",
              value: onlinePct !== null ? `${onlinePct}%` : "--",
              unit: quickStats.total > 0
                ? `${quickStats.online} / ${quickStats.total} online` : "",
              sub: quickStats.total > 0
                ? onlinePct !== null && onlinePct >= 80
                  ? "AWS sensors reporting normally"
                  : `${quickStats.total - quickStats.online} units offline`
                : "Fetching station data…",
              color: netChip.color, Icon: Radio, chip: netChip,
              fillPct: onlinePct ?? 0,
              fillNote: "network uptime",
              urgent: onlinePct !== null && onlinePct < 80,
            },
          ];

          return (
            <div>
              {/* section header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: `${FAO_BLUE}15` }}>
                    <AlertTriangle className="w-4 h-4" style={{ color: FAO_BLUE }}/>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold leading-none" style={{ color: hd }}>
                      Hazard Status
                    </h3>
                    <p className="text-[10px] mt-0.5" style={{ color: mt }}>
                      Live cross-module indicators
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-medium"
                  style={{ color: mt }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block"/>
                  Real-time
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {cards.map(({ label, value, unit, sub, color, Icon, chip, fillPct, fillNote, urgent }) => (
                  <div key={label} className="rounded-2xl border p-5 relative overflow-hidden"
                    style={{
                      background: urgent
                        ? `linear-gradient(135deg, ${color}10 0%, ${card} 55%)`
                        : card,
                      borderColor: urgent ? `${color}35` : bdr,
                      boxShadow: urgent ? `0 4px 24px ${color}15` : "none",
                    }}>

                    {/* icon badge + status chip */}
                    <div className="flex items-start justify-between mb-5">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: `${color}18`, border: `1px solid ${color}22` }}>
                        <Icon className="w-5 h-5" style={{ color }}/>
                      </div>
                      <span className="text-[9px] font-bold px-2.5 py-1 rounded-full tracking-widest uppercase"
                        style={{
                          background: `${chip.color}15`,
                          color: chip.color,
                          border: `1px solid ${chip.color}28`,
                        }}>
                        {chip.label}
                      </span>
                    </div>

                    {/* hero number */}
                    <p className="text-5xl font-black leading-none tracking-tight mb-1"
                      style={{ color: urgent ? color : hd }}>
                      {value}
                    </p>

                    {/* label row */}
                    <div className="flex items-center justify-between mt-1 mb-1">
                      <span className="text-xs font-semibold" style={{ color: bd }}>{label}</span>
                      {unit && value !== "--" && (
                        <span className="text-[10px]" style={{ color: mt }}>{unit}</span>
                      )}
                    </div>

                    {/* sub text */}
                    <p className="text-[11px] leading-relaxed mb-5" style={{ color: mt }}>{sub}</p>

                    {/* severity fill bar */}
                    <div>
                      <div className="h-[3px] rounded-full overflow-hidden"
                        style={{ background: isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(fillPct, 100)}%`,
                            background: `linear-gradient(90deg, ${color}55, ${color})`,
                            transition: "width 0.9s cubic-bezier(.4,0,.2,1)",
                          }}/>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[9px]" style={{ color: mt }}>{fillNote}</span>
                        <span className="text-[9px] font-bold" style={{ color }}>
                          {Math.min(fillPct, 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── SECTION SPACER ────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="flex items-center gap-3 w-full max-w-lg">
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${FAO_BLUE}35)` }}/>
            <div className="flex items-center gap-1.5">
              {[0,1,2].map(i=>(
                <span key={i} className="rounded-full"
                  style={{ width: i===1?"8px":"5px", height: i===1?"8px":"5px", background: i===1?FAO_BLUE:`${FAO_BLUE}55` }}/>
              ))}
            </div>
            <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${FAO_BLUE}35, transparent)` }}/>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-bold tracking-widest uppercase" style={{ color: FAO_BLUE }}>Monitoring Systems</p>
            <h2 className="text-lg font-black mt-0.5" style={{ color: hd }}>Select a module to explore</h2>
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
                  minHeight: "168px",
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
                  style={{ width: "58%", background: card }}>
                  {/* Top */}
                  <div>
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-3"
                      style={{ background: `${mod.color}18`, color: mod.color, border: `1px solid ${mod.color}30` }}>
                      {mod.tag}
                    </span>
                    <h3 className="text-base font-black leading-tight mb-1.5" style={{ color: hd }}>{mod.title}</h3>
                    <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: mt }}>{mod.desc}</p>
                  </div>
                  {/* Bottom CTA */}
                  <div className="flex items-center gap-1.5 text-xs font-bold group-hover:gap-2.5 transition-all duration-200"
                    style={{ color: mod.color }}>
                    <span>Explore Module</span>
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
                  {/* Subtle inner glow */}
                  <div className="absolute inset-0 opacity-30"
                    style={{ background: "radial-gradient(ellipse at 70% 40%, rgba(255,255,255,0.25), transparent 70%)" }}/>
                  <div className="w-full h-full">
                    <Art/>
                  </div>
                </div>

                {/* Bottom fade on card background for the content area */}
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
