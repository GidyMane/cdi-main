import { useState, useRef, useEffect } from "react";
import {
  Waves,
  MapPin,
  Download,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Droplets,
  ChevronUp,
  ChevronDown,
  Minus,
  Users,
  Filter,
  X,
  RefreshCw,
  Activity,
  Eye,
} from "lucide-react";
import FloodMonitorMap from "../components/map/FloodMonitorMap";
import { useFloodData } from "../hooks/useFloodData";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";

interface FloodMonitoringPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

// ── Fallback mock data for when API is unavailable ────────────────────────────
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

const fallbackTimeSeriesData = [
  { time: "00:00", level: 3.8 },
  { time: "03:00", level: 3.9 },
  { time: "06:00", level: 4.0 },
  { time: "09:00", level: 4.1 },
  { time: "12:00", level: 4.2 },
  { time: "15:00", level: 4.15 },
  { time: "18:00", level: 4.2 },
  { time: "21:00", level: 4.25 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const getStatusColor = (status: string) => {
  switch (status) {
    case "severe":   return "text-red-500";
    case "moderate": return "text-orange-500";
    case "minor":    return "text-yellow-500";
    default:         return "text-green-500";
  }
};

const getStatusBg = (status: string) => {
  switch (status) {
    case "severe":   return "bg-red-500/20";
    case "moderate": return "bg-orange-500/20";
    case "minor":    return "bg-yellow-500/20";
    default:         return "bg-green-500/20";
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case "up":   return <ChevronUp   className="w-4 h-4 text-red-500"    />;
    case "down": return <ChevronDown className="w-4 h-4 text-green-500"  />;
    default:     return <Minus       className="w-4 h-4 text-yellow-500" />;
  }
};

const confidenceColor = (c: number) =>
  c >= 0.8 ? "#22c55e" : c >= 0.6 ? "#eab308" : "#f97316";

// ── TrendSparkline — module-level to prevent remount ─────────────────────────
function TrendSparkline({
  readings,
  isDarkMode,
  textMuted,
  textSecondary,
  borderColor,
  headerText,
  riverBasins,
  // dateRange,
  // setDateRange,
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
  riverBasins: Array<{
    name: string; level: number; trend: string;
    population: number; rainfall: number; discharge: number; status: string;
  }>;
}) => (
  <div className="space-y-3">
    {/* <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Select Date</label>
      <input
        type="date"
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      />
    </div> */}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FloodMonitoringPage({ isDarkMode = true }: FloodMonitoringPageProps) {
  const { dateRange, setDateRange, setLayerMode, forecastStep } = useAppStore((state) => state);
  const [timeRange, setTimeRange]               = useState("Last 24 Hours");
  const [selectedBasin, setSelectedBasin]       = useState("Nile Basin");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch flood data from API
  const {
    dashboard,
    basinStatus,
    basinTrend,
    forecasts,
    loading: dataLoading,
    partialErrors = {},
    refetch,
  } = useFloodData();
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => { setLayerMode("forecast"); }, [setLayerMode]);

  // Initialize dateRange to today if not set
  useEffect(() => {
    if (!dateRange) setDateRange(new Date().toISOString().split("T")[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle initial loading
  useEffect(() => {
    if (!dataLoading) {
      const timer = setTimeout(() => setPageLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [dataLoading]);

  // Map API data to component format
  const riverBasins =
    basinStatus.length > 0
      ? basinStatus.map((basin) => {
          const trend: "up" | "stable" | "down" =
            basinTrend?.trend === "rising"  ? "up" :
            basinTrend?.trend === "falling" ? "down" : "stable";
          return {
            name: basin.name, level: basin.level, trend,
            population: basin.population_at_risk,
            discharge: basin.discharge_rate,
            rainfall: 0,
            status: basin.status,
          };
        })
      : fallbackRiverBasins;

  // Generate time series data from trend readings
  const timeSeriesData =
    basinTrend && basinTrend.readings && basinTrend.readings.length > 0
      ? basinTrend.readings.map((reading, idx) => ({
          time: `${String(idx * 3).padStart(2, "0")}:00`,
          level: reading.level || 0,
        }))
      : fallbackTimeSeriesData;

  // Calculate statistics from available data
  const criticalBasins  = riverBasins.filter((b) => b.status === "severe" || b.status === "extreme").length;
  const atRiskPopulation = riverBasins.reduce((sum, b) => sum + b.population, 0);
  const severeCount   = riverBasins.filter((b) => b.status === "severe").length;
  const moderateCount = riverBasins.filter((b) => b.status === "moderate").length;
  const minorCount    = riverBasins.filter((b) => b.status === "minor").length;
  const normalCount   = riverBasins.filter((b) => b.status === "normal").length;
  const totalBasins   = riverBasins.length || 1;

  const currentLevel  = basinTrend?.current_level_m ?? timeSeriesData[timeSeriesData.length - 1]?.level ?? 0;
  const peakLevel     = Math.max(...timeSeriesData.map((d) => d.level));

  const isUsingFallback =
    basinStatus.length === 0 || Object.values(partialErrors).some((v) => v === true);

  const cardBg        = isDarkMode ? "bg-slate-800/85"     : "bg-white/95";
  const textMuted     = isDarkMode ? "text-slate-400"      : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300"      : "text-slate-600";
  const borderColor   = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText    = isDarkMode ? "text-white"          : "text-slate-900";
  const rowBg         = isDarkMode ? "bg-slate-700/30"     : "bg-slate-100";

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
      {/* Animated background */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-full h-20 opacity-10"
              style={{
                top: `${10 + i * 15}%`,
                background: `linear-gradient(90deg, transparent, ${FAO_BLUE}, transparent)`,
                animation: `wave ${4 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }} />
          ))}
        </div>
      )}

      <div className="relative z-10 max-w-[1600px] mx-auto">
        {/* Fallback data banner (hidden when data loads ok) */}
        {isUsingFallback && <div />}

        {/* Header */}
        <div className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{ background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)` }}>
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-lg md:text-xl font-bold text-white">Flood Monitoring</h1>
                <p className="text-slate-200 text-xs md:text-sm">
                  Real-time rainfall data and flood risk assessment{isUsingFallback && " (Demo Data)"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {criticalBasins > 0 && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }}>
                      <AlertTriangle className="w-3 h-3" />
                      {criticalBasins} Severe Alert{criticalBasins !== 1 ? "s" : ""}
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
        </div>

        {/* Desktop layout */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">

          {/* Left sidebar */}
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
          <div className="lg:col-span-9">
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px]">

              {/* Map — 7 columns */}
              <div className="col-span-7 flex h-full">
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col`}>
                  <div className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>River Basin Map</h3>
                    </div>
                    <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                      {criticalBasins || 2} Critical
                    </span>
                  </div>
                  <div className="relative flex-1 flex flex-col min-h-0">
                    <div className="flex-1 relative min-h-0">
                      <FloodMap
                        isDarkMode={isDarkMode}
                        className="absolute inset-0 w-full h-full"
                        badgeText={`+${forecastStep}h Forecast`}
                      />
                    </div>
                    <FloodHourSlider
                      isDarkMode={isDarkMode}
                      borderColor={borderColor}
                      textMuted={textMuted}
                    />
                  </div>
                </div>
              </div>

              {/* Right column — 3 KPI panels */}
              <div className="col-span-5 flex flex-col gap-3">

                {/* ── KPI 1: Alert Overview (basinStatus + dashboard.summary) ── */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <h3 className={`text-sm font-semibold ${headerText}`}>Alert Overview</h3>
                  </div>

                  {/* Severity grid */}
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[
                      { label: "Severe",   count: severeCount,   bg: "bg-red-500/15",    text: "text-red-400"    },
                      { label: "Moderate", count: moderateCount, bg: "bg-orange-500/15", text: "text-orange-400" },
                      { label: "Minor",    count: minorCount,    bg: "bg-yellow-500/15", text: "text-yellow-400" },
                      { label: "Normal",   count: normalCount,   bg: "bg-green-500/15",  text: "text-green-400"  },
                    ].map((s) => (
                      <div key={s.label} className={`${s.bg} rounded-lg p-1.5 text-center`}>
                        <p className={`text-base font-black leading-none ${s.text}`}>{s.count}</p>
                        <p className={`text-[9px] mt-0.5 ${textMuted}`}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Stacked risk proportion bar */}
                  <div className="h-1.5 rounded-full overflow-hidden flex mb-2">
                    {[
                      { w: (severeCount   / totalBasins) * 100, color: "#ef4444" },
                      { w: (moderateCount / totalBasins) * 100, color: "#f97316" },
                      { w: (minorCount    / totalBasins) * 100, color: "#eab308" },
                      { w: (normalCount   / totalBasins) * 100, color: "#22c55e" },
                    ].filter((s) => s.w > 0).map((s, i) => (
                      <div key={i} style={{ width: `${s.w}%`, backgroundColor: s.color }} />
                    ))}
                  </div>

                  {/* Dashboard summary KPIs */}
                  <div className={`grid grid-cols-3 gap-1 pt-1.5 border-t ${borderColor}`}>
                    {[
                      { label: "Critical",     value: dashboard?.summary?.critical_basins ?? criticalBasins,  color: "text-red-400"    },
                      { label: "At Risk Pop",  value: `${((dashboard?.summary?.at_risk_population ?? atRiskPopulation) / 1_000_000).toFixed(1)}M`, color: "text-orange-400" },
                      { label: "Active Alerts",value: dashboard?.summary?.active_alerts ?? 3,                 color: "text-amber-400"  },
                    ].map((k) => (
                      <div key={k.label} className="text-center">
                        <p className={`text-sm font-black leading-none ${k.color}`}>{k.value}</p>
                        <p className={`text-[9px] ${textMuted} mt-0.5`}>{k.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── KPI 2: Level & Discharge Trend (basinTrend) ── */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>Level & Discharge</h3>
                    </div>
                    <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      basinTrend?.trend === "rising"  ? "bg-red-500/15 text-red-400"    :
                      basinTrend?.trend === "falling" ? "bg-green-500/15 text-green-400" :
                      "bg-yellow-500/15 text-yellow-400"
                    }`}>
                      {basinTrend?.trend === "rising"  ? <TrendingUp   className="w-3 h-3" /> :
                       basinTrend?.trend === "falling" ? <TrendingDown className="w-3 h-3" /> :
                       <Minus className="w-3 h-3" />}
                      {basinTrend?.trend ?? "stable"}
                    </span>
                  </div>

                  <div className="flex items-end gap-3 mb-1.5">
                    <div>
                      <p className={`text-[9px] ${textMuted} uppercase tracking-wide`}>Current</p>
                      <p className={`text-2xl font-black leading-none ${headerText}`}>
                        {currentLevel.toFixed(2)}
                        <span className={`text-[11px] font-semibold ml-1 ${textMuted}`}>m</span>
                      </p>
                    </div>
                    <div className="pb-0.5">
                      <p className={`text-[9px] ${textMuted}`}>Peak 24h</p>
                      <p className={`text-sm font-bold ${headerText}`}>{peakLevel.toFixed(2)}m</p>
                    </div>
                    <div className="pb-0.5 ml-auto text-right">
                      <p className={`text-[9px] ${textMuted}`}>Trend</p>
                      <div className="flex items-center justify-end">{getTrendIcon(
                        basinTrend?.trend === "rising"  ? "up"   :
                        basinTrend?.trend === "falling" ? "down" : "stable"
                      )}</div>
                    </div>
                  </div>

                  <TrendSparkline readings={timeSeriesData} isDarkMode={isDarkMode} />

                  <div className="flex justify-between mt-1">
                    {[timeSeriesData[0], timeSeriesData[Math.floor(timeSeriesData.length / 2)], timeSeriesData[timeSeriesData.length - 1]].map((d, i) => (
                      <span key={i} className={`text-[8px] ${textMuted}`}>{d?.time}</span>
                    ))}
                  </div>
                </div>

                {/* ── KPI 3: Forecast Outlook (forecasts[] — previously fetched but never shown) ── */}
                <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1 min-h-0 flex flex-col`}>
                  <div className="flex items-center justify-between mb-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>Forecast Outlook</h3>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${textMuted}`}
                      style={{ background: isDarkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                      {forecasts.length} forecast{forecasts.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
                    {forecasts.map((fc, i) => (
                      <div key={fc.id ?? i} className={`${rowBg} rounded-lg p-2`}>
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className={`text-[11px] font-semibold leading-tight ${headerText}`}>{fc.basin}</p>
                          <span className={`text-[9px] font-bold shrink-0 ${headerText}`}>
                            {fc.expected_level.toFixed(2)}m
                          </span>
                        </div>
                        {/* Confidence bar */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="flex-1 h-1 rounded-full overflow-hidden"
                            style={{ background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${(fc.confidence ?? 0) * 100}%`,
                                backgroundColor: confidenceColor(fc.confidence ?? 0),
                              }} />
                          </div>
                          <span className="text-[9px] font-semibold shrink-0"
                            style={{ color: confidenceColor(fc.confidence ?? 0) }}>
                            {Math.round((fc.confidence ?? 0) * 100)}%
                          </span>
                        </div>
                        {fc.impact_assessment && (
                          <p className={`text-[9px] leading-relaxed ${textMuted}`}>{fc.impact_assessment}</p>
                        )}
                        <p className={`text-[8px] mt-0.5 ${textMuted}`}>{fc.forecast_date}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* About — full-width row below both sidebar and main content */}
        <div className="hidden lg:block mt-4">
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
              <Info className="w-4 h-4" style={{ color: FAO_BLUE }} />
              About Flood Monitoring
            </h3>
            <p className={`text-xs ${textMuted} mb-2`}>
              Real-time monitoring of Uganda's major river basins with automated alerts when water levels exceed
              safe thresholds. Data is collected from multiple sensors and updated every 15 minutes.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                <Droplets className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} /> Rainfall monitoring
              </div>
              <div className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                <TrendingUp className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} /> Trend analysis
              </div>
              <div className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                <Waves className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} /> Flow discharge tracking
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="block lg:hidden space-y-3">

          {/* Alert Overview (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Alert Overview</h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Severe",   count: severeCount,   cls: "text-red-500 bg-red-500/10 border-red-500/20"       },
                { label: "Moderate", count: moderateCount, cls: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
                { label: "Minor",    count: minorCount,    cls: "text-yellow-500 bg-yellow-500/10 border-yellow-500/20" },
                { label: "Normal",   count: normalCount,   cls: "text-green-500 bg-green-500/10 border-green-500/20"   },
              ].map((s) => (
                <div key={s.label} className={`border rounded-lg p-2 text-center ${s.cls}`}>
                  <p className="text-lg font-bold">{s.count}</p>
                  <p className={`text-[10px] ${textMuted}`}>{s.label}</p>
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
                  {criticalBasins || 2} Critical
                </span>
              </div>
              <div className="relative aspect-video flex flex-col">
                <div className="flex-1 relative">
                  <FloodMap isDarkMode={isDarkMode} className="absolute inset-0 w-full h-full"
                    badgeText={`+${forecastStep}h`} />
                </div>
                <button onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}>
                  <Filter className="w-4 h-4" />
                </button>
                <FloodHourSlider isDarkMode={isDarkMode} borderColor={borderColor} textMuted={textMuted} />
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

          {/* Level & Discharge (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}>
                <Activity className="w-4 h-4" style={{ color: FAO_BLUE }} />
                Level & Discharge
              </h3>
              <span className={`text-sm font-bold ${headerText}`}>{currentLevel.toFixed(2)}m</span>
            </div>
            <TrendSparkline readings={timeSeriesData} isDarkMode={isDarkMode} />
          </div>

          {/* Forecast Outlook (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
              <Eye className="w-4 h-4" style={{ color: FAO_BLUE }} /> Forecast Outlook
            </h3>
            <div className="space-y-2">
              {forecasts.slice(0, 3).map((fc, i) => (
                <div key={fc.id ?? i} className={`rounded-lg p-2 ${rowBg}`}>
                  <div className="flex justify-between mb-1">
                    <p className={`text-xs font-semibold ${headerText}`}>{fc.basin}</p>
                    <span className={`text-xs font-bold ${headerText}`}>{fc.expected_level.toFixed(2)}m</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full overflow-hidden"
                      style={{ background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${(fc.confidence ?? 0) * 100}%`, backgroundColor: confidenceColor(fc.confidence ?? 0) }} />
                    </div>
                    <span className="text-[10px] font-semibold shrink-0"
                      style={{ color: confidenceColor(fc.confidence ?? 0) }}>
                      {Math.round((fc.confidence ?? 0) * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* About (mobile) */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-1.5 flex items-center gap-1.5 ${headerText}`}>
              <Info className="w-4 h-4" style={{ color: FAO_BLUE }} /> About Flood Monitoring
            </h3>
            <p className={`text-xs ${textMuted}`}>
              Real-time monitoring of Uganda's major river basins with automated alerts when water levels
              exceed safe thresholds. Updated every 15 minutes.
            </p>
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
