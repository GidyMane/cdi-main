import { useState, useEffect, useRef } from "react";
import {
  Waves,
  MapPin,
  Download,
  TrendingUp,
  AlertTriangle,
  Info,
  Droplets,
  Filter,
  X,
  RefreshCw,
  Users,
  Building2,
  Shield,
  Navigation,
  ChevronDown,
  Activity,
  Calendar,
  Clock,
} from "lucide-react";
import FloodMonitorMap from "../components/map/FloodMonitorMap";
import { useFloodData } from "../hooks/useFloodData";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";
import type {
  FloodRasterLayer,
  FloodForecastFull,
  FloodImpact,
  FloodActualEvent,
  FloodBasin,
  FloodSeason,
  FloodPipelineStatus,
} from "@/services/api";
import { floodAPI } from "@/services/api";

interface FloodMonitoringPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";



// ── ArcGauge — SVG semicircular gauge meter ───────────────────────────────────
function ArcGauge({
  value,
  max,
  label,
  unit,
  color,
  isDarkMode,
}: {
  value: number;
  max: number;
  label: string;
  unit: string;
  color: string;
  isDarkMode: boolean;
}) {
  const pct = Math.min(Math.max(value / (max || 1), 0), 1);
  const cx = 40,
    cy = 40,
    r = 28;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const pt = (angle: number) => ({
    x: (cx + r * Math.cos(toRad(angle))).toFixed(2),
    y: (cy + r * Math.sin(toRad(angle))).toFixed(2),
  });
  const s = pt(135);
  const e = pt(405); // bg arc end (= 45°)
  const fe = pt(135 + pct * 270); // fill end
  const bgArc = `M ${s.x},${s.y} A ${r} ${r} 0 1 1 ${e.x},${e.y}`;
  const fillArc =
    pct < 0.01
      ? ""
      : `M ${s.x},${s.y} A ${r} ${r} 0 ${pct * 270 > 180 ? 1 : 0} 1 ${fe.x},${fe.y}`;
  const display =
    value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : Math.round(value).toString();
  return (
    <div className="flex flex-col items-center">
      <svg width="80" height="65" viewBox="0 0 80 65">
        <path
          d={bgArc}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke={isDarkMode ? "#1e293b" : "#e2e8f0"}
        />
        {fillArc && (
          <path
            d={fillArc}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke={color}
          />
        )}
        <text
          x="40"
          y="43"
          textAnchor="middle"
          fontSize="12"
          fontWeight="800"
          fill={isDarkMode ? "#f1f5f9" : "#0f172a"}
        >
          {display}
        </text>
        <text
          x="40"
          y="54"
          textAnchor="middle"
          fontSize="7.5"
          fill={isDarkMode ? "#64748b" : "#94a3b8"}
        >
          {unit}
        </text>
      </svg>
      <p
        className="text-[9px] font-medium text-center leading-tight"
        style={{ color: isDarkMode ? "#64748b" : "#94a3b8", marginTop: "-4px" }}
      >
        {label}
      </p>
    </div>
  );
}

// ── FloodMap wrapper (preserves main-branch abstraction) ─────────────────────
const FloodMap = ({
  isDarkMode,
  className = "",
  badgeText = "Forecast",
  onLayerResolved,
  onBasinSelect,
}: {
  isDarkMode: boolean;
  className?: string;
  badgeText?: string;
  onLayerResolved?: (layer: FloodRasterLayer | null) => void;
  onBasinSelect?: (basinName: string) => void;
}) => (
  <FloodMonitorMap
    isDarkMode={isDarkMode}
    className={`rounded-lg md:rounded-xl ${className}`}
    badgeText={badgeText}
    legendTitle="Discharge (m³/s)"
    legendItems={[
      { label: "> 3000", color: "#800026" },
      { label: "1500 – 3000", color: "#bd0026" },
      { label: "700 – 1500", color: "#f03b20" },
      { label: "300 – 700", color: "#253494" },
      { label: "100 – 300", color: "#225ea8" },
      { label: "50 – 100", color: "#1d91c0" },
      { label: "20 – 50", color: "#41b6c4" },
      { label: "5 – 20", color: "#7fcdbb" },
      { label: "1 – 5", color: "#c7e9b4" },
      { label: "< 1", color: "#ffffcc" },
    ]}
    onLayerResolved={onLayerResolved}
    onBasinSelect={onBasinSelect}
  />
);

// ── FilterContents ─────────────────────────────────────────────────────────────
const FilterContent = ({
  selectedBasin,
  setSelectedBasin,
  // selectedLeadtime,
  // setSelectedLeadtime,
  // selectedDate,
  // setSelectedDate,
  // availableDates,
  availableBasinNames,
  isDarkMode,
  textMuted,
  textSecondary,
  borderColor,
  headerText,
  // riverBasins,
  // derived quick stats from live forecasts
  totalPopulation,
  criticalCount,
  activeAlerts,
}: {
  timeRange: string;
  setTimeRange: (val: string) => void;
  selectedBasin: string;
  setSelectedBasin: (val: string) => void;
  selectedLeadtime: number;
  setSelectedLeadtime: (val: number) => void;
  selectedDate: string;
  setSelectedDate: (val: string) => void;
  availableDates: string[];
  availableBasinNames: string[];
  dateRange: string;
  setDateRange: (val: string) => void;
  isDarkMode: boolean;
  textMuted: string;
  textSecondary: string;
  borderColor: string;
  headerText: string;
  riverBasins: Array<{
    name: string;
    level: number;
    trend: string;
    population: number;
    rainfall: number;
    discharge: number;
    status: string;
  }>;
  totalPopulation: number;
  criticalCount: number;
  activeAlerts: number;
}) => (
  <div className="space-y-3">
    {/* Leadtime filter */}
    {/* <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Forecast Leadtime</label>
      <div className="flex gap-1">
        {[24, 48, 72].map((h) => (
          <button
            key={h}
            onClick={() => setSelectedLeadtime(h)}
            className="flex-1 py-1 text-xs rounded-lg font-semibold transition-all"
            style={{
              backgroundColor: selectedLeadtime === h ? FAO_BLUE : isDarkMode ? "#1e293b" : "#f1f5f9",
              color: selectedLeadtime === h ? "#fff" : isDarkMode ? "#94a3b8" : "#64748b",
              border: `1px solid ${selectedLeadtime === h ? FAO_BLUE : isDarkMode ? "#334155" : "#e2e8f0"}`,
            }}
          >
            +{h}h
          </button>
        ))}
      </div>
    </div> */}

    {/* Forecast date */}
    {/* {availableDates.length > 0 && (
      <div>
        <label className={`text-xs ${textMuted} mb-1 block`}>Forecast Date</label>
        <select
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={`w-full p-2 rounded-lg text-xs outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
        >
          {availableDates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>
    )} */}

    {/* River Basin */}
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>River Basin</label>
      <select
        value={selectedBasin}
        onChange={(e) => setSelectedBasin(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        <option value="All Basins">All Basins</option>
        {availableBasinNames.map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
      </select>
    </div>

    {/* Alert Levelss */}
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Alert Level</label>
      <div className="space-y-1.5">
        {["All Levels", "Critical Only", "Warning Only", "Normal"].map((level) => (
          <label key={level} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className={`rounded ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-slate-300"}`}
              defaultChecked={level === "All Levels"}
            />
            <span className={textSecondary}>{level}</span>
          </label>
        ))}
      </div>
    </div>

    {/* Quick Stats from live API */}
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>Quick Stats</h4>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Critical Basins</span>
          <span className="text-red-500 font-medium">{criticalCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>At Risk Population</span>
          <span className="text-orange-500 font-medium">
            {totalPopulation >= 1_000_000
              ? `${(totalPopulation / 1_000_000).toFixed(1)}M`
              : `${Math.round(totalPopulation / 1_000)}K`}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Active Alerts</span>
          <span className="text-red-500 font-medium">{activeAlerts}</span>
        </div>
      </div>
    </div>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FloodMonitoringPage({
  isDarkMode = true,
}: FloodMonitoringPageProps) {
  const { dateRange, setDateRange, setLayerMode, forecastStep, setFloodAlerts } = useAppStore(
    (state) => state,
  );
  const [timeRange, setTimeRange] = useState("Last 24 Hours");
  const [selectedBasin, setSelectedBasin] = useState("All Basins");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedFloodLayer, setSelectedFloodLayer] =
    useState<FloodRasterLayer | null>(null);

  // ── New endpoint state ────────────────────────────────────────────────────
  const [actualEvents, setActualEvents] = useState<FloodActualEvent[]>([]);
  const [allBasins, setAllBasins] = useState<FloodBasin[]>([]);
  const [currentSeason, setCurrentSeason] = useState<FloodSeason | null>(null);
  const [pipeline, setPipeline] = useState<FloodPipelineStatus | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);
  const alertsBtnRef = useRef<HTMLButtonElement>(null);
  const [alertsPos, setAlertsPos] = useState({ top: 0, left: 0 });

  // Fetch the four new endpoints once on mount
  useEffect(() => {
    floodAPI.getActualEvents(8).then((res) => {
      if (res?.results) setActualEvents(res.results);
    }).catch(() => {});

    floodAPI.getBasins().then((res) => {
      if (Array.isArray(res)) {
        // Deduplicate by name in case the API returns multiple entries per basin
        const seen = new Set<string>();
        const unique = res.filter((b) => {
          if (seen.has(b.name)) return false;
          seen.add(b.name);
          return true;
        });
        setAllBasins(unique);
      }
    }).catch(() => {});

    floodAPI.getSeasons().then((res) => {
      if (Array.isArray(res)) {
        const current = res.find((s) => s.is_current) ?? null;
        setCurrentSeason(current);
      }
    }).catch(() => {});

    floodAPI.getForecastPipeline().then((res) => {
      if (res) setPipeline(res);
    }).catch(() => {});
  }, []);

  // Re-fetch pipeline status on manual refresh
  const refreshPipeline = () => {
    floodAPI.getForecastPipeline().then((res) => {
      if (res) setPipeline(res);
    }).catch(() => {});
  };

  // Close alerts dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setAlertsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Filter state: leadtime + date ─────────────────────────────────────────
  const [selectedLeadtime, setSelectedLeadtime] = useState<number>(24);
  const [selectedDate, setSelectedDate] = useState<string>("");

  const statsDate = selectedFloodLayer?.forecast_date || selectedDate || dateRange || undefined;
  const statsLeadtime = selectedFloodLayer?.leadtime_hours ?? selectedLeadtime ?? forecastStep;

  // Fetch flood data from API — pass selectedBasin so basinTrend refetches when it changes
  const basinForTrend = selectedBasin === "All Basins" ? undefined : selectedBasin;
  const {
    dashboard,
    basinStatus,
    basinTrend,
    forecastsFull,
    loading: dataLoading,
    partialErrors = {},
    refetch,
  } = useFloodData(statsDate, statsLeadtime, basinForTrend);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    setLayerMode("forecast");
  }, [setLayerMode]);

  // Set dateRange to latest forecast date from API; fallback to today
  useEffect(() => {
    const forecastDate = dashboard?.forecast_date;
    if (forecastDate && !selectedFloodLayer) {
      setDateRange(forecastDate);
      if (!selectedDate) setSelectedDate(forecastDate);
    }
  }, [dashboard?.forecast_date, selectedFloodLayer]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLayerResolved = (layer: FloodRasterLayer | null) => {
    setSelectedFloodLayer((current) => {
      if (current?.layer_name === layer?.layer_name) return current;
      return layer;
    });
    if (layer?.leadtime_hours) setSelectedLeadtime(layer.leadtime_hours);
    if (layer?.forecast_date) setSelectedDate(layer.forecast_date);
  };

  // Handle initial loading
  useEffect(() => {
    if (!dataLoading) {
      const timer = setTimeout(() => setPageLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [dataLoading]);

  // ── Derive all KPIs from /floods/forecasts/ API ───────────────────────────
  // Pick the forecast matching the selected leadtime + date
  const activeForecast: FloodForecastFull | undefined = forecastsFull.find(
    (f) => f.leadtime_hours === selectedLeadtime &&
      (!selectedDate || f.forecast_date === selectedDate),
  ) ?? forecastsFull[0];

  // All impacts from the active forecast, filtered by selected basin
  const rawImpacts: FloodImpact[] = activeForecast?.impacts ?? [];
  const allImpacts: FloodImpact[] = selectedBasin === "All Basins"
    ? rawImpacts
    : rawImpacts.filter((i) => {
        // Match district impacts whose district name contains the basin selection,
        // OR basin impacts whose river_basin_name contains the selection
        const basinKeyword = selectedBasin.toLowerCase().replace(" basin", "").trim();
        const districtMatch = i.district_name?.toLowerCase().includes(basinKeyword) ?? false;
        const basinMatch = i.river_basin_name?.toLowerCase().includes(basinKeyword) ?? false;
        return districtMatch || basinMatch;
      });

  // District impacts (have district_name)
  const districtImpacts = allImpacts.filter((i) => i.district_name !== null);
  // Basin impacts (have river_basin_name)
  const basinImpacts = allImpacts.filter((i) => i.river_basin_name !== null);

  // Top districts by population, sorted descending
  const topDistrictImpacts = [...districtImpacts]
    .sort((a, b) => b.affected_population - a.affected_population)
    .slice(0, 4);

  // ── Human Impact KPIs — direct sums from filtered impacts, zero if no data ──
  const totalAffectedPopulation = districtImpacts.reduce((s, i) => s + (i.affected_population ?? 0), 0);
  const totalFloodExtentKm2 = allImpacts.reduce((s, i) => s + (i.flood_extent_km2 ?? 0), 0);
  const populationDensityAvg = totalFloodExtentKm2 > 0
    ? Math.round(totalAffectedPopulation / totalFloodExtentKm2)
    : 0;

  // ── Infrastructure KPIs (aggregate across all impacts for selected forecast) ─
  const totalRoadsKm = allImpacts.reduce((s, i) => s + (i.affected_roads_km ?? 0), 0);
  const totalBuildings = allImpacts.reduce((s, i) => s + (i.affected_buildings_count ?? 0), 0);
  const totalPois = allImpacts.reduce((s, i) => s + (i.affected_pois_count ?? 0), 0);

  // ── Flood Metrics KPIs (from basin impacts) ───────────────────────────────
  const allMaxDischarges = allImpacts.map((i) => i.max_discharge ?? 0);
  const allAvgDischarges = allImpacts
    .map((i) => i.avg_discharge ?? 0)
    .filter((v) => v > 0);

  const maxDischargeApi = allMaxDischarges.length > 0
    ? Math.max(...allMaxDischarges)
    : 0;
  const avgDischargeApi = allAvgDischarges.length > 0
    ? allAvgDischarges.reduce((s, v) => s + v, 0) / allAvgDischarges.length
    : 0;

  // Available forecast dates for the date filter dropdown
  const availableDates = Array.from(
    new Set(forecastsFull.map((f) => f.forecast_date))
  ).sort().reverse();

  // Available basins: prefer allBasins from /floods/basins/, fall back to impact names
  const availableBasinNames: string[] = allBasins.length > 0
    ? allBasins.map((b) => b.name).sort()
    : Array.from(
        new Set(
          (activeForecast?.impacts ?? [])
            .filter((i) => i.river_basin_name !== null)
            .map((i) => i.river_basin_name!)
        )
      ).sort();

  // Per-basin discharge threshold from allBasins (falls back to global 3000 m³/s)
  const getBasinThreshold = (basinName: string): number => {
    const match = allBasins.find((b) =>
      b.name.toLowerCase() === basinName.toLowerCase()
    );
    return match?.flood_threshold ?? 3000;
  };

  // ── Basin status list — scoped to selected basin when one is chosen ─────────
  // Each basin entry gets its own trend direction from basinTrend (which now
  // refetches whenever selectedBasin changes via the basinForTrend argument).
  const riverBasins = basinStatus.map((basin) => {
    const isSelectedBasin =
      selectedBasin === "All Basins" ||
      basin.name.toLowerCase().includes(selectedBasin.toLowerCase().replace(" basin", "").trim());
    const trend: "up" | "stable" | "down" =
      isSelectedBasin && basinTrend
        ? basinTrend.trend === "rising" ? "up"
          : basinTrend.trend === "falling" ? "down"
          : "stable"
        : "stable";
    return {
      name: basin.name,
      level: basin.level,
      trend,
      population: basin.population_at_risk,
      discharge: basin.discharge_rate,
      rainfall: 0,
      status: basin.status,
    };
  });

  // ── Time-series: readings from basinTrend (refetches per basin) ───────────
  const timeSeriesData =
    basinTrend?.readings?.length
      ? basinTrend.readings.map((reading, idx) => ({
          time: reading.timestamp
            ? new Date(reading.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
            : `${String(idx * 3).padStart(2, "0")}:00`,
          level: reading.level ?? 0,
        }))
      : [];


  // ── Basin-scoped status counts ────────────────────────────────────────────
  const scopedBasins = selectedBasin === "All Basins"
    ? riverBasins
    : riverBasins.filter((b) =>
        b.name.toLowerCase().includes(selectedBasin.toLowerCase().replace(" basin", "").trim())
      );

  const criticalBasins = scopedBasins.filter((b) => b.status === "severe" || b.status === "extreme").length;
  const severeCount    = scopedBasins.filter((b) => b.status === "severe").length;
  const moderateCount  = scopedBasins.filter((b) => b.status === "moderate").length;

  const currentLevel = basinTrend?.current_level_m
    ?? (timeSeriesData.length > 0 ? timeSeriesData[timeSeriesData.length - 1].level : 0);

  // ── Named critical basins — specific basins that are critical/severe ───────
  // Built from both forecast impacts (discharge > 3000) AND basinStatus entries.
  // These are used in the UI badges and pushed to the notification bell.
  const namedCriticalBasins: Array<{ name: string; discharge: number; status: string; population: number }> = [];

  basinImpacts.forEach((i) => {
    const threshold = getBasinThreshold(i.river_basin_name ?? "");
    if ((i.max_discharge ?? 0) > threshold && i.river_basin_name) {
      if (!namedCriticalBasins.find((n) => n.name === i.river_basin_name)) {
        namedCriticalBasins.push({
          name: i.river_basin_name,
          discharge: Math.round(i.max_discharge ?? 0),
          status: "extreme",
          population: i.affected_population ?? 0,
        });
      }
    }
  });

  scopedBasins.filter((b) => b.status === "severe" || b.status === "extreme").forEach((b) => {
    if (!namedCriticalBasins.find((n) => n.name === b.name)) {
      namedCriticalBasins.push({
        name: b.name,
        discharge: Math.round(b.discharge),
        status: b.status,
        population: b.population,
      });
    }
  });

  const criticalBasinCount = namedCriticalBasins.length;

  const thresholdMode =
    criticalBasinCount > 0 ? "EXCEEDED" : severeCount > 0 ? "WARNING" : "NORMAL";

  // ── Districts at risk — from forecast impacts, scoped to selected basin ───
  const liveDistrictsAtRisk = topDistrictImpacts.map((i) => {
    const threshold = getBasinThreshold(i.river_basin_name ?? "");
    return {
      id: 0,
      name: i.district_name!,
      population_affected: i.affected_population,
      flood_risk_level: (i.max_discharge ?? 0) > threshold
        ? "critical" as const
        : (i.max_discharge ?? 0) > threshold * 0.33
          ? "high" as const
          : "medium" as const,
    };
  });

  // ── All display KPIs — direct from API, zero if no data ──────────────────
  const displayPopulation  = totalAffectedPopulation;
  const displayDensity     = populationDensityAvg;
  const affectedRoadsKm    = Math.round(totalRoadsKm * 10) / 10;
  const affectedBuildings  = totalBuildings;
  const affectedPois       = totalPois;
  const maxDischarge       = maxDischargeApi;
  const avgDischarge       = Math.round(avgDischargeApi);

  // ── Infrastructure proportion bar widths ──────────────────────────────────
  const infraTotal = (affectedRoadsKm > 0 ? affectedRoadsKm : 1) + (affectedBuildings / 100);
  const roadsBarPct = Math.round((affectedRoadsKm / infraTotal) * 100);
  const buildingsBarPct = 100 - roadsBarPct;

  // ── Push named critical basins to the global store for the notification bell ─
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setFloodAlerts(
      namedCriticalBasins.map((b) => ({
        id: `flood-${b.name}`,
        basinName: b.name,
        status: b.status,
        discharge: b.discharge,
        population: b.population,
      }))
    );
  }, [namedCriticalBasins.length, namedCriticalBasins.map((b) => b.name).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const cardBg = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300" : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText = isDarkMode ? "text-white" : "text-slate-900";
  const rowBg = isDarkMode ? "bg-slate-700/30" : "bg-slate-100";

  if (pageLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          />
          <p className={textMuted}>Loading Flood Monitoring...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 3xl:p-8 4xl:p-10 min-h-screen">
      {/* Animated background */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute w-full h-20 opacity-10"
              style={{
                top: `${10 + i * 15}%`,
                background: `linear-gradient(90deg, transparent, ${FAO_BLUE}, transparent)`,
                animation: `wave ${4 + i * 0.5}s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Error banner — only when a primary endpoint had a real network/server failure */}
        {!dataLoading && (partialErrors.dashboard || partialErrors.forecasts) && (
          <div
            className="mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2"
            style={{ backgroundColor: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Some flood data could not be loaded — check API connection or try refreshing.
          </div>
        )}

        {/* Header */}
        <div
          className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{
            background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)`,
          }}
        >
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-lg md:text-xl 3xl:text-2xl 4xl:text-3xl font-bold text-white">
                  Flood Monitoring
                </h1>
                <p className="text-slate-200 text-xs md:text-sm 3xl:text-base 4xl:text-lg">
                  Real-time rainfall data and flood risk assessment
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {/* Alert summary badge — shows count, click to expand list */}
                  {(namedCriticalBasins.length > 0 || severeCount > 0 || moderateCount > 0) && !dataLoading ? (
                    <div className="relative" ref={alertsRef}>
                      <button
                        ref={alertsBtnRef}
                        onClick={() => {
                          if (!alertsOpen && alertsBtnRef.current) {
                            const r = alertsBtnRef.current.getBoundingClientRect();
                            setAlertsPos({ top: r.bottom + 6, left: r.left });
                          }
                          setAlertsOpen((o) => !o);
                        }}
                        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white cursor-pointer select-none"
                        style={{ backgroundColor: namedCriticalBasins.length > 0 ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)" }}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {namedCriticalBasins.length > 0
                          ? `${namedCriticalBasins.length} critical`
                          : `${severeCount + moderateCount} elevated`}
                        {(severeCount > 0 || moderateCount > 0) && namedCriticalBasins.length === 0 &&
                          ` · ${severeCount} severe, ${moderateCount} moderate`}
                        <ChevronDown className={`w-2.5 h-2.5 transition-transform ${alertsOpen ? "rotate-180" : ""}`} />
                      </button>
                      {alertsOpen && (
                        <div
                          style={{
                            position: "fixed",
                            top: alertsPos.top,
                            left: alertsPos.left,
                            zIndex: 9999,
                            background: isDarkMode ? "#1e293b" : "#fff",
                            borderColor: isDarkMode ? "rgba(71,85,105,0.5)" : "#e2e8f0",
                            borderWidth: 1,
                            borderStyle: "solid",
                          }}
                          className="rounded-lg shadow-xl min-w-[220px] py-1"
                        >
                          <p className="text-[9px] font-semibold uppercase tracking-wide px-2.5 pt-1 pb-1.5"
                            style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>
                            Basin alerts
                          </p>
                          {namedCriticalBasins.map((b) => (
                            <button
                              key={b.name}
                              onClick={() => { setSelectedBasin(b.name); setAlertsOpen(false); }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-red-500/10 transition-colors"
                            >
                              <span className="text-xs font-medium" style={{ color: isDarkMode ? "#f1f5f9" : "#0f172a" }}>{b.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                                style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                                {b.status} · {b.discharge.toLocaleString()} m³/s
                              </span>
                            </button>
                          ))}
                          {scopedBasins.filter((b) => b.status === "severe" && !namedCriticalBasins.find((n) => n.name === b.name)).map((b) => (
                            <button
                              key={b.name}
                              onClick={() => { setSelectedBasin(b.name); setAlertsOpen(false); }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-orange-500/10 transition-colors"
                            >
                              <span className="text-xs font-medium" style={{ color: isDarkMode ? "#f1f5f9" : "#0f172a" }}>{b.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                                style={{ backgroundColor: "rgba(249,115,22,0.15)", color: "#f97316" }}>
                                severe
                              </span>
                            </button>
                          ))}
                          {scopedBasins.filter((b) => b.status === "moderate" && !namedCriticalBasins.find((n) => n.name === b.name)).map((b) => (
                            <button
                              key={b.name}
                              onClick={() => { setSelectedBasin(b.name); setAlertsOpen(false); }}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 text-left hover:bg-yellow-500/10 transition-colors"
                            >
                              <span className="text-xs font-medium" style={{ color: isDarkMode ? "#f1f5f9" : "#0f172a" }}>{b.name}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
                                style={{ backgroundColor: "rgba(234,179,8,0.15)", color: "#eab308" }}>
                                moderate
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : !dataLoading && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(34,197,94,0.3)" }}
                    >
                      All basins normal
                    </span>
                  )}
                  {/* Current season badge */}
                  {currentSeason && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                    >
                      <Calendar className="w-2.5 h-2.5" />
                      {currentSeason.name}
                    </span>
                  )}
                  {basinTrend?.trend === "rising" && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                    >
                      <Droplets className="w-3 h-3" /> Rising levels
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { refetch(); refreshPipeline(); }}
                  disabled={dataLoading || pipeline?.status === "running"}
                  className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
                  title={pipeline?.last_run ? `Last run: ${new Date(pipeline.last_run).toLocaleString()}` : "Refresh data"}
                >
                  <RefreshCw
                    className={`w-3 h-3 ${(dataLoading || pipeline?.status === "running") ? "animate-spin" : ""}`}
                  />
                  <span className="hidden sm:inline">
                    {pipeline?.status === "running" ? "Running…" : pipeline?.last_run
                      ? `${Math.round((Date.now() - new Date(pipeline.last_run).getTime()) / 60000)}m ago`
                      : "Refresh"}
                  </span>
                </button>
                <button
                  onClick={() => {
                    floodAPI.exportData("csv", statsDate, selectedBasin).then(() => {}).catch(() => {});
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-xs font-medium text-white transition-colors"
                >
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
            <div
              className="flex-1 rounded-xl p-3 shadow-sm flex flex-col"
              style={{
                background: isDarkMode
                  ? `linear-gradient(180deg, ${FAO_BLUE}30 0%, ${FAO_BLUE}15 100%)`
                  : `linear-gradient(180deg, ${FAO_BLUE}15 0%, ${FAO_BLUE}05 100%)`,
                border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}`,
              }}
            >
              <div
                className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"} border ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}
              >
                <FilterContent
                  timeRange={timeRange}
                  setTimeRange={setTimeRange}
                  selectedBasin={selectedBasin}
                  setSelectedBasin={setSelectedBasin}
                  selectedLeadtime={selectedLeadtime}
                  setSelectedLeadtime={setSelectedLeadtime}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  availableDates={availableDates}
                  availableBasinNames={availableBasinNames}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  isDarkMode={isDarkMode}
                  textMuted={textMuted}
                  textSecondary={textSecondary}
                  borderColor={borderColor}
                  headerText={headerText}
                  riverBasins={riverBasins}
                  totalPopulation={displayPopulation}
                  criticalCount={criticalBasinCount}
                  activeAlerts={criticalBasins + severeCount + moderateCount}
                />
              </div>
              {/* Recent Events — from actual-events API */}
              <div className="mt-3 flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className={`flex-1 rounded-xl p-3 flex flex-col min-h-0 ${isDarkMode ? "bg-slate-800/60" : "bg-white/80"} border ${borderColor}`}>
                  <div className="flex items-center gap-1.5 mb-2 flex-shrink-0">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    <h4 className={`text-xs font-semibold ${headerText}`}>Recent Events</h4>
                  </div>
                  {actualEvents.length === 0 ? (
                    <p className={`text-[10px] ${textMuted}`}>No recent events recorded</p>
                  ) : (
                    <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
                      {actualEvents.slice(0, 6).map((ev) => {
                        const severityColor =
                          ev.severity === "extreme" ? "#ef4444"
                          : ev.severity === "severe" ? "#f97316"
                          : ev.severity === "moderate" ? "#eab308"
                          : "#22c55e";
                        const dateStr = ev.event_date
                          ? new Date(ev.event_date).toLocaleDateString([], { month: "short", day: "numeric" })
                          : "";
                        return (
                          <div key={ev.id} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: severityColor }} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-[10px] font-medium leading-tight truncate ${headerText}`}>
                                {ev.basin_name ?? ev.district_name ?? "Unknown location"}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-semibold" style={{ color: severityColor }}>{ev.severity}</span>
                                {dateStr && <span className={`text-[9px] ${textMuted}`}>· {dateStr}</span>}
                                {ev.affected_population != null && ev.affected_population > 0 && (
                                  <span className={`text-[9px] ${textMuted}`}>
                                    · {ev.affected_population >= 1000
                                      ? `${Math.round(ev.affected_population / 1000)}K`
                                      : ev.affected_population} affected
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="lg:col-span-9">
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px] 3xl:h-[840px] 4xl:h-[1020px] 5xl:h-[1260px]">
              {/* Map — 7 columns */}
              <div className="col-span-7 flex h-full">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col`}
                >
                  <div
                    className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>
                        River Basin Map
                      </h3>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${criticalBasinCount > 0 ? "bg-red-500/20 text-red-500" : severeCount > 0 ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-500"}`}>
                      {criticalBasinCount > 0
                        ? `${criticalBasinCount} critical`
                        : severeCount > 0
                          ? `${severeCount} severe`
                          : "All normal"}
                    </span>
                  </div>
                  <div className="relative flex-1 flex flex-col min-h-0">
                    <div className="flex-1 relative min-h-0">
                      <FloodMap
                        isDarkMode={isDarkMode}
                        className="absolute inset-0 w-full h-full"
                        badgeText={`+${forecastStep}h Forecast`}
                        onLayerResolved={handleLayerResolved}
                        onBasinSelect={(name) => setSelectedBasin(name)}
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

              {/* Right column — KPI Categories (Human Impact / Infrastructure / Flood Metrics) */}
              <div className="col-span-5 flex flex-col gap-2 min-h-0">
                {/* ── 1. Human Impact ── */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="w-3.5 h-3.5 text-orange-400" />
                    <h3 className={`text-sm font-semibold ${headerText}`}>
                      Human Impact
                    </h3>
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-semibold">
                      {criticalBasins > 0
                        ? "HIGH RISK"
                        : severeCount > 0
                          ? "ELEVATED"
                          : "MONITORED"}
                    </span>
                  </div>

                  {/* Two stat tiles */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    <div className={`${rowBg} rounded-lg p-2`}>
                      <p
                        className={`text-[9px] uppercase tracking-wide ${textMuted} mb-0.5`}
                      >
                        Affected Population
                      </p>
                      <p className="text-xl font-black text-orange-400 leading-none">
                        {displayPopulation >= 1_000_000
                          ? `${(displayPopulation / 1_000_000).toFixed(1)}M`
                          : `${Math.round(displayPopulation / 1_000)}K`}
                      </p>
                      <p className={`text-[9px] ${textMuted} mt-0.5`}>
                        people at risk
                      </p>
                    </div>
                    <div className={`${rowBg} rounded-lg p-2`}>
                      <p
                        className={`text-[9px] uppercase tracking-wide ${textMuted} mb-0.5`}
                      >
                        Pop. Density
                      </p>
                      <p
                        className="text-xl font-black leading-none"
                        style={{ color: FAO_BLUE }}
                      >
                        {displayDensity}
                      </p>
                      <p className={`text-[9px] ${textMuted} mt-0.5`}>
                        avg/km² in flood zone
                      </p>
                    </div>
                  </div>

                  {/* District population bars — from live forecast impacts */}
                  <div className="space-y-1 mb-2">
                    <p
                      className={`text-[9px] uppercase tracking-wide font-semibold ${textMuted}`}
                    >
                      Districts at Risk
                    </p>
                    {liveDistrictsAtRisk.slice(0, 4).map((d, index) => {
                      const pop = d.population_affected ?? 0;
                      const maxPop = Math.max(
                        ...liveDistrictsAtRisk.map((x) => x.population_affected ?? 0),
                        1,
                      );
                      const barPct = (pop / maxPop) * 100;
                      const riskColor =
                        d.flood_risk_level === "critical"
                          ? "#ef4444"
                          : d.flood_risk_level === "high"
                            ? "#f97316"
                            : "#eab308";
                      return (
                        <div key={`${d.name}-${index}`} className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] w-[72px] truncate flex-shrink-0 ${textMuted}`}
                          >
                            {d.name}
                          </span>
                          <div
                            className="flex-1 h-1.5 rounded-full overflow-hidden"
                            style={{
                              background: isDarkMode ? "#1e293b" : "#f1f5f9",
                            }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${barPct}%`,
                                backgroundColor: riskColor,
                              }}
                            />
                          </div>
                          <span
                            className="text-[9px] w-10 text-right font-semibold flex-shrink-0"
                            style={{ color: riskColor }}
                          >
                            {pop >= 1000 ? `${Math.round(pop / 1000)}K` : pop}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Source reliability badge */}
                  <div
                    className={`flex items-center gap-1.5 pt-1.5 border-t ${borderColor}`}
                  >
                    <Shield className="w-3 h-3 text-green-400 flex-shrink-0" />
                    <span className={`text-[9px] ${textMuted}`}>Source:</span>
                    <span className="text-[9px] font-semibold text-green-400">
                      WorldPop 2024
                    </span>
                    <span className="ml-auto text-[8px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 font-semibold">
                      VERIFIED
                    </span>
                  </div>
                </div>

                {/* ── 2. Infrastructure ── */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-shrink-0`}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <h3 className={`text-sm font-semibold ${headerText}`}>
                      Infrastructure
                    </h3>
                  </div>

                  {/* Three stat tiles */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    <div className={`${rowBg} rounded-lg p-2`}>
                      <p
                        className={`text-[9px] uppercase tracking-wide ${textMuted} mb-0.5`}
                      >
                        Roads
                      </p>
                      <p className="text-lg font-black text-blue-400 leading-none">
                        {affectedRoadsKm.toLocaleString()}
                      </p>
                      <p className={`text-[9px] ${textMuted}`}>km at risk</p>
                    </div>
                    <div className={`${rowBg} rounded-lg p-2`}>
                      <p
                        className={`text-[9px] uppercase tracking-wide ${textMuted} mb-0.5`}
                      >
                        Buildings
                      </p>
                      <p className="text-lg font-black text-purple-400 leading-none">
                        {affectedBuildings >= 1000
                          ? `${(affectedBuildings / 1000).toFixed(1)}K`
                          : affectedBuildings.toLocaleString()}
                      </p>
                      <p className={`text-[9px] ${textMuted}`}>at risk</p>
                    </div>
                    <div className={`${rowBg} rounded-lg p-2`}>
                      <p
                        className={`text-[9px] uppercase tracking-wide ${textMuted} mb-0.5`}
                      >
                        POIs
                      </p>
                      <Navigation className="w-3 h-3 text-amber-400 mb-0.5" />
                      <p className="text-lg font-black text-amber-400 leading-none">
                        {affectedPois.toLocaleString()}
                      </p>
                      <p className={`text-[9px] ${textMuted}`}>at risk</p>
                    </div>
                  </div>

                  {/* Roads vs Buildings proportion bar */}
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[9px] text-blue-400 font-semibold">
                        Roads {affectedRoadsKm.toLocaleString()} km
                      </span>
                      <span className="text-[9px] text-purple-400 font-semibold">
                        Buildings {affectedBuildings.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 rounded-full flex overflow-hidden gap-px">
                      <div
                        className="h-full rounded-l-full bg-blue-500/70"
                        style={{ width: `${roadsBarPct}%` }}
                      />
                      <div
                        className="h-full rounded-r-full bg-purple-500/70"
                        style={{ width: `${buildingsBarPct}%` }}
                      />
                    </div>
                    <p className={`text-[8px] mt-0.5 ${textMuted}`}>
                      Relative infrastructure exposure
                    </p>
                  </div>
                </div>

                {/* ── 3. Flood Metrics ── */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1 min-h-0 flex flex-col`}
                >
                  <div className="flex items-center gap-1.5 mb-2 flex-shrink-0">
                    <Waves className="w-3.5 h-3.5 text-blue-400" />
                    <h3 className={`text-sm font-semibold ${headerText}`}>
                      Flood Metrics
                    </h3>
                  </div>

                  {/* Threshold alert indicator */}
                  <div
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-2 flex-shrink-0 ${thresholdMode === "EXCEEDED"
                      ? "bg-red-500/15"
                      : thresholdMode === "WARNING"
                        ? "bg-orange-500/15"
                        : "bg-green-500/15"
                      }`}
                  >
                    <AlertTriangle
                      className={`w-3.5 h-3.5 flex-shrink-0 ${thresholdMode === "EXCEEDED"
                        ? "text-red-400"
                        : thresholdMode === "WARNING"
                          ? "text-orange-400"
                          : "text-green-400"
                        }`}
                    />
                    <span
                      className={`text-xs font-bold ${thresholdMode === "EXCEEDED"
                        ? "text-red-400"
                        : thresholdMode === "WARNING"
                          ? "text-orange-400"
                          : "text-green-400"
                        }`}
                    >
                      Threshold {thresholdMode}
                    </span>
                    <span
                      className={`ml-auto text-[9px] font-medium ${textMuted}`}
                    >
                      {thresholdMode === "EXCEEDED"
                        ? `${criticalBasinCount} basin${criticalBasinCount !== 1 ? "s" : ""} exceeded`
                        : thresholdMode === "WARNING"
                          ? `${severeCount} severe · ${moderateCount} moderate`
                          : "All within safe range"}
                    </span>
                  </div>

                  {/* Discharge gauge meters */}
                  <div
                    className={`flex items-start justify-around pb-2 mb-2 border-b flex-shrink-0 ${borderColor}`}
                  >
                    <ArcGauge
                      value={maxDischarge}
                      max={5000}
                      label="Max Discharge"
                      unit="m³/s"
                      color="#ef4444"
                      isDarkMode={isDarkMode}
                    />
                    <div
                      className="w-px self-stretch"
                      style={{
                        backgroundColor: isDarkMode ? "#1e293b" : "#e2e8f0",
                      }}
                    />
                    <ArcGauge
                      value={avgDischarge}
                      max={5000}
                      label="Avg Discharge"
                      unit="m³/s"
                      color={FAO_BLUE}
                      isDarkMode={isDarkMode}
                    />
                    <div
                      className="w-px self-stretch"
                      style={{
                        backgroundColor: isDarkMode ? "#1e293b" : "#e2e8f0",
                      }}
                    />
                    <ArcGauge
                      value={parseFloat(currentLevel.toFixed(2))}
                      max={6}
                      label="Current Discharge Level"
                      unit="m"
                      color="#f97316"
                      isDarkMode={isDarkMode}
                    />
                  </div>

                  {/* Flood extent by basin (scrollable) — from live API basin impacts */}
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <p
                      className={`text-[9px] uppercase tracking-wide font-semibold ${textMuted} mb-1.5`}
                    >
                      Flood Extent by Basin
                    </p>
                    <div className="space-y-1.5">
                      {basinImpacts.length === 0 ? (
                        <p className={`text-[10px] ${textMuted}`}>No basin data available</p>
                      ) : basinImpacts.map((b, index) => {
                        const extent = Math.round(b.flood_extent_km2 ?? 0);
                        const maxExtent = Math.max(
                          ...basinImpacts.map((x) => Math.round(x.flood_extent_km2 ?? 0)),
                          1,
                        );
                        const extPct = (extent / maxExtent) * 100;
                        const discharge = b.max_discharge ?? 0;
                        const sc =
                          discharge > 3000 ? "#ef4444"
                            : discharge > 1000 ? "#f97316"
                              : discharge > 300 ? "#eab308"
                                : "#22c55e";
                        return (
                          <div
                            key={`${b.river_basin_name}-${index}`}
                            className="flex items-center gap-1.5"
                          >
                            <span
                              className={`text-[9px] w-[90px] truncate flex-shrink-0 ${textMuted}`}
                            >
                              {(b.river_basin_name ?? "").replace(" Basin", "")}
                            </span>
                            <div
                              className="flex-1 h-1.5 rounded-full overflow-hidden"
                              style={{
                                background: isDarkMode ? "#1e293b" : "#f1f5f9",
                              }}
                            >
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${extPct}%`,
                                  backgroundColor: sc,
                                }}
                              />
                            </div>
                            <span
                              className="text-[9px] w-16 text-right font-semibold flex-shrink-0"
                              style={{ color: sc }}
                            >
                              {extent.toLocaleString()} km²
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* About — full-width row below both sidebar and main content */}
        <div className="hidden lg:block mt-4">
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3
              className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}
            >
              <Info className="w-4 h-4" style={{ color: FAO_BLUE }} />
              About Flood Monitoring
            </h3>
            <p className={`text-xs ${textMuted} mb-2`}>
              Real-time monitoring of Uganda's major river basins with automated
              alerts when water levels exceed safe thresholds. Data is collected
              from multiple sensors and updated every 15 minutes.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div
                className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
              >
                <Droplets className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />{" "}
                Rainfall monitoring
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
              >
                <TrendingUp
                  className="w-3.5 h-3.5"
                  style={{ color: FAO_BLUE }}
                />{" "}
                Trend analysis
              </div>
              <div
                className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
              >
                <Waves className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />{" "}
                Flow discharge tracking
              </div>
            </div>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="block lg:hidden space-y-3">
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3.5 h-3.5 text-orange-400" />
              <h3 className={`text-sm font-semibold ${headerText}`}>
                Human Impact
              </h3>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-semibold">
                {criticalBasinCount > 0 ? "HIGH RISK" : severeCount > 0 ? "ELEVATED" : "MONITORED"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className={`${rowBg} rounded-lg p-2`}>
                <p className={`text-[9px] ${textMuted} mb-0.5`}>
                  Affected Population
                </p>
                <p className="text-xl font-black text-orange-400 leading-none">
                  {displayPopulation >= 1_000_000
                    ? `${(displayPopulation / 1_000_000).toFixed(1)}M`
                    : `${Math.round(displayPopulation / 1_000)}K`}
                </p>
                <p className={`text-[9px] ${textMuted} mt-0.5`}>people at risk</p>
              </div>
              <div className={`${rowBg} rounded-lg p-2`}>
                <p className={`text-[9px] ${textMuted} mb-0.5`}>Pop. Density</p>
                <p
                  className="text-xl font-black leading-none"
                  style={{ color: FAO_BLUE }}
                >
                  {displayDensity}/km²
                </p>
                <p className={`text-[9px] ${textMuted} mt-0.5`}>avg in flood zone</p>
              </div>
            </div>
            <div className="space-y-1">
              {liveDistrictsAtRisk.slice(0, 3).map((d, index) => {
                const pop = d.population_affected ?? 0;
                const maxPop = Math.max(
                  ...liveDistrictsAtRisk.map((x) => x.population_affected ?? 0),
                  1,
                );
                const riskColor =
                  d.flood_risk_level === "critical"
                    ? "#ef4444"
                    : d.flood_risk_level === "high"
                      ? "#f97316"
                      : "#eab308";
                return (
                  <div key={`${d.name}-${index}`} className="flex items-center gap-2">
                    <span className={`text-[9px] w-20 truncate ${textMuted}`}>
                      {d.name}
                    </span>
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: isDarkMode ? "#1e293b" : "#f1f5f9" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(pop / maxPop) * 100}%`,
                          backgroundColor: riskColor,
                        }}
                      />
                    </div>
                    <span className="text-[9px] w-10 text-right font-semibold flex-shrink-0" style={{ color: riskColor }}>
                      {pop >= 1000 ? `${Math.round(pop / 1000)}K` : pop}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Map (mobile) */}
          <div className="relative">
            <div
              className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm`}
            >
              <div
                className={`flex items-center justify-between p-2 border-b ${borderColor}`}
              >
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                  <h3 className={`text-sm font-semibold ${headerText}`}>
                    River Basin Map
                  </h3>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${criticalBasinCount > 0 ? "bg-red-500/20 text-red-500" : severeCount > 0 ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-500"}`}>
                  {criticalBasinCount > 0
                    ? `${criticalBasinCount} critical`
                    : severeCount > 0
                      ? `${severeCount} severe`
                      : "All normal"}
                </span>
              </div>
              <div className="relative aspect-video flex flex-col">
                <div className="flex-1 relative">
                  <FloodMap
                    isDarkMode={isDarkMode}
                    className="absolute inset-0 w-full h-full"
                    badgeText={`+${forecastStep}h`}
                    onLayerResolved={handleLayerResolved}
                    onBasinSelect={(name) => setSelectedBasin(name)}
                  />
                </div>
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <Filter className="w-4 h-4" />
                </button>
                <FloodHourSlider
                  isDarkMode={isDarkMode}
                  borderColor={borderColor}
                  textMuted={textMuted}
                />
              </div>
            </div>
            {showMobileFilters && (
              <>
                <div
                  className="fixed inset-0 z-[1002]"
                  onClick={() => setShowMobileFilters(false)}
                />
                <div
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-[1003] w-64 rounded-xl shadow-lg border p-3 max-h-[70vh] overflow-y-auto ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-xs font-semibold ${headerText}`}>
                      Filters
                    </h4>
                    <button
                      onClick={() => setShowMobileFilters(false)}
                      className={`p-1 rounded-md ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FilterContent
                    timeRange={timeRange}
                    setTimeRange={setTimeRange}
                    selectedBasin={selectedBasin}
                    setSelectedBasin={setSelectedBasin}
                    selectedLeadtime={selectedLeadtime}
                    setSelectedLeadtime={setSelectedLeadtime}
                    selectedDate={selectedDate}
                    setSelectedDate={setSelectedDate}
                    availableDates={availableDates}
                    availableBasinNames={availableBasinNames}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    textSecondary={textSecondary}
                    borderColor={borderColor}
                    headerText={headerText}
                    riverBasins={riverBasins}
                    totalPopulation={displayPopulation}
                    criticalCount={criticalBasinCount}
                    activeAlerts={criticalBasins + severeCount + moderateCount}
                  />
                </div>
              </>
            )}
          </div>

          {/* Infrastructure (mobile) */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <h3 className={`text-sm font-semibold ${headerText}`}>
                Infrastructure
              </h3>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                {
                  label: "Roads",
                  value: `${affectedRoadsKm.toLocaleString()} km`,
                  color: "text-blue-400",
                },
                {
                  label: "Buildings",
                  value: affectedBuildings >= 1000
                    ? `${(affectedBuildings / 1000).toFixed(1)}K`
                    : String(affectedBuildings),
                  color: "text-purple-400",
                },
                {
                  label: "POIs",
                  value: affectedPois.toLocaleString(),
                  color: "text-amber-400",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`${rowBg} rounded-lg p-2 text-center`}
                >
                  <p className={`text-base font-black leading-none ${s.color}`}>
                    {s.value}
                  </p>
                  <p className={`text-[9px] mt-0.5 ${textMuted}`}>{s.label}</p>
                </div>
              ))}
            </div>
            <div className="h-2 rounded-full flex overflow-hidden gap-px">
              <div className="h-full rounded-l-full bg-blue-500/70" style={{ width: `${roadsBarPct}%` }} />
              <div className="h-full rounded-r-full bg-purple-500/70" style={{ width: `${buildingsBarPct}%` }} />
            </div>
            <p className={`text-[8px] mt-0.5 ${textMuted}`}>Relative infrastructure exposure</p>
          </div>

          {/* Flood Metrics (mobile) */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <Waves className="w-3.5 h-3.5 text-blue-400" />
              <h3 className={`text-sm font-semibold ${headerText}`}>
                Flood Metrics
              </h3>
            </div>
            <div
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-2 ${thresholdMode === "EXCEEDED"
                ? "bg-red-500/15"
                : thresholdMode === "WARNING"
                  ? "bg-orange-500/15"
                  : "bg-green-500/15"
                }`}
            >
              <AlertTriangle
                className={`w-3.5 h-3.5 ${thresholdMode === "EXCEEDED"
                  ? "text-red-400"
                  : thresholdMode === "WARNING"
                    ? "text-orange-400"
                    : "text-green-400"
                  }`}
              />
              <span
                className={`text-xs font-bold ${thresholdMode === "EXCEEDED"
                  ? "text-red-400"
                  : thresholdMode === "WARNING"
                    ? "text-orange-400"
                    : "text-green-400"
                  }`}
              >
                Threshold {thresholdMode}
              </span>
            </div>
            <div className="flex justify-around">
              <ArcGauge
                value={maxDischarge}
                max={5000}
                label="Max Discharge"
                unit="m³/s"
                color="#ef4444"
                isDarkMode={isDarkMode}
              />
              <ArcGauge
                value={avgDischarge}
                max={5000}
                label="Avg Discharge"
                unit="m³/s"
                color={FAO_BLUE}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>

          {/* About (mobile) */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3
              className={`text-sm font-semibold mb-1.5 flex items-center gap-1.5 ${headerText}`}
            >
              <Info className="w-4 h-4" style={{ color: FAO_BLUE }} /> About
              Flood Monitoring
            </h3>
            <p className={`text-xs ${textMuted}`}>
              Real-time monitoring of Uganda's major river basins with automated
              alerts when water levels exceed safe thresholds. Updated every 15
              minutes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className={`mt-6 pt-4 border-t ${borderColor}`}>
          <div
            className={`flex flex-col md:flex-row items-center justify-between text-xs ${textMuted} gap-1`}
          >
            <p>© 2026 FAO Uganda. All Rights Reserved.</p>
            <span className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: FAO_BLUE }}
              />
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