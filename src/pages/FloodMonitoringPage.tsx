import { useState, useEffect } from "react";
import {
  Waves, MapPin, Download, TrendingUp, AlertTriangle,
  Droplets, ChevronUp, ChevronDown, Minus, Users,
  Filter, X, Clock, RefreshCw, Activity, ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import FloodMonitorMap from "../components/map/FloodMonitorMap";
import { useFloodData } from "../hooks/useFloodData";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";

interface FloodMonitoringPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

// ── Fallback river basin data ─────────────────────────────────────────────────
const fallbackRiverBasins = [
  { name: "Nile Basin",    level: 4.2, trend: "up"     as const, population: 620000, rainfall: 85, discharge: 3200, status: "severe"   as const },
  { name: "Victoria Nile", level: 3.8, trend: "up"     as const, population: 620000, rainfall: 78, discharge: 2800, status: "severe"   as const },
  { name: "Albert Nile",   level: 2.9, trend: "stable" as const, population: 540000, rainfall: 65, discharge: 1900, status: "moderate" as const },
  { name: "Kafu River",    level: 2.4, trend: "up"     as const, population: 180000, rainfall: 72, discharge: 1200, status: "moderate" as const },
  { name: "Mpologoma",     level: 1.8, trend: "down"   as const, population: 95000,  rainfall: 45, discharge: 800,  status: "minor"    as const },
  { name: "Manafwa",       level: 1.5, trend: "stable" as const, population: 78000,  rainfall: 38, discharge: 650,  status: "minor"    as const },
  { name: "Malaba",        level: 0.9, trend: "stable" as const, population: 65000,  rainfall: 28, discharge: 420,  status: "normal"   as const },
  { name: "Okot",          level: 0.7, trend: "down"   as const, population: 32000,  rainfall: 22, discharge: 310,  status: "normal"   as const },
];

// ── Lead times & discharge data (mirrors FloodForecast + FloodImpactAnalysis) ─
const LEAD_TIMES = [24, 48, 72, 96, 120, 144, 168] as const;
type LeadTime = (typeof LEAD_TIMES)[number];

interface ImpactData {
  affected_population: number;
  max_discharge: number;
  avg_discharge: number;
  flood_extent_km2: number | null;
  affected_roads_km: number;
}

const IMPACT_BY_LEADTIME: Record<LeadTime, ImpactData> = {
  24:  { affected_population: 148200, max_discharge: 2800, avg_discharge: 2100, flood_extent_km2: 98.3,  affected_roads_km: 42.1 },
  48:  { affected_population: 192400, max_discharge: 3240, avg_discharge: 2450, flood_extent_km2: 118.1, affected_roads_km: 58.6 },
  72:  { affected_population: 248500, max_discharge: 3840, avg_discharge: 2680, flood_extent_km2: 142.7, affected_roads_km: 78.4 },
  96:  { affected_population: 298100, max_discharge: 4120, avg_discharge: 2890, flood_extent_km2: 168.4, affected_roads_km: 94.2 },
  120: { affected_population: 280400, max_discharge: 3980, avg_discharge: 2720, flood_extent_km2: 155.2, affected_roads_km: 89.1 },
  144: { affected_population: 254800, max_discharge: 3640, avg_discharge: 2490, flood_extent_km2: 138.4, affected_roads_km: 80.9 },
  168: { affected_population: 228600, max_discharge: 3280, avg_discharge: 2210, flood_extent_km2: 122.0, affected_roads_km: 71.2 },
};

// ── Active events (mirrors ActualFloodEvent model) ────────────────────────────
const ACTIVE_EVENTS = [
  { name: "Victoria Nile High Water", event_type: "reported", status: "ongoing",   start_date: "20 May 2026", end_date: null,          affected_areas: ["Masindi", "Buliisa", "Pakwach"], estimated_affected_population: 148200 },
  { name: "Albert Nile Warning",      event_type: "alert",    status: "forecast",  start_date: "25 May 2026", end_date: "30 May 2026", affected_areas: ["Nebbi", "Pakwach"],              estimated_affected_population: null   },
  { name: "Lake Victoria Overflow",   event_type: "reported", status: "completed", start_date: "10 May 2026", end_date: "18 May 2026", affected_areas: ["Jinja", "Mukono"],               estimated_affected_population: 82400  },
];

const EVENT_STATUS_STYLES: Record<string, { text: string; bg: string; color: string }> = {
  ongoing:   { text: "ONGOING",   bg: "bg-red-500/15",   color: "text-red-400"   },
  forecast:  { text: "FORECAST",  bg: "bg-amber-500/15", color: "text-amber-400" },
  completed: { text: "COMPLETED", bg: "bg-green-500/15", color: "text-green-400" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return String(n);
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "severe":   return "text-red-500";
    case "moderate": return "text-orange-500";
    case "minor":    return "text-yellow-500";
    default:         return "text-green-500";
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case "up":   return <ChevronUp   className="w-4 h-4 text-red-500"    />;
    case "down": return <ChevronDown className="w-4 h-4 text-green-500"  />;
    default:     return <Minus       className="w-4 h-4 text-yellow-500" />;
  }
};

// ── FilterContent (original left-sidebar) ────────────────────────────────────
const FilterContent = ({
  timeRange, setTimeRange,
  selectedBasin, setSelectedBasin,
  dateRange, setDateRange,
  isDarkMode, textMuted, textSecondary,
  borderColor, headerText, riverBasins,
}: {
  timeRange: string;
  setTimeRange: (val: string) => void;
  selectedBasin: string;
  setSelectedBasin: (val: string) => void;
  dateRange: string;
  setDateRange: (val: string) => void;
  isDarkMode: boolean;
  textMuted: string;
  textSecondary: string;
  borderColor: string;
  headerText: string;
  riverBasins: typeof fallbackRiverBasins;
}) => (
  <div className="space-y-3">
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Select Date</label>
      <input
        type="date"
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      />
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Time Range</label>
      <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
        <option value="Last 24 Hours">Last 24 Hours</option>
        <option value="Last 7 Days">Last 7 Days</option>
        <option value="Last 30 Days">Last 30 Days</option>
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>River Basin</label>
      <select value={selectedBasin} onChange={(e) => setSelectedBasin(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}>
        {riverBasins.map((b) => (
          <option key={b.name} value={b.name}>{b.name}</option>
        ))}
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Alert Level</label>
      <div className="space-y-1.5">
        {["All Levels", "Critical Only", "Warning Only", "Normal"].map((level) => (
          <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox"
              className={`rounded ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-slate-300"}`}
              defaultChecked={level === "All Levels"} />
            <span className={textSecondary}>{level}</span>
          </label>
        ))}
      </div>
    </div>
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>Quick Stats</h4>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Critical Basins</span>
          <span className="text-red-500 font-medium">2</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>At Risk Population</span>
          <span className="text-orange-500 font-medium">1.6M</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Avg Rainfall</span>
          <span className="font-medium" style={{ color: FAO_BLUE }}>54mm</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Active Alerts</span>
          <span className="text-red-500 font-medium">3</span>
        </div>
      </div>
    </div>
  </div>
);

// ── Discharge chart ───────────────────────────────────────────────────────────
function DischargeChart({ selectedLt, isDarkMode }: { selectedLt: number; isDarkMode: boolean }) {
  const data = LEAD_TIMES.map((lt) => ({
    lt,
    max: IMPACT_BY_LEADTIME[lt].max_discharge,
    avg: IMPACT_BY_LEADTIME[lt].avg_discharge,
  }));
  const allVals = [...data.map((d) => d.max), ...data.map((d) => d.avg)];
  const lo = Math.min(...allVals) - 300;
  const hi = Math.max(...allVals) + 200;
  const W = 280, H = 70;
  const toX = (i: number) => (i / (LEAD_TIMES.length - 1)) * W;
  const toY = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const maxLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.max).toFixed(1)}`).join(" ");
  const avgLine = data.map((d, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(d.avg).toFixed(1)}`).join(" ");
  const selIdx  = LEAD_TIMES.findIndex((lt) => lt === selectedLt);
  const selData = selIdx >= 0 ? data[selIdx] : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 70 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="dchMaxGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f, i) => (
          <line key={i} x1="0" y1={toY(lo + (hi - lo) * f)} x2={W} y2={toY(lo + (hi - lo) * f)}
            stroke={isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"} strokeWidth="1" />
        ))}
        <path d={`${maxLine} L${W},${H} L0,${H} Z`} fill="url(#dchMaxGrad)" />
        <path d={maxLine} fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={avgLine} fill="none" stroke={FAO_BLUE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
        {selData && selIdx >= 0 && (
          <>
            <line x1={toX(selIdx)} y1="0" x2={toX(selIdx)} y2={H}
              stroke={isDarkMode ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)"}
              strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={toX(selIdx)} cy={toY(selData.max)} r="3.5" fill="#ef4444" />
            <circle cx={toX(selIdx)} cy={toY(selData.avg)} r="3.5" fill={FAO_BLUE} />
          </>
        )}
      </svg>
      <div className="flex justify-between mt-1">
        {LEAD_TIMES.map((lt) => (
          <span key={lt} className="text-[9px] font-medium"
            style={{ color: lt === selectedLt ? FAO_BLUE : isDarkMode ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.28)" }}>
            {lt}h
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FloodMonitoringPage({ isDarkMode = true }: FloodMonitoringPageProps) {
  const [timeRange, setTimeRange]               = useState("Last 24 Hours");
  const [selectedBasin, setSelectedBasin]       = useState("Nile Basin");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [pageLoading, setPageLoading]           = useState(true);

  const { forecastStep, setForecastStep, setLayerMode, dateRange, setDateRange } = useAppStore((s) => s);
  const { basinStatus, basinTrend, loading: dataLoading, partialErrors = {}, refetch } = useFloodData();

  useEffect(() => { setLayerMode("forecast"); }, [setLayerMode]);

  useEffect(() => {
    if (!dateRange) setDateRange(new Date().toISOString().split("T")[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dataLoading) {
      const t = setTimeout(() => setPageLoading(false), 300);
      return () => clearTimeout(t);
    }
  }, [dataLoading]);

  const selectedLt  = (LEAD_TIMES.find((lt) => lt === forecastStep) ?? 72) as LeadTime;
  const impact      = IMPACT_BY_LEADTIME[selectedLt];
  const prevLt      = LEAD_TIMES[Math.max(0, LEAD_TIMES.indexOf(selectedLt) - 1)];
  const prevImpact  = IMPACT_BY_LEADTIME[prevLt];

  const riverBasins = basinStatus.length > 0
    ? basinStatus.map((basin) => {
        const trend: "up" | "stable" | "down" =
          basinTrend?.trend === "rising" ? "up" : basinTrend?.trend === "falling" ? "down" : "stable";
        return { name: basin.name, level: basin.level, trend, population: basin.population_at_risk, discharge: basin.discharge_rate, rainfall: 0, status: basin.status };
      })
    : fallbackRiverBasins;

  const criticalCount   = riverBasins.filter((b) => b.status === "severe" || b.status === "extreme").length;
  const isUsingFallback = basinStatus.length === 0 || Object.values(partialErrors).some((v) => v === true);

  const cardBg      = isDarkMode ? "bg-slate-800/85"     : "bg-white/95";
  const textMuted   = isDarkMode ? "text-slate-400"      : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300"    : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText  = isDarkMode ? "text-white"          : "text-slate-900";
  const rowBg       = isDarkMode ? "bg-slate-700/30"     : "bg-slate-50";
  const ROW_H       = "clamp(540px, 68vh, 900px)";

  if (pageLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }} />
          <p className={textMuted}>Loading Flood Monitoring...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen">
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-full h-20 opacity-10"
              style={{ top: `${10 + i * 15}%`, background: `linear-gradient(90deg, transparent, ${FAO_BLUE}, transparent)`, animation: `wave ${4 + i * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      )}

      <div className="relative z-10 max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{ background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)` }}>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white">Flood Monitoring</h1>
              <p className="text-slate-200 text-xs md:text-sm">
                Real-time rainfall data and flood risk assessment{isUsingFallback && " (Demo Data)"}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {criticalCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }}>
                    <AlertTriangle className="w-3 h-3" />
                    {criticalCount} Severe Alert{criticalCount !== 1 ? "s" : ""}
                  </span>
                )}
                {basinTrend?.trend === "rising" && (
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    <Droplets className="w-3 h-3" /> Rising Levels
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} disabled={dataLoading}
                className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors">
                <RefreshCw className={`w-3 h-3 ${dataLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-xs font-medium text-white transition-colors">
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">

          {/* Left sidebar — original filters */}
          <div className="lg:col-span-3 flex flex-col">
            <div className="flex-1 rounded-xl p-3 shadow-sm flex flex-col"
              style={{
                background: isDarkMode
                  ? `linear-gradient(180deg, ${FAO_BLUE}30 0%, ${FAO_BLUE}15 100%)`
                  : `linear-gradient(180deg, ${FAO_BLUE}15 0%, ${FAO_BLUE}05 100%)`,
                border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}`,
              }}>
              <div className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"} border ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}>
                <FilterContent
                  timeRange={timeRange}      setTimeRange={setTimeRange}
                  selectedBasin={selectedBasin} setSelectedBasin={setSelectedBasin}
                  dateRange={dateRange}      setDateRange={setDateRange}
                  isDarkMode={isDarkMode}    textMuted={textMuted}
                  textSecondary={textSecondary} borderColor={borderColor}
                  headerText={headerText}    riverBasins={riverBasins}
                />
              </div>
              {/* Illustration */}
              <div className="mt-3 flex-1 flex relative min-h-[140px]">
                <div className="absolute inset-0 rounded-xl overflow-hidden"
                  style={{ backgroundImage: "url(/flood-illustration.png)", backgroundSize: "cover", backgroundPosition: "center" }} />
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="lg:col-span-9 space-y-3">
            <div className="grid grid-cols-12 gap-3" style={{ height: ROW_H }}>

              {/* Map */}
              <div className="col-span-7 flex h-full">
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col`}>
                  <div className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>River Basin Map</h3>
                    </div>
                    <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                      {criticalCount || 2} Critical
                    </span>
                  </div>
                  <div className="flex-1 relative min-h-0">
                    <FloodMonitorMap
                      isDarkMode={isDarkMode}
                      className="absolute inset-0 w-full h-full rounded-b-xl"
                      badgeText={`+${selectedLt}h Forecast`}
                      legendTitle="Flood Levels"
                      legendItems={[
                        { label: "Extreme Flood", color: "#b91c1c" },
                        { label: "Severe Flood",  color: "#ef4444" },
                        { label: "Moderate Flood",color: "#f97316" },
                        { label: "Minor Flood",   color: "#eab308" },
                        { label: "Normal",        color: "#22c55e" },
                      ]}
                    />
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                      <FloodHourSlider floating isDarkMode={isDarkMode} borderColor={borderColor} textMuted={textMuted} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column — 3 items */}
              <div className="col-span-5 flex flex-col gap-3 h-full">

                {/* 1. Stats */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}>
                  <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Stats</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      {
                        label: "Flood Extent",
                        value: impact.flood_extent_km2 !== null ? impact.flood_extent_km2.toFixed(1) : "—",
                        unit: "km²", icon: Waves, color: "#3b82f6",
                        delta: (impact.flood_extent_km2 !== null && prevImpact.flood_extent_km2 !== null)
                          ? (impact.flood_extent_km2 - prevImpact.flood_extent_km2) / prevImpact.flood_extent_km2 * 100
                          : null,
                      },
                      {
                        label: "Affected Pop.",
                        value: fmtNum(impact.affected_population),
                        unit: "people", icon: Users, color: "#f97316",
                        delta: prevLt !== selectedLt
                          ? (impact.affected_population - prevImpact.affected_population) / prevImpact.affected_population * 100
                          : null,
                      },
                      {
                        label: "Max Discharge",
                        value: impact.max_discharge.toLocaleString(),
                        unit: "m³/s", icon: Activity, color: "#ef4444",
                        delta: prevLt !== selectedLt
                          ? (impact.max_discharge - prevImpact.max_discharge) / prevImpact.max_discharge * 100
                          : null,
                      },
                      {
                        label: "Roads at Risk",
                        value: impact.affected_roads_km.toFixed(1),
                        unit: "km", icon: TrendingUp, color: "#8b5cf6",
                        delta: null,
                      },
                    ] as const).map((k) => {
                      const Icon = k.icon;
                      const up = k.delta !== null && k.delta > 0;
                      return (
                        <div key={k.label} className={`${rowBg} rounded-lg p-2`}>
                          <div className="flex items-center justify-between mb-1">
                            <Icon className="w-3.5 h-3.5" style={{ color: k.color }} />
                            {k.delta !== null && (
                              <span className={`text-[9px] font-semibold flex items-center gap-0.5 ${up ? "text-red-400" : "text-green-400"}`}>
                                {up ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                                {Math.abs(k.delta).toFixed(1)}%
                              </span>
                            )}
                          </div>
                          <p className={`text-lg font-black leading-none ${headerText}`}>{k.value}</p>
                          <p className={`text-[9px] ${textMuted} mt-0.5`}>
                            {k.label} · <span className={isDarkMode ? "text-slate-500" : "text-slate-400"}>{k.unit}</span>
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Lead time selector row */}
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-700/20">
                    <span className={`text-[9px] ${textMuted} mr-1`}>Lead:</span>
                    {LEAD_TIMES.map((lt) => (
                      <button key={lt} onClick={() => setForecastStep(lt)}
                        className="rounded text-[9px] font-bold px-1.5 py-0.5 transition-all"
                        style={{
                          backgroundColor: lt === selectedLt ? FAO_BLUE : "transparent",
                          color: lt === selectedLt ? "#fff" : isDarkMode ? "#64748b" : "#94a3b8",
                          border: `1px solid ${lt === selectedLt ? FAO_BLUE : isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                        }}>
                        +{lt}h
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Discharge Forecast */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>Discharge Forecast</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[9px] text-red-400">
                        <span className="inline-block w-3 h-0.5 bg-red-400 rounded" />Max
                      </span>
                      <span className="flex items-center gap-1 text-[9px]" style={{ color: FAO_BLUE }}>
                        <span className="inline-block w-3 h-0.5 border-t border-dashed" style={{ borderColor: FAO_BLUE }} />Avg
                      </span>
                    </div>
                  </div>
                  <DischargeChart selectedLt={selectedLt} isDarkMode={isDarkMode} />
                  <div className={`flex justify-between items-center mt-1.5 pt-1.5 border-t ${borderColor}`}>
                    <span className={`text-[9px] ${textMuted}`}>
                      <span className="text-red-400 font-semibold">{impact.max_discharge.toLocaleString()}</span>
                      {" / "}
                      <span style={{ color: FAO_BLUE }}>{impact.avg_discharge.toLocaleString()}</span>
                      {" m³/s"}
                    </span>
                    <span className={`text-[9px] ${textMuted}`}>relative p75 threshold</span>
                  </div>
                </div>

                {/* 3. Flood Events */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1 min-h-0 overflow-y-auto`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <h3 className={`text-sm font-semibold ${headerText}`}>Flood Events</h3>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                      {ACTIVE_EVENTS.filter((e) => e.status === "ongoing").length} ongoing
                    </span>
                  </div>
                  <div className="space-y-2">
                    {ACTIVE_EVENTS.map((ev, i) => {
                      const s = EVENT_STATUS_STYLES[ev.status] ?? EVENT_STATUS_STYLES.completed;
                      return (
                        <div key={i} className={`rounded-lg p-2 ${rowBg}`}>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <p className={`text-[11px] font-semibold leading-tight ${headerText}`}>{ev.name}</p>
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 uppercase ${s.bg} ${s.color}`}>{s.text}</span>
                          </div>
                          <div className={`flex items-center gap-2 text-[9px] ${textMuted}`}>
                            <Clock className="w-2.5 h-2.5" />
                            <span>{ev.start_date}{ev.end_date ? ` → ${ev.end_date}` : ""}</span>
                            {ev.estimated_affected_population !== null && (
                              <span className="flex items-center gap-0.5 ml-auto">
                                <Users className="w-2.5 h-2.5" />
                                {fmtNum(ev.estimated_affected_population)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-0.5 mt-1">
                            {ev.affected_areas.map((a) => (
                              <span key={a} className={`text-[8px] px-1 py-0.5 rounded ${isDarkMode ? "bg-slate-600/60 text-slate-300" : "bg-slate-200 text-slate-600"}`}>{a}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="block lg:hidden space-y-3">
          {/* Stats (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Stats</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Flood Extent",  value: impact.flood_extent_km2 !== null ? `${impact.flood_extent_km2.toFixed(1)} km²` : "—" },
                { label: "Affected Pop.", value: fmtNum(impact.affected_population) },
                { label: "Max Discharge", value: `${impact.max_discharge.toLocaleString()} m³/s` },
                { label: "Roads at Risk", value: `${impact.affected_roads_km.toFixed(1)} km` },
              ].map((k) => (
                <div key={k.label} className={`${rowBg} rounded-lg p-2.5`}>
                  <p className={`text-base font-black leading-none ${headerText}`}>{k.value}</p>
                  <p className={`text-[10px] ${textMuted} mt-0.5`}>{k.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Map (mobile) */}
          <div className="relative">
            <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between p-2 border-b ${borderColor}`}>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                  <h3 className={`text-sm font-semibold ${headerText}`}>River Basin Map</h3>
                </div>
                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                  {criticalCount || 2} Critical
                </span>
              </div>
              <div className="relative aspect-video">
                <FloodMonitorMap isDarkMode={isDarkMode} className="absolute inset-0 w-full h-full"
                  badgeText={`+${selectedLt}h`} legendTitle="Flood Levels"
                  legendItems={[
                    { label: "Extreme Flood", color: "#b91c1c" }, { label: "Severe Flood", color: "#ef4444" },
                    { label: "Moderate",      color: "#f97316" }, { label: "Minor",        color: "#eab308" },
                    { label: "Normal",        color: "#22c55e" },
                  ]}
                />
                <button onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}>
                  <Filter className="w-4 h-4" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                  <FloodHourSlider floating isDarkMode={isDarkMode} borderColor={borderColor} textMuted={textMuted} />
                </div>
              </div>
            </div>
            {showMobileFilters && (
              <>
                <div className="fixed inset-0 z-[1002]" onClick={() => setShowMobileFilters(false)} />
                <div className={`absolute right-2 top-1/2 -translate-y-1/2 z-[1003] w-64 rounded-xl shadow-lg border p-3 max-h-[70vh] overflow-y-auto ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-xs font-semibold ${headerText}`}>Filters</h4>
                    <button onClick={() => setShowMobileFilters(false)}
                      className={`p-1 rounded-md ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FilterContent
                    timeRange={timeRange}      setTimeRange={setTimeRange}
                    selectedBasin={selectedBasin} setSelectedBasin={setSelectedBasin}
                    dateRange={dateRange}      setDateRange={setDateRange}
                    isDarkMode={isDarkMode}    textMuted={textMuted}
                    textSecondary={textSecondary} borderColor={borderColor}
                    headerText={headerText}    riverBasins={riverBasins}
                  />
                </div>
              </>
            )}
          </div>

          {/* Flood Events (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}>
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Flood Events
              </h3>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
                {ACTIVE_EVENTS.filter((e) => e.status === "ongoing").length} ongoing
              </span>
            </div>
            <div className="space-y-2">
              {ACTIVE_EVENTS.map((ev, i) => {
                const s = EVENT_STATUS_STYLES[ev.status] ?? EVENT_STATUS_STYLES.completed;
                return (
                  <div key={i} className={`rounded-lg p-2 ${rowBg}`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className={`text-xs font-semibold ${headerText}`}>{ev.name}</p>
                      <span className={`text-[8px] font-bold px-1 py-0.5 rounded shrink-0 uppercase ${s.bg} ${s.color}`}>{s.text}</span>
                    </div>
                    <p className={`text-[10px] ${textMuted}`}>{ev.start_date}{ev.end_date ? ` → ${ev.end_date}` : ""}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className={`mt-6 pt-4 border-t ${borderColor}`}>
          <div className={`flex flex-col md:flex-row items-center justify-between text-xs ${textMuted} gap-1`}>
            <p>© 2025 FAO Uganda. All Rights Reserved.</p>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: FAO_BLUE }} />
              System Operational
            </span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes wave{0%,100%{transform:translateX(-100%);opacity:0}50%{transform:translateX(100%);opacity:0.2}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .animate-fade-in-up{animation:fadeInUp 0.4s ease-out forwards}
      `}</style>
    </div>
  );
}
