import { useState, useEffect, useMemo } from "react";
import {
  Waves, MapPin, Download, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Info, Droplets, Filter, X, RefreshCw,
  Users, Building2, Shield, Navigation, Calendar, Clock,
  BarChart3, Activity, ChevronRight, Layers,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";
import FloodMonitorMap from "../components/map/FloodMonitorMap";
import { useFloodData } from "../hooks/useFloodData";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";
import type { FloodRasterLayer } from "@/services/api";
import type { ApiForecast, ApiDistrictFlood, ApiBasin } from "../hooks/useFloodData";

// ── Constants ─────────────────────────────────────────────────────────────────
const FAO_BLUE = "#318DDE";

const RISK_CFG = {
  critical: { label: "Critical", color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.35)"  },
  high:     { label: "High",     color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.35)" },
  medium:   { label: "Medium",   color: "#eab308", bg: "rgba(234,179,8,0.15)",  border: "rgba(234,179,8,0.35)"  },
  low:      { label: "Low",      color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.35)"  },
  none:     { label: "None",     color: "#64748b", bg: "rgba(100,116,139,0.1)", border: "rgba(100,116,139,0.2)" },
  extreme:  { label: "Extreme",  color: "#7c3aed", bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.35)" },
  severe:   { label: "Severe",   color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.35)"  },
  moderate: { label: "Moderate", color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.35)" },
  minor:    { label: "Minor",    color: "#eab308", bg: "rgba(234,179,8,0.15)",  border: "rgba(234,179,8,0.35)"  },
  normal:   { label: "Normal",   color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.35)"  },
} as const;

type RiskKey = keyof typeof RISK_CFG;
const riskCfg = (k?: string | null) => RISK_CFG[(k as RiskKey) ?? "none"] ?? RISK_CFG.none;

const fmt = {
  pop:  (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K` : String(n),
  km2:  (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(1)}K km²` : `${n.toFixed(0)} km²`,
  dis:  (n: number) => n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : `${Math.round(n)}`,
  date: (s: string) => { try { return new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); } catch { return s; } },
};

interface FloodMonitoringPageProps { isDarkMode?: boolean; }

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KpiTile({ icon: Icon, label, value, sub, color, isDarkMode, onClick, active }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: string; isDarkMode: boolean; onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex flex-col gap-1 p-2.5 rounded-xl text-left transition-all duration-150 w-full"
      style={{
        background: active
          ? isDarkMode ? `${color}22` : `${color}12`
          : isDarkMode ? "rgba(30,41,59,0.6)" : "rgba(248,250,252,0.9)",
        border: `1px solid ${active ? color + "55" : isDarkMode ? "#334155" : "#e2e8f0"}`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color }} />
        <span className="text-[10px] leading-none" style={{ color: isDarkMode ? "#94a3b8" : "#64748b" }}>{label}</span>
      </div>
      <span className="text-base font-extrabold leading-none" style={{ color: isDarkMode ? "#f1f5f9" : "#0f172a" }}>{value}</span>
      {sub && <span className="text-[9px] leading-none" style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>{sub}</span>}
    </button>
  );
}

// ── Arc Gauge ─────────────────────────────────────────────────────────────────
function ArcGauge({ value, max, label, unit, color, isDarkMode }: {
  value: number; max: number; label: string; unit: string; color: string; isDarkMode: boolean;
}) {
  const pct = Math.min(Math.max(value / (max || 1), 0), 1);
  const cx = 40, cy = 40, r = 28;
  const rad = (d: number) => (d * Math.PI) / 180;
  const pt  = (a: number) => ({ x: (cx + r * Math.cos(rad(a))).toFixed(2), y: (cy + r * Math.sin(rad(a))).toFixed(2) });
  const s   = pt(135); const e = pt(405); const fe = pt(135 + pct * 270);
  const bgArc   = `M ${s.x},${s.y} A ${r} ${r} 0 1 1 ${e.x},${e.y}`;
  const fillArc = pct < 0.01 ? "" : `M ${s.x},${s.y} A ${r} ${r} 0 ${pct * 270 > 180 ? 1 : 0} 1 ${fe.x},${fe.y}`;
  const display = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value).toString();
  return (
    <div className="flex flex-col items-center">
      <svg width="80" height="65" viewBox="0 0 80 65">
        <path d={bgArc} fill="none" strokeWidth="6" strokeLinecap="round" stroke={isDarkMode ? "#1e293b" : "#e2e8f0"} />
        {fillArc && <path d={fillArc} fill="none" strokeWidth="6" strokeLinecap="round" stroke={color} />}
        <text x="40" y="43" textAnchor="middle" fontSize="12" fontWeight="800" fill={isDarkMode ? "#f1f5f9" : "#0f172a"}>{display}</text>
        <text x="40" y="54" textAnchor="middle" fontSize="7.5" fill={isDarkMode ? "#64748b" : "#94a3b8"}>{unit}</text>
      </svg>
      <p className="text-[9px] font-medium text-center leading-tight" style={{ color: isDarkMode ? "#64748b" : "#94a3b8", marginTop: "-4px" }}>{label}</p>
    </div>
  );
}

// ── FloodMap wrapper ──────────────────────────────────────────────────────────
const FloodMap = ({ isDarkMode, className = "", badgeText = "Forecast", floodHoverData, onLayerResolved }: {
  isDarkMode: boolean; className?: string; badgeText?: string;
  floodHoverData?: import("@/types/data_types").FloodHoverData;
  onLayerResolved?: (layer: FloodRasterLayer | null) => void;
}) => (
  <FloodMonitorMap
    isDarkMode={isDarkMode}
    className={`rounded-lg md:rounded-xl ${className}`}
    badgeText={badgeText}
    legendTitle="Discharge (m³/s)"
    legendItems={[
      { label: "> 3000",      color: "#800026" }, { label: "1500–3000", color: "#bd0026" },
      { label: "700–1500",    color: "#f03b20" }, { label: "300–700",   color: "#253494" },
      { label: "100–300",     color: "#225ea8" }, { label: "50–100",    color: "#1d91c0" },
      { label: "20–50",       color: "#41b6c4" }, { label: "5–20",      color: "#7fcdbb" },
      { label: "1–5",         color: "#c7e9b4" }, { label: "< 1",       color: "#ffffcc" },
    ]}
    floodHoverData={floodHoverData}
    onLayerResolved={onLayerResolved}
  />
);

// ── FilterContent ─────────────────────────────────────────────────────────────
const FilterContent = ({
  leadtime, setLeadtime,
  selectedRisk, setSelectedRisk,
  selectedBasin, setSelectedBasin,
  isDarkMode, textMuted, borderColor, headerText,
  summary, basins, forecasts,
}: {
  leadtime: number; setLeadtime: (v: number) => void;
  selectedRisk: string; setSelectedRisk: (v: string) => void;
  selectedBasin: string; setSelectedBasin: (v: string) => void;
  isDarkMode: boolean; textMuted: string; borderColor: string; headerText: string;
  summary: ReturnType<typeof useFloodData>["summary"];
  basins: ApiBasin[];
  forecasts: ApiForecast[];
}) => {
  const uniqueBasins = useMemo(() => {
    const names = new Set<string>();
    forecasts.forEach(f => f.impacts.forEach(i => { if (i.river_basin_name) names.add(i.river_basin_name); }));
    basins.forEach(b => names.add(b.name));
    return Array.from(names).sort();
  }, [forecasts, basins]);

  const selectCls = `w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`;

  return (
    <div className="space-y-3">
      {/* Forecast lead-time */}
      <div>
        <label className={`text-xs ${textMuted} mb-1 block`}>Forecast Lead-time</label>
        <select value={leadtime} onChange={e => setLeadtime(Number(e.target.value))} className={selectCls}>
          {summary.forecastLeadtimes.length > 0
            ? summary.forecastLeadtimes.map(h => <option key={h} value={h}>{h}h — {new Date(Date.now() + h * 3600_000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</option>)
            : [24, 48, 72].map(h => <option key={h} value={h}>{h}h ahead</option>)
          }
        </select>
      </div>

      {/* Flood Risk Level */}
      <div>
        <label className={`text-xs ${textMuted} mb-1 block`}>Flood Risk Level</label>
        <select value={selectedRisk} onChange={e => setSelectedRisk(e.target.value)} className={selectCls}>
          <option value="">All Levels</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* River Basin */}
      <div>
        <label className={`text-xs ${textMuted} mb-1 block`}>River Basin</label>
        <select value={selectedBasin} onChange={e => setSelectedBasin(e.target.value)} className={selectCls}>
          <option value="">All Basins</option>
          {uniqueBasins.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Quick Stats */}
      <div className={`pt-3 border-t ${borderColor}`}>
        <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>Current Situation</h4>
        <div className="space-y-1.5">
          {[
            { label: "Critical Districts",   value: summary.criticalDistrictCount, color: "#ef4444" },
            { label: "High Risk Districts",  value: summary.highDistrictCount,     color: "#f97316" },
            { label: "Pop. at Risk",         value: fmt.pop(summary.totalAffectedPopulation), color: "#eab308" },
            { label: "Flood Extent",         value: fmt.km2(summary.totalFloodExtentKm2),     color: FAO_BLUE  },
            { label: "Roads Affected",       value: `${Math.round(summary.affectedRoadsKm).toLocaleString()} km`, color: "#a855f7" },
            { label: "Buildings Affected",   value: summary.affectedBuildingsCount.toLocaleString(),              color: "#06b6d4" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between text-xs">
              <span className={textMuted}>{label}</span>
              <span className="font-semibold" style={{ color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Forecast Row ──────────────────────────────────────────────────────────────
function ForecastRow({ fc, isDarkMode, textMuted, headerText, active, onClick }: {
  fc: ApiForecast; isDarkMode: boolean; textMuted: string; headerText: string; active: boolean; onClick: () => void;
}) {
  const cfg = riskCfg(fc.alert_level);
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-left"
      style={{ background: active ? cfg.bg : "transparent", border: `1px solid ${active ? cfg.border : "transparent"}` }}
    >
      <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[11px] font-semibold truncate ${headerText}`}>+{fc.leadtime_hours}h — {fmt.date(fc.valid_date)}</span>
          <span className="text-[9px] font-bold px-1 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] ${textMuted}`}>{fmt.pop(fc.total_affected_population)} pop</span>
          <span className="text-[10px]" style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>·</span>
          <span className={`text-[10px] ${textMuted}`}>{fmt.km2(fc.total_flood_extent_km2)}</span>
        </div>
      </div>
      <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: isDarkMode ? "#475569" : "#cbd5e1" }} />
    </button>
  );
}

// ── District Table ────────────────────────────────────────────────────────────
function DistrictTable({ districts, isDarkMode, textMuted, headerText, rowBg, selectedRisk, selectedBasin, forecasts }: {
  districts: ApiDistrictFlood[]; isDarkMode: boolean; textMuted: string;
  headerText: string; rowBg: string; selectedRisk: string; selectedBasin: string;
  forecasts: ApiForecast[];
}) {
  // Deduplicate: keep highest risk level per district
  const riskOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const distMap = new Map<string, ApiDistrictFlood>();
  for (const d of districts) {
    const ex = distMap.get(d.name);
    if (!ex || riskOrder[d.flood_risk_level] > riskOrder[ex.flood_risk_level]) distMap.set(d.name, d);
  }
  let rows = Array.from(distMap.values()).sort((a, b) => (riskOrder[b.flood_risk_level] ?? 0) - (riskOrder[a.flood_risk_level] ?? 0));

  if (selectedRisk) rows = rows.filter(d => d.flood_risk_level === selectedRisk);
  if (selectedBasin) {
    // Filter: keep districts whose max_discharge appears in impacts for selected basin
    const basinDistricts = new Set<string>();
    forecasts.forEach(f => f.impacts.forEach(i => { if (i.river_basin_name === selectedBasin && i.district_name) basinDistricts.add(i.district_name); }));
    rows = rows.filter(d => basinDistricts.has(d.name));
  }

  const thCls = `text-[10px] font-semibold px-2 py-1.5 text-left ${textMuted} uppercase tracking-wide`;
  const tdCls = `text-[11px] px-2 py-1.5`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className={rowBg}>
            <th className={thCls}>District</th>
            <th className={thCls}>Risk</th>
            <th className={thCls}>Population</th>
            <th className={thCls}>Extent</th>
            <th className={thCls}>Max Discharge</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className={`${tdCls} text-center py-6 ${textMuted}`}>No districts match the current filters</td></tr>
          ) : rows.map((d, i) => {
            const cfg = riskCfg(d.flood_risk_level);
            return (
              <tr key={`${d.id}-${i}`} className={`border-b transition-colors ${isDarkMode ? "border-slate-700/30 hover:bg-slate-700/20" : "border-slate-100 hover:bg-slate-50"}`}>
                <td className={`${tdCls} font-semibold ${headerText}`}>{d.name}</td>
                <td className={tdCls}>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                    {cfg.label}
                  </span>
                </td>
                <td className={`${tdCls} ${textMuted}`}>{fmt.pop(d.population_affected)}</td>
                <td className={`${tdCls} ${textMuted}`}>{d.flood_extent_km2.toFixed(0)} km²</td>
                <td className={`${tdCls} font-mono`} style={{ color: riskCfg(d.flood_risk_level).color }}>{d.max_discharge.toFixed(0)} m³/s</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Basin Cards ───────────────────────────────────────────────────────────────
function BasinCard({ basin, isDarkMode, headerText, textMuted }: {
  basin: ApiBasin; isDarkMode: boolean; headerText: string; textMuted: string;
}) {
  const cfg = riskCfg(basin.status);
  return (
    <div className="p-2.5 rounded-xl" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className={`text-[11px] font-bold leading-tight ${headerText}`}>{basin.name}</span>
        <span className="text-[9px] font-bold px-1 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: isDarkMode ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.6)", color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="text-center">
          <p className="text-[11px] font-extrabold" style={{ color: cfg.color }}>{basin.level.toFixed(1)}</p>
          <p className="text-[8px]" style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>level m</p>
        </div>
        <div className="text-center">
          <p className={`text-[11px] font-extrabold ${headerText}`}>{fmt.dis(basin.discharge_rate)}</p>
          <p className="text-[8px]" style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>m³/s</p>
        </div>
        <div className="text-center">
          <p className={`text-[11px] font-extrabold ${headerText}`}>{fmt.pop(basin.population_at_risk)}</p>
          <p className="text-[8px]" style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}>at risk</p>
        </div>
      </div>
    </div>
  );
}

// ── Season Badge ──────────────────────────────────────────────────────────────
function SeasonBadge({ name, type, isDarkMode }: { name: string; type: string; isDarkMode: boolean }) {
  const isRainy = type === "rainy";
  const color   = isRainy ? FAO_BLUE : "#f97316";
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
      style={{ background: `${color}18`, border: `1px solid ${color}33` }}>
      {isRainy ? <Droplets className="w-3 h-3 flex-shrink-0" style={{ color }} /> : <Activity className="w-3 h-3 flex-shrink-0" style={{ color }} />}
      <span className="text-[11px] font-semibold" style={{ color }}>{name}</span>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, isDarkMode, unit }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className={`px-2.5 py-1.5 rounded-lg shadow-lg border text-xs ${isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}>
      <p className="font-semibold mb-0.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value?.toLocaleString()} {unit ?? ""}</p>
      ))}
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FloodMonitoringPage({ isDarkMode = true }: FloodMonitoringPageProps) {
  const { dateRange, setDateRange, setLayerMode, forecastStep } = useAppStore(s => s);

  // UI state
  const [activeTab,          setActiveTab]          = useState<"overview" | "forecasts" | "districts" | "basins" | "events" | "seasons">("overview");
  const [showMobileFilters,  setShowMobileFilters]  = useState(false);
  const [selectedForecast,   setSelectedForecast]   = useState<ApiForecast | null>(null);
  const [leadtime,           setLeadtime]           = useState(24);
  const [selectedRisk,       setSelectedRisk]       = useState("");
  const [selectedBasin,      setSelectedBasin]      = useState("");
  const [selectedFloodLayer, setSelectedFloodLayer] = useState<FloodRasterLayer | null>(null);
  const [pageLoading,        setPageLoading]        = useState(true);

  // Data
  const { basins, actualEvents, forecasts, seasons, districts, summary, loading, error, refetch } = useFloodData();

  useEffect(() => { setLayerMode("forecast"); }, [setLayerMode]);

  // Auto-select first forecast & sync dateRange
  useEffect(() => {
    if (forecasts.length > 0 && !selectedForecast) {
      const first = forecasts.find(f => f.leadtime_hours === leadtime) ?? forecasts[0];
      setSelectedForecast(first);
      if (first?.forecast_date) setDateRange(first.forecast_date);
    }
  }, [forecasts, leadtime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync leadtime filter → selectedForecast
  useEffect(() => {
    if (forecasts.length > 0) {
      const match = forecasts.find(f => f.leadtime_hours === leadtime);
      if (match) { setSelectedForecast(match); setDateRange(match.forecast_date); }
    }
  }, [leadtime]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) { const t = setTimeout(() => setPageLoading(false), 200); return () => clearTimeout(t); }
  }, [loading]);

  const handleLayerResolved = (layer: FloodRasterLayer | null) => {
    setSelectedFloodLayer(prev => (prev?.layer_name === layer?.layer_name ? prev : layer));
  };

  // Derived
  const activeForecast = selectedForecast ?? forecasts[0];
  const currentSeason  = useMemo(() => {
    const month = new Date().getMonth() + 1;
    return seasons.find(s => {
      if (s.start_month <= s.end_month) return month >= s.start_month && month <= s.end_month;
      return month >= s.start_month || month <= s.end_month;
    }) ?? seasons[0];
  }, [seasons]);

  // Build discharge trend from active forecast basins
  const basinChartData = useMemo(() => {
    if (!activeForecast) return [];
    const basinImpacts = activeForecast.impacts.filter(i => i.river_basin_name).sort((a, b) => b.max_discharge - a.max_discharge).slice(0, 8);
    return basinImpacts.map(i => ({
      name: (i.river_basin_name ?? "").replace(" Basin", "").replace(" Nile", " N."),
      discharge: Math.round(i.avg_discharge),
      max: Math.round(i.max_discharge),
      extent: parseFloat(i.flood_extent_km2.toFixed(1)),
    }));
  }, [activeForecast]);

  // Forecast comparison chart (pop affected across leadtimes for same forecast_date)
  const leadtimeChartData = useMemo(() => {
    if (!forecasts.length) return [];
    const latest = forecasts[0].forecast_date;
    return forecasts
      .filter(f => f.forecast_date === latest)
      .sort((a, b) => a.leadtime_hours - b.leadtime_hours)
      .map(f => ({
        label:  `+${f.leadtime_hours}h`,
        pop:    f.total_affected_population,
        extent: Math.round(f.total_flood_extent_km2),
      }));
  }, [forecasts]);

  const floodHoverData = useMemo(() => ({
    basinStatus: basins.map(b => ({
      name: b.name, level: b.level, status: b.status as any,
      population_at_risk: b.population_at_risk, discharge_rate: b.discharge_rate,
    })),
    basinTrend: null,
    forecasts: [],
  }), [basins]);

  // Styling
  const cardBg        = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted     = isDarkMode ? "text-slate-400"  : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300"  : "text-slate-600";
  const borderColor   = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText    = isDarkMode ? "text-white"      : "text-slate-900";
  const rowBg         = isDarkMode ? "bg-slate-700/30" : "bg-slate-100";

  const filterProps = { leadtime, setLeadtime, selectedRisk, setSelectedRisk, selectedBasin, setSelectedBasin, isDarkMode, textMuted, borderColor, headerText, summary, basins, forecasts };

  const tabs = [
    { id: "overview"  as const, label: "Overview",    icon: Activity     },
    { id: "forecasts" as const, label: "Forecasts",   icon: TrendingUp   },
    { id: "districts" as const, label: "Districts",   icon: MapPin       },
    { id: "basins"    as const, label: "Basins",      icon: Waves        },
    { id: "events"    as const, label: "Events",      icon: AlertTriangle},
    { id: "seasons"   as const, label: "Seasons",     icon: Calendar     },
  ];

  // ── Loading screen ──────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }} />
          <p className={textMuted}>Loading Flood Monitor…</p>
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 3xl:p-8 4xl:p-10 min-h-screen">
      {/* Animated background waves */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="absolute w-full h-20 opacity-10"
              style={{ top: `${10 + i * 15}%`, background: `linear-gradient(90deg,transparent,${FAO_BLUE},transparent)`,
                animation: `wave ${4 + i * 0.5}s ease-in-out infinite`, animationDelay: `${i * 0.3}s` }} />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Error banner */}
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs text-amber-300 flex items-center gap-2"
            style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            Some data could not be loaded: {error}
          </div>
        )}

        {/* ── Header ── */}
        <div className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{ background: `linear-gradient(135deg,${FAO_BLUE}e6 0%,${FAO_BLUE}99 100%)` }}>
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-lg md:text-xl 3xl:text-2xl 4xl:text-3xl font-bold text-white">Flood Monitoring</h1>
                <p className="text-slate-200 text-xs md:text-sm">
                  Real-time GloFAS forecasts · {summary.latestForecastDate ? fmt.date(summary.latestForecastDate) : "—"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {summary.criticalDistrictCount > 0 && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(239,68,68,0.4)" }}>
                      <AlertTriangle className="w-3 h-3" />{summary.criticalDistrictCount} Critical
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    <Users className="w-3 h-3" />{fmt.pop(summary.totalAffectedPopulation)} at risk
                  </span>
                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                    <Layers className="w-3 h-3" />{fmt.km2(summary.totalFloodExtentKm2)}
                  </span>
                  {currentSeason && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
                      <Calendar className="w-3 h-3" />{currentSeason.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={refetch}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                  <RefreshCw className="w-3 h-3" /><span className="hidden sm:inline">Refresh</span>
                </button>
                <button className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                  style={{ backgroundColor: FAO_BLUE }}>
                  <Download className="w-3 h-3" /><span className="hidden sm:inline">Export</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
          {[
            { icon: AlertTriangle, label: "Critical Districts",  value: String(summary.criticalDistrictCount), sub: "districts", color: "#ef4444" },
            { icon: AlertTriangle, label: "High Risk",           value: String(summary.highDistrictCount),     sub: "districts", color: "#f97316" },
            { icon: Users,         label: "Pop. at Risk",        value: fmt.pop(summary.totalAffectedPopulation), sub: "people",    color: "#eab308" },
            { icon: Waves,         label: "Flood Extent",        value: fmt.km2(summary.totalFloodExtentKm2), sub: "area",       color: FAO_BLUE  },
            { icon: Navigation,   label: "Roads Affected",      value: `${Math.round(summary.affectedRoadsKm).toLocaleString()} km`, sub: "roads", color: "#a855f7" },
            { icon: Building2,    label: "Buildings",           value: summary.affectedBuildingsCount.toLocaleString(), sub: "structures", color: "#06b6d4" },
          ].map((t, i) => (
            <KpiTile key={i} {...t} isDarkMode={isDarkMode} />
          ))}
        </div>

        {/* ── DESKTOP ── */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">
          {/* Sidebar */}
          <div className="lg:col-span-3 flex flex-col gap-3">
            {/* Filter panel */}
            <div className="rounded-xl p-3 shadow-sm"
              style={{ background: isDarkMode ? `linear-gradient(180deg,${FAO_BLUE}30 0%,${FAO_BLUE}15 100%)` : `linear-gradient(180deg,${FAO_BLUE}15 0%,${FAO_BLUE}05 100%)`,
                border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}` }}>
              <div className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"} border ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}>
                <FilterContent {...filterProps} />
              </div>
            </div>

            {/* Current season */}
            {currentSeason && (
              <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                  <Calendar className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />Current Season
                </h4>
                <SeasonBadge name={currentSeason.name} type={currentSeason.season_type} isDarkMode={isDarkMode} />
                <p className={`text-[10px] mt-1.5 ${textMuted}`}>{currentSeason.description}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentSeason.primary_hazards.map(h => (
                    <span key={h} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${FAO_BLUE}18`, color: FAO_BLUE, border: `1px solid ${FAO_BLUE}33` }}>{h}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Recent events */}
            <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
              <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />Recent Events
              </h4>
              <div className="space-y-1.5">
                {actualEvents.slice(0, 4).map(ev => {
                  const cfg = riskCfg(ev.alert_level);
                  return (
                    <div key={ev.id} className="p-2 rounded-lg"
                      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-[10px] font-semibold truncate ${headerText}`}>{ev.name}</span>
                        <span className="text-[9px] font-bold flex-shrink-0" style={{ color: cfg.color }}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] ${textMuted}`}>{fmt.date(ev.start_date)}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded font-medium"
                          style={{ backgroundColor: isDarkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)", color: isDarkMode ? "#94a3b8" : "#64748b" }}>
                          {ev.event_type_display}
                        </span>
                      </div>
                      {ev.total_flood_extent_km2 > 0 && (
                        <p className={`text-[9px] mt-0.5 ${textMuted}`}>{fmt.pop(ev.total_affected_population)} affected · {fmt.km2(ev.total_flood_extent_km2)}</p>
                      )}
                    </div>
                  );
                })}
                {actualEvents.length === 0 && <p className={`text-[10px] ${textMuted}`}>No events recorded</p>}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="lg:col-span-9 space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                  style={{ backgroundColor: activeTab === id ? FAO_BLUE : isDarkMode ? "#1e293b" : "#f1f5f9",
                    color: activeTab === id ? "white" : isDarkMode ? "#94a3b8" : "#64748b" }}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW tab ── */}
            {activeTab === "overview" && (
              <div className="space-y-3">
                {/* Map + forecast list */}
                <div className="grid grid-cols-12 gap-3 h-[480px] xl:h-[540px] 2xl:h-[600px]">
                  {/* Map */}
                  <div className="col-span-8 flex h-full">
                    <div className={`${cardBg} border ${borderColor} rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col`}>
                      <div className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}>
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                          <h3 className={`text-sm font-semibold ${headerText}`}>Flood Forecast Map</h3>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{ ...riskCfg(summary.latestAlertLevel) as any,
                            backgroundColor: riskCfg(summary.latestAlertLevel).bg,
                            color: riskCfg(summary.latestAlertLevel).color }}>
                          {riskCfg(summary.latestAlertLevel).label}
                        </span>
                      </div>
                      <div className="relative flex-1 min-h-0">
                        <FloodMap isDarkMode={isDarkMode} className="absolute inset-0 w-full h-full"
                          badgeText={`+${leadtime}h Forecast`}
                          floodHoverData={floodHoverData}
                          onLayerResolved={handleLayerResolved} />
                      </div>
                    </div>
                  </div>

                  {/* Forecast list */}
                  <div className="col-span-4 h-full flex flex-col">
                    <div className={`${cardBg} border ${borderColor} rounded-xl shadow-sm flex-1 flex flex-col min-h-0`}>
                      <div className={`p-2.5 border-b ${borderColor} flex-shrink-0`}>
                        <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}>
                          <Clock className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />Forecasts
                        </h3>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                        {forecasts.map(fc => (
                          <ForecastRow key={fc.id} fc={fc} isDarkMode={isDarkMode} textMuted={textMuted}
                            headerText={headerText} active={selectedForecast?.id === fc.id}
                            onClick={() => { setSelectedForecast(fc); setLeadtime(fc.leadtime_hours); setDateRange(fc.forecast_date); }} />
                        ))}
                        {forecasts.length === 0 && <p className={`text-xs text-center py-4 ${textMuted}`}>No forecasts available</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Basin discharge chart */}
                  <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                    <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                      <BarChart3 className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />Basin Avg Discharge (m³/s)
                    </h4>
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={basinChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }} tickLine={false} axisLine={false} />
                          <RechartsTooltip content={<ChartTooltip isDarkMode={isDarkMode} unit="m³/s" />} />
                          <Bar dataKey="discharge" name="Avg" radius={[4, 4, 0, 0]}>
                            {basinChartData.map((_, i) => <Cell key={i} fill={FAO_BLUE} fillOpacity={0.85 - i * 0.07} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Lead-time comparison */}
                  <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                    <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                      <TrendingUp className="w-3.5 h-3.5 text-amber-500" />Pop. Affected by Lead-time
                    </h4>
                    <div style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={leadtimeChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ltGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#f97316" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={v => fmt.pop(v)} />
                          <RechartsTooltip content={<ChartTooltip isDarkMode={isDarkMode} />} />
                          <Area type="monotone" dataKey="pop" name="Population" stroke="#f97316" strokeWidth={2} fill="url(#ltGrad)" dot={{ r: 4, fill: "#f97316" }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* About */}
                <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                  <h4 className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                    <Info className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />About the Flood Monitoring System
                  </h4>
                  <p className={`text-xs ${textMuted} mb-2`}>
                    Flood forecasts are derived from the Global Flood Awareness System (GloFAS) and processed for Uganda's river basins across 24h, 48h and 72h lead times.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { icon: Waves,    label: "River Basins",    value: `${new Set(forecasts.flatMap(f => f.impacts.map(i => i.river_basin_name)).filter(Boolean)).size} tracked` },
                      { icon: MapPin,   label: "Districts",       value: `${new Set(forecasts.flatMap(f => f.impacts.map(i => i.district_name)).filter(Boolean)).size} monitored` },
                      { icon: Clock,    label: "Forecast Range",  value: `${Math.max(...(summary.forecastLeadtimes.length ? summary.forecastLeadtimes : [72]))}h max` },
                      { icon: Activity, label: "Data Source",     value: "GloFAS / FAO" },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className={`flex items-center gap-2 p-2 rounded-lg ${isDarkMode ? "bg-slate-700/30" : "bg-slate-50"}`}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: FAO_BLUE }} />
                        <div><p className={`text-[10px] ${textMuted}`}>{label}</p><p className={`text-xs font-semibold ${headerText}`}>{value}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── FORECASTS tab ── */}
            {activeTab === "forecasts" && (
              <div className="space-y-3">
                {forecasts.map(fc => {
                  const cfg = riskCfg(fc.alert_level);
                  const districtImpacts = fc.impacts.filter(i => i.district_name).sort((a, b) => b.affected_population - a.affected_population);
                  const basinImpacts    = fc.impacts.filter(i => i.river_basin_name).sort((a, b) => b.max_discharge - a.max_discharge);
                  return (
                    <div key={fc.id} className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold" style={{ color: cfg.color }}>+{fc.leadtime_hours}h</span>
                            <span className={`text-sm font-bold ${headerText}`}>Lead-time Forecast</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-xs ${textMuted}`}>
                              <Calendar className="w-3 h-3 inline mr-0.5" />{fmt.date(fc.forecast_date)} → {fmt.date(fc.valid_date)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <p className="text-xs font-bold" style={{ color: cfg.color }}>{fmt.pop(fc.total_affected_population)}</p>
                            <p className={`text-[10px] ${textMuted}`}>affected</p>
                          </div>
                          <span className="text-xs font-bold px-2 py-1 rounded-full"
                            style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                        </div>
                      </div>

                      {/* Summary gauges */}
                      <div className="grid grid-cols-4 gap-2 mb-2 p-2 rounded-lg" style={{ background: isDarkMode ? "rgba(30,41,59,0.5)" : "rgba(248,250,252,0.8)" }}>
                        <ArcGauge value={fc.total_affected_population / 1000} max={2000} label="Pop (K)" unit="K"  color={cfg.color}   isDarkMode={isDarkMode} />
                        <ArcGauge value={fc.total_flood_extent_km2}           max={25000} label="Extent" unit="km²" color={FAO_BLUE}    isDarkMode={isDarkMode} />
                        <ArcGauge value={basinImpacts[0]?.max_discharge ?? 0} max={6000}  label="Peak Q"  unit="m³/s" color="#a855f7" isDarkMode={isDarkMode} />
                        <ArcGauge value={districtImpacts.reduce((s, i) => s + i.affected_roads_km, 0)} max={10000} label="Roads" unit="km" color="#06b6d4" isDarkMode={isDarkMode} />
                      </div>

                      {/* Top districts */}
                      {districtImpacts.length > 0 && (
                        <div>
                          <p className={`text-[10px] font-semibold mb-1 ${textMuted} uppercase tracking-wide`}>Top Affected Districts</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                            {districtImpacts.slice(0, 6).map(i => (
                              <div key={i.id} className="px-2 py-1.5 rounded-lg flex items-center justify-between gap-1"
                                style={{ background: isDarkMode ? "rgba(30,41,59,0.5)" : "rgba(248,250,252,0.9)", border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}` }}>
                                <span className={`text-[10px] font-medium truncate ${headerText}`}>{i.district_name}</span>
                                <span className={`text-[10px] ${textMuted} flex-shrink-0`}>{fmt.pop(i.affected_population)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── DISTRICTS tab ── */}
            {activeTab === "districts" && (
              <div className={`${cardBg} border ${borderColor} rounded-xl shadow-sm`}>
                <div className={`flex items-center justify-between p-3 border-b ${borderColor}`}>
                  <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}>
                    <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />Affected Districts
                  </h3>
                  <span className={`text-xs ${textMuted}`}>{districts.length} records</span>
                </div>
                <DistrictTable districts={districts} isDarkMode={isDarkMode} textMuted={textMuted}
                  headerText={headerText} rowBg={rowBg} selectedRisk={selectedRisk}
                  selectedBasin={selectedBasin} forecasts={forecasts} />
              </div>
            )}

            {/* ── BASINS tab ── */}
            {activeTab === "basins" && (
              <div className="space-y-3">
                <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                  <h3 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${headerText}`}>
                    <Waves className="w-4 h-4" style={{ color: FAO_BLUE }} />River Basin Status
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                    {basins.map((b, i) => (
                      <BasinCard key={`${b.name}-${i}`} basin={b} isDarkMode={isDarkMode} headerText={headerText} textMuted={textMuted} />
                    ))}
                    {basins.length === 0 && <p className={`text-xs ${textMuted} col-span-4 py-6 text-center`}>No basin data available</p>}
                  </div>
                </div>
                {/* Basin forecast impacts from active forecast */}
                {activeForecast && (
                  <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                    <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Basin Forecast Impacts — +{activeForecast.leadtime_hours}h</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className={rowBg}>
                            {["Basin", "Extent (km²)", "Avg Q (m³/s)", "Max Q (m³/s)", "Roads (km)", "Buildings"].map(h => (
                              <th key={h} className={`text-[10px] font-semibold px-2 py-1.5 text-left ${textMuted} uppercase tracking-wide`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeForecast.impacts.filter(i => i.river_basin_name).sort((a, b) => b.max_discharge - a.max_discharge).map(i => (
                            <tr key={i.id} className={`border-b ${isDarkMode ? "border-slate-700/30 hover:bg-slate-700/20" : "border-slate-100 hover:bg-slate-50"}`}>
                              <td className={`text-[11px] px-2 py-1.5 font-semibold ${headerText}`}>{i.river_basin_name}</td>
                              <td className={`text-[11px] px-2 py-1.5 ${textMuted}`}>{i.flood_extent_km2.toFixed(0)}</td>
                              <td className={`text-[11px] px-2 py-1.5 ${textMuted}`}>{i.avg_discharge.toFixed(0)}</td>
                              <td className="text-[11px] px-2 py-1.5 font-mono font-bold" style={{ color: FAO_BLUE }}>{i.max_discharge.toFixed(0)}</td>
                              <td className={`text-[11px] px-2 py-1.5 ${textMuted}`}>{i.affected_roads_km.toFixed(0)}</td>
                              <td className={`text-[11px] px-2 py-1.5 ${textMuted}`}>{i.affected_buildings_count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── EVENTS tab ── */}
            {activeTab === "events" && (
              <div className="space-y-2">
                {actualEvents.map(ev => {
                  const cfg = riskCfg(ev.alert_level);
                  return (
                    <div key={ev.id} className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold truncate" style={{ color: cfg.color }}>{ev.name}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium`}
                              style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isDarkMode ? "bg-slate-700/40 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                              {ev.event_type_display}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isDarkMode ? "bg-slate-700/40 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                              {ev.status_display}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            <span className={`text-[10px] flex items-center gap-1 ${textMuted}`}><Calendar className="w-3 h-3" />{fmt.date(ev.start_date)}</span>
                            <span className={`text-[10px] flex items-center gap-1 ${textMuted}`}><Shield className="w-3 h-3" />Reliability {ev.reliability_score}/10</span>
                            <span className={`text-[10px] ${textMuted}`}>{ev.data_source}</span>
                          </div>
                        </div>
                        {ev.total_flood_extent_km2 > 0 && (
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-extrabold ${headerText}`}>{fmt.pop(ev.total_affected_population)}</p>
                            <p className={`text-[10px] ${textMuted}`}>affected</p>
                            <p className={`text-xs font-semibold ${textMuted}`}>{fmt.km2(ev.total_flood_extent_km2)}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 pt-2" style={{ borderTop: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}` }}>
                        {[
                          { label: "Downloaded",       ok: ev.downloaded        },
                          { label: "Processed",        ok: ev.processed         },
                          { label: "On GeoServer",     ok: ev.uploaded_to_geoserver },
                        ].map(({ label, ok }) => (
                          <span key={label} className={`text-[9px] flex items-center gap-0.5 font-medium ${ok ? "text-green-500" : textMuted}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-green-500" : "bg-slate-500"}`} />{label}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {actualEvents.length === 0 && (
                  <div className={`${cardBg} border ${borderColor} rounded-xl p-8 text-center`}>
                    <p className={`text-sm ${textMuted}`}>No flood events recorded</p>
                  </div>
                )}
              </div>
            )}

            {/* ── SEASONS tab ── */}
            {activeTab === "seasons" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {seasons.map(s => {
                  const isRainy  = s.season_type === "rainy";
                  const color    = isRainy ? FAO_BLUE : "#f97316";
                  const isCurrent = currentSeason?.id === s.id;
                  return (
                    <div key={s.id} className={`${cardBg} rounded-xl p-3 shadow-sm`}
                      style={{ border: `${isCurrent ? "2px" : "1px"} solid ${isCurrent ? color : isDarkMode ? "#334155" : "#e2e8f0"}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className={`text-sm font-bold ${headerText}`}>{s.name}</h4>
                            {isCurrent && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold text-white" style={{ backgroundColor: color }}>CURRENT</span>}
                          </div>
                          <p className={`text-[10px] mt-0.5 ${textMuted}`}>{s.season_type_display} · {s.analysis_frequency_display}</p>
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${color}20` }}>
                          {isRainy ? <Droplets className="w-4 h-4" style={{ color }} /> : <Activity className="w-4 h-4" style={{ color }} />}
                        </div>
                      </div>
                      <p className={`text-[11px] ${textMuted} mb-2`}>{s.description}</p>
                      <div className="space-y-1.5">
                        <div>
                          <p className={`text-[9px] uppercase font-semibold ${textMuted} mb-1`}>Primary Hazards</p>
                          <div className="flex flex-wrap gap-1">
                            {s.primary_hazards.map(h => (
                              <span key={h} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}33` }}>{h}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className={`text-[9px] uppercase font-semibold ${textMuted} mb-1`}>Affected Regions</p>
                          <div className="flex flex-wrap gap-1">
                            {s.affected_regions.map(r => (
                              <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: isDarkMode ? "rgba(51,65,85,0.6)" : "#f1f5f9",
                                  color: isDarkMode ? "#94a3b8" : "#64748b", border: `1px solid ${isDarkMode ? "#334155" : "#e2e8f0"}` }}>{r}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── MOBILE ── */}
        <div className="block lg:hidden space-y-3">
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: AlertTriangle, label: "Critical",    value: String(summary.criticalDistrictCount), color: "#ef4444" },
              { icon: Users,         label: "At Risk",     value: fmt.pop(summary.totalAffectedPopulation), color: "#eab308" },
              { icon: Waves,         label: "Flood Area",  value: fmt.km2(summary.totalFloodExtentKm2), color: FAO_BLUE },
              { icon: Building2,    label: "Buildings",   value: summary.affectedBuildingsCount.toLocaleString(), color: "#06b6d4" },
            ].map((t, i) => <KpiTile key={i} {...t} isDarkMode={isDarkMode} />)}
          </div>

          {/* Map */}
          <div className={`${cardBg} border ${borderColor} rounded-xl overflow-hidden shadow-sm`}>
            <div className={`flex items-center justify-between p-2 border-b ${borderColor}`}>
              <h3 className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}>
                <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />Flood Map
              </h3>
              <button onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: FAO_BLUE }}>
                <Filter className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="aspect-video relative">
              <FloodMap isDarkMode={isDarkMode} className="absolute inset-0 w-full h-full"
                badgeText={`+${leadtime}h`} floodHoverData={floodHoverData} onLayerResolved={handleLayerResolved} />
            </div>
            <FloodHourSlider isDarkMode={isDarkMode} borderColor={borderColor} textMuted={textMuted} />
          </div>

          {/* Mobile filter popup */}
          {showMobileFilters && (
            <>
              <div className="fixed inset-0 z-[1002]" onClick={() => setShowMobileFilters(false)} />
              <div className={`fixed right-3 top-24 z-[1003] w-64 rounded-xl shadow-xl border p-3 max-h-[70vh] overflow-y-auto
                ${isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className={`text-xs font-semibold ${headerText}`}>Filters</h4>
                  <button onClick={() => setShowMobileFilters(false)} className={`p-1 rounded ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <FilterContent {...filterProps} />
              </div>
            </>
          )}

          {/* Forecasts list */}
          <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Forecasts</h3>
            <div className="space-y-1">
              {forecasts.map(fc => (
                <ForecastRow key={fc.id} fc={fc} isDarkMode={isDarkMode} textMuted={textMuted}
                  headerText={headerText} active={selectedForecast?.id === fc.id}
                  onClick={() => { setSelectedForecast(fc); setLeadtime(fc.leadtime_hours); setDateRange(fc.forecast_date); }} />
              ))}
            </div>
          </div>

          {/* Districts table */}
          <div className={`${cardBg} border ${borderColor} rounded-xl shadow-sm`}>
            <div className={`p-3 border-b ${borderColor}`}>
              <h3 className={`text-sm font-semibold ${headerText}`}>Affected Districts</h3>
            </div>
            <DistrictTable districts={districts} isDarkMode={isDarkMode} textMuted={textMuted}
              headerText={headerText} rowBg={rowBg} selectedRisk={selectedRisk}
              selectedBasin={selectedBasin} forecasts={forecasts} />
          </div>

          {/* Basin cards */}
          {basins.length > 0 && (
            <div className={`${cardBg} border ${borderColor} rounded-xl p-3 shadow-sm`}>
              <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>River Basins</h3>
              <div className="grid grid-cols-2 gap-2">
                {basins.slice(0, 6).map((b, i) => (
                  <BasinCard key={`${b.name}-${i}`} basin={b} isDarkMode={isDarkMode} headerText={headerText} textMuted={textMuted} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className={`mt-6 pt-4 border-t ${borderColor}`}>
          <div className={`flex flex-col md:flex-row items-center justify-between text-xs ${textMuted} gap-1`}>
            <p>© 2025 FAO Uganda. All Rights Reserved.</p>
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: FAO_BLUE }} />
              {summary.latestForecastDate ? `Last forecast: ${fmt.date(summary.latestForecastDate)}` : "Flood System Operational"}
            </span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes wave { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(100%)} }
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .animate-fade-in-up { animation:fadeInUp 0.4s ease-out forwards }
      `}</style>
    </div>
  );
}