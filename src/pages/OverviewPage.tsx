import {
  Thermometer, Droplets, Wind, CloudRain,
  ArrowRight, MapPin, TrendingUp, TrendingDown, Minus, Clock,
  Cloud, Sun, Radio, Calendar, RefreshCw, BarChart2, Leaf,
  Activity, AlertCircle, Signal, Timer,
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

type StatIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type ModuleStat = { label: string; value: string; Icon?: StatIcon };

/* ── Module definitions ─────────────────────────────────────────── */
const MODULES: {
  id: string; title: string; color: string; desc: string; ctaLabel: string;
  Icon: StatIcon;
  stats: ModuleStat[];
}[] = [
  {
    id: "weather", title: "Weather Forecast", color: FAO_BLUE,
    desc: "24-hour nowcasting & 7-day forecasts with high accuracy predictions.",
    Icon: Cloud, ctaLabel: "Open Forecast Center",
    stats: [
      { label: "Horizon",        value: "7 Days",  Icon: Calendar },
      { label: "Update",         value: "6 Hours", Icon: RefreshCw },
      { label: "Rainfall Today", value: "--",      Icon: CloudRain },
      { label: "Next Update",    value: "--",      Icon: Clock },
    ],
  },
  {
    id: "drought", title: "Drought Monitor", color: "#f97316",
    desc: "Combined Drought Index with TDI, PDI, VDI components for risk assessment.",
    Icon: Sun, ctaLabel: "Open Drought Center",
    stats: [
      { label: "Districts at Risk", value: "--",    Icon: MapPin },
      { label: "Drought Index",     value: "SPI",   Icon: BarChart2 },
      { label: "Vegetation Status", value: "Stable", Icon: Leaf },
      { label: "Last Analysis",     value: "--",    Icon: Clock },
    ],
  },
  {
    id: "flood", title: "Flood Monitor", color: "#06b6d4",
    desc: "Real-time river discharge monitoring and early warning systems.",
    Icon: Droplets, ctaLabel: "Open Flood Center",
    stats: [
      { label: "Rivers Monitored", value: "9",  Icon: Activity },
      { label: "Alert Areas",      value: "--", Icon: AlertCircle },
      { label: "River Status",     value: "--", Icon: Signal },
      { label: "Last Update",      value: "--", Icon: Clock },
    ],
  },
  {
    id: "stations", title: "Weather Stations", color: "#22c55e",
    desc: "Automatic Weather Station network monitoring across Uganda.",
    Icon: Radio, ctaLabel: "Open Station Network",
    stats: [
      { label: "Stations Online",   value: "--",    Icon: Signal },
      { label: "Data Frequency",    value: "15 min", Icon: Timer },
      { label: "Missing Reports",   value: "0",     Icon: AlertCircle },
      { label: "Last Transmission", value: "--",    Icon: Clock },
    ],
  },
];

/* ── Page ────────────────────────────────────────────────────────── */
export default function OverviewPage({ onNavigate, isDarkMode = true }: OverviewPageProps) {
  const { selectedDistrictId } = useAppStore((s) => s);

  const [isLoading,  setIsLoading]  = useState(true);
  const [weather,    setWeather]    = useState<any>(null);
  const [quickStats, setQuickStats] = useState({ lastUpdated: "", alerts: 0, online: 0, total: 0 });
  const [modules,    setModules]    = useState(MODULES);
  const [apiError,   setApiError]   = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [ms, qs, wd] = await Promise.all([
          overviewAPI.getModuleStats() as Promise<any>,
          overviewAPI.getQuickStats()  as Promise<any>,
          weatherAPI.getDashboard()    as Promise<any>,
        ]);
        setQuickStats({
          lastUpdated: qs?.last_updated ? formatTimeAgo(qs.last_updated) : "",
          alerts: qs?.active_alerts ?? 0,
          online: qs?.stations_online ?? 0,
          total:  qs?.stations_total  ?? 0,
        });
        if (wd) setWeather(wd);
        if (ms) {
          const valueUpdates: string[][] = [
            [
              "7 Days",
              "6 Hours",
              wd?.rainfall_24h != null ? `${wd.rainfall_24h} mm` : "--",
              "--",
            ],
            [
              ms.drought_monitor?.districts_at_risk != null ? String(ms.drought_monitor.districts_at_risk) : "--",
              "SPI",
              "Stable",
              "--",
            ],
            [
              "9",
              ms.flood_monitor?.alert_areas != null ? String(ms.flood_monitor.alert_areas) : "--",
              (qs?.active_alerts ?? 0) > 0 ? "Watch" : "Normal",
              "--",
            ],
            [
              ms.weather_stations?.online != null ? `${ms.weather_stations.online}/${ms.weather_stations.total}` : "--",
              "15 min",
              "0",
              qs?.last_updated ? formatTimeAgo(qs.last_updated) : "--",
            ],
          ];
          setModules(prev => prev.map((m, i) => ({
            ...m,
            stats: m.stats.map((s, j) => ({ ...s, value: valueUpdates[i][j] ?? s.value })),
          })));
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
    <div className="min-h-screen relative overflow-hidden" style={{ background: bg }}>
      {/* Background Climate Illustration Watermark */}
      <img
        src="/climate_illustration.jpg"
        alt="Climate Illustration"
        className="fixed bottom-[-5%] right-[-5%] w-[600px] h-[600px] pointer-events-none z-0 object-contain transition-opacity duration-1000"
        style={{
          opacity: 0.15,
          mixBlendMode: isDarkMode ? "screen" : "multiply",
          filter: isDarkMode ? "invert(1) hue-rotate(180deg)" : "none",
        }}
      />

      <div className="relative z-10 px-4 md:px-6 xl:px-10 2xl:px-16 py-6 space-y-6">

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
          {modules.map((mod) => {
            const ModIcon = mod.Icon;
            return (
              <button
                key={mod.id}
                onClick={() => onNavigate(mod.id as PageType)}
                className="group rounded-2xl border text-left focus:outline-none p-5 flex flex-col"
                style={{
                  background: card,
                  borderColor: bdr,
                  transition: "box-shadow 0.25s ease, border-color 0.25s ease, transform 0.25s ease",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px ${mod.color}22`;
                  (e.currentTarget as HTMLElement).style.borderColor = `${mod.color}50`;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                  (e.currentTarget as HTMLElement).style.borderColor = bdr;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                }}
              >
                {/* Header: module icon + title + description */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${mod.color}15` }}>
                    <ModIcon className="w-5 h-5" style={{ color: mod.color }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold leading-tight" style={{ color: hd }}>{mod.title}</h3>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: mt }}>{mod.desc}</p>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ borderTop: `1px solid ${isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`, marginBottom: "16px" }}/>

                {/* Stats: 4 items */}
                <div className="grid grid-cols-4 gap-2 mb-5">
                  {mod.stats.map((s) => {
                    const StatIcon = s.Icon;
                    return (
                      <div key={s.label} className="flex flex-col gap-1.5">
                        {StatIcon && (
                          <div className="w-6 h-6 rounded-md flex items-center justify-center"
                            style={{ background: `${mod.color}12` }}>
                            <StatIcon className="w-3.5 h-3.5" style={{ color: mod.color }}/>
                          </div>
                        )}
                        <span className="text-[9px] font-medium leading-tight" style={{ color: mt }}>{s.label}</span>
                        <span className="text-sm font-bold leading-tight" style={{ color: hd }}>{s.value}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Footer CTA */}
                <div className="flex items-center gap-1.5 text-xs font-semibold mt-auto group-hover:gap-2.5 transition-all duration-200"
                  style={{ color: mod.color }}>
                  <span>{mod.ctaLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5"/>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <footer className="mt-12 pt-6" style={{ borderTop: `1px solid ${bdr}` }}>
          <div className="flex flex-col sm:flex-row items-center justify-between text-xs gap-1" style={{ color: mt }}>
            <p>© 2026 FAO Uganda · Uganda Multi Hazard Observatory System</p>
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
