import { useState, useEffect, useRef } from "react";
import {
  Radio,
  MapPin,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  Thermometer,
  Wind,
  Gauge,
  CloudRain,
  // AlertTriangle,
  Info,
  BarChart3,
  Filter,
  X,
  Droplets,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import WeatherStationsMap from "../components/map/WeatherStationsMap";
import type { WeatherStation } from "../components/map/WeatherStationsMap";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useQuery } from "@tanstack/react-query";
import { stationsAPI } from "@/services/api";
import type { WeatherStationAPI } from "@/services/api";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------
interface WeatherStationsPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

type ActiveParamKey = "temperature" | "humidity" | "wind_speed" | "pressure" | "rainfall";
type ActiveParams = Set<ActiveParamKey>;

const PARAM_META = [
  { key: "temperature" as const, label: "Temperature", unit: "°C",   color: "#f97316", Icon: Thermometer },
  { key: "humidity"    as const, label: "Humidity",    unit: "%",    color: "#22c55e", Icon: Droplets    },
  { key: "wind_speed"  as const, label: "Wind Speed",  unit: "km/h", color: "#3b82f6", Icon: Wind        },
  { key: "pressure"    as const, label: "Pressure",    unit: "hPa",  color: "#a855f7", Icon: Gauge       },
  { key: "rainfall"    as const, label: "Rainfall",    unit: "mm",   color: "#06b6d4", Icon: CloudRain   },
];

const stationTabs = [
  { id: "all",      label: "All Stations",    icon: Radio         },
  // { id: "readings", label: "Recent Readings", icon: BarChart3     },
  // { id: "alerts",   label: "Alerts",          icon: AlertTriangle },
];

// ---------------------------------------------------------------------------
// Helper: map WeatherStationAPI → WeatherStation (map component shape)
// ---------------------------------------------------------------------------
function toMapStation(s: WeatherStationAPI): WeatherStation {
  return {
    id:     String(s.id),
    code:   s.code,
    name:   s.name,
    region: s.region,
    status: s.status,
    lat:    s.lat,
    lng:    s.lon,
    signal: s.signal_pct,
  };
}

// ---------------------------------------------------------------------------
// Normalised reading shape
// ---------------------------------------------------------------------------
interface NormalizedReading {
  timestamp:      string;
  temperature:    number;
  humidity:       number;
  wind_speed:     number;
  wind_direction: number;
  pressure:       number;
  rainfall:       number;
}

function normaliseReading(r: any): NormalizedReading {
  return {
    timestamp:     r.timestamp ?? r.recorded_at ?? r.time ?? "",
    temperature:   r.temperature_c      ?? r.temperature   ?? r.temp_c            ?? r.temp   ?? 0,
    humidity:      r.humidity_pct       ?? r.humidity       ?? r.relative_humidity ?? 0,
    wind_speed:    r.wind_speed_kmh     ?? r.wind_speed     ?? r.windspeed_kmh     ?? 0,
    wind_direction:r.wind_direction_deg ?? r.wind_direction ?? r.wind_dir_deg      ?? 0,
    pressure:      r.pressure_hpa       ?? r.pressure       ?? r.air_pressure_hpa  ?? 0,
    rainfall:      r.rainfall_mm        ?? r.rainfall       ?? r.precipitation_mm  ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Deterministic mock readings (fallback when API returns nothing)
// ---------------------------------------------------------------------------
function generateMockReadings(station: WeatherStation | null): NormalizedReading[] {
  if (!station) return [];
  const list: NormalizedReading[] = [];
  const now  = new Date();
  const hash = (str: string) => {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h);
  };
  const seed        = hash(station.name || String(station.id));
  const baseTemp    = 20 + (seed % 8);
  const baseHumid   = 60 + (seed % 20);
  const basePres    = 1008 + (seed % 8);
  const baseWind    = 4  + (seed % 10);

  for (let i = 30; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    const ds   = seed + i;
    list.push({
      timestamp:     date.toISOString(),
      temperature:   parseFloat((baseTemp  + Math.sin(i * 0.2) * 3 + ((ds % 5) - 2)).toFixed(1)),
      humidity:      Math.min(100, Math.max(0, Math.round(baseHumid + Math.cos(i * 0.25) * 10 + ((ds % 8) - 4)))),
      wind_speed:    parseFloat(Math.max(0, baseWind + Math.cos(i * 0.3) * 4 + ((ds % 6) - 3)).toFixed(1)),
      wind_direction:Math.round(180 + (ds % 12) * 15) % 360,
      pressure:      Math.round(basePres + Math.sin(i * 0.15) * 2 + ((ds % 4) - 2)),
      rainfall:      ds % 8 === 0 ? parseFloat(((ds % 8) * 1.2).toFixed(1)) : 0,
    });
  }
  return list;
}

// ---------------------------------------------------------------------------
// FilterContent
// ---------------------------------------------------------------------------
const FilterContent = ({
  selectedStationCode, setSelectedStationCode,
  selectedStatus,      setSelectedStatus,
  activeParams,        setActiveParams,
  isDarkMode, textMuted, borderColor, headerText,
  onlineCount, offlineCount, maintenanceCount, totalCount,
  stations_list,
}: {
  selectedStationCode: string; setSelectedStationCode: (v: string) => void;
  selectedStatus:      string; setSelectedStatus:      (v: string) => void;
  activeParams:   ActiveParams; setActiveParams: React.Dispatch<React.SetStateAction<ActiveParams>>;
  isDarkMode: boolean; textMuted: string; borderColor: string; headerText: string;
  onlineCount: number; offlineCount: number; maintenanceCount: number; totalCount: number;
  stations_list: WeatherStation[];
}) => (
  <div className="space-y-3">
    {/* Weather Station selector */}
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Weather Station</label>
      <select
        value={selectedStationCode}
        onChange={(e) => setSelectedStationCode(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${
          isDarkMode
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <option value="">All Stations</option>
        {stations_list.map((s) => (
          <option key={s.id} value={s.code}>
            {s.name}
          </option>
        ))}
      </select>
    </div>

    {/* Status selector */}
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Status</label>
      <select
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${
          isDarkMode
            ? "bg-slate-700 border-slate-600 text-white"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        <option value="">All Status ({totalCount})</option>
        <option value="online">Online ({onlineCount})</option>
        <option value="maintenance">Maintenance ({maintenanceCount})</option>
        <option value="offline">Offline ({offlineCount})</option>
      </select>
    </div>

    {/* Parameter checkboxes */}
    <div>
      <label className={`text-xs ${textMuted} mb-1.5 block`}>Parameters</label>
      <div className="space-y-1">
        {PARAM_META.map((p) => {
          const checked = activeParams.has(p.key);
          const Icon    = p.Icon;
          return (
            <button
              key={p.key} type="button"
              onClick={() =>
                setActiveParams((prev) => {
                  const next = new Set(prev) as ActiveParams;
                  checked ? next.delete(p.key) : next.add(p.key);
                  return next;
                })
              }
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all"
              style={{
                backgroundColor: checked ? `${p.color}18` : "transparent",
                border: `1px solid ${checked ? p.color + "55" : isDarkMode ? "#334155" : "#e2e8f0"}`,
              }}
            >
              <div
                className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  backgroundColor: checked ? p.color : "transparent",
                  border: `1.5px solid ${checked ? p.color : isDarkMode ? "#475569" : "#cbd5e1"}`,
                }}
              >
                {checked && (
                  <svg className="w-2 h-2 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <Icon className="w-3 h-3 flex-shrink-0" style={{ color: isDarkMode ? "#94a3b8" : "#64748b" }} />
              <span style={{ color: isDarkMode ? "#cbd5e1" : "#374151" }}>{p.label}</span>
            </button>
          );
        })}
      </div>
    </div>

    {/* Network stats */}
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>Network Stats</h4>
      <div className="space-y-1.5">
        {[
          { label: "Total Stations",  value: totalCount,        color: undefined             },
          { label: "Online",          value: onlineCount,       color: "text-green-500"      },
          { label: "Maintenance",     value: maintenanceCount,  color: "text-yellow-500"     },
          { label: "Offline",         value: offlineCount,      color: "text-red-500"        },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-xs">
            <span className={textMuted}>{label}</span>
            <span className={`font-medium ${color ?? headerText}`}>{value}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Data Quality</span>
          <span className="font-medium" style={{ color: FAO_BLUE }}>94%</span>
        </div>
      </div>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// CustomTooltip
// ---------------------------------------------------------------------------
const CustomTooltip = ({
  active, payload, label, isDarkMode, color, unit, labelName,
}: {
  active?: boolean; payload?: any[]; label?: string;
  isDarkMode: boolean; color: string; unit: string; labelName: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={`px-2.5 py-1.5 rounded-lg shadow-lg border text-xs ${
        isDarkMode
          ? "bg-slate-800 border-slate-700 text-white"
          : "bg-white border-slate-200 text-slate-800"
      }`}
    >
      <p className="font-semibold mb-0.5">{label}</p>
      <p style={{ color }}>
        {labelName}: {payload[0].value} {unit}
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// StationReadingsPanel
// ---------------------------------------------------------------------------
const StationReadingsPanel = ({
  selectedStation, stationCode,
  readings, isLoading,
  activeParameter, onChangeParameter,
  activeParams,
  isDarkMode, headerText, textMuted, textSecondary,
}: {
  selectedStation:   WeatherStation | null;
  stationCode?:      string;
  readings:          NormalizedReading[];
  isLoading:         boolean;
  activeParameter:   ActiveParamKey;
  onChangeParameter: (p: ActiveParamKey) => void;
  activeParams:      ActiveParams;
  isDarkMode:        boolean;
  cardBg:            string;
  borderColor:       string;
  headerText:        string;
  textMuted:         string;
  textSecondary:     string;
}) => {
  const latest = readings[readings.length - 1] || {};

  const allParams = [
    { key: "temperature" as const, label: "Temperature", unit: "°C",   color: "#f97316", icon: Thermometer, value: latest.temperature != null ? `${Number(latest.temperature).toFixed(1)}°C` : "—" },
    { key: "humidity"    as const, label: "Humidity",    unit: "%",    color: "#22c55e", icon: Droplets,    value: latest.humidity     != null ? `${Number(latest.humidity).toFixed(0)}%`    : "—" },
    { key: "wind_speed"  as const, label: "Wind Speed",  unit: "km/h", color: "#3b82f6", icon: Wind,        value: latest.wind_speed   != null ? `${Number(latest.wind_speed).toFixed(1)}`   : "—" },
    { key: "pressure"    as const, label: "Pressure",    unit: "hPa",  color: "#a855f7", icon: Gauge,       value: latest.pressure     != null ? `${Math.round(latest.pressure)} hPa`        : "—" },
    { key: "rainfall"    as const, label: "Rainfall",    unit: "mm",   color: "#06b6d4", icon: CloudRain,   value: latest.rainfall     != null ? `${Number(latest.rainfall).toFixed(1)} mm`  : "—" },
  ];
  const visibleParams = allParams.filter((p) => activeParams.has(p.key));

  const cfg: Record<ActiveParamKey, { label: string; unit: string; color: string }> = {
    temperature: { label: "Temperature", unit: "°C",   color: "#f97316" },
    humidity:    { label: "Humidity",    unit: "%",    color: "#22c55e" },
    wind_speed:  { label: "Wind Speed",  unit: "km/h", color: "#3b82f6" },
    pressure:    { label: "Pressure",    unit: "hPa",  color: "#a855f7" },
    rainfall:    { label: "Rainfall",    unit: "mm",   color: "#06b6d4" },
  };
  const active = cfg[activeParameter];
  const vals   = readings.map((r) => r[activeParameter] ?? 0);
  const minVal = vals.length ? Math.min(...vals) : 0;
  const maxVal = vals.length ? Math.max(...vals) : 0;

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const isSingleDay = (() => {
    if (readings.length < 2) return true;
    return (
      new Date(readings[0].timestamp).toDateString() ===
      new Date(readings[readings.length - 1].timestamp).toDateString()
    );
  })();

  const fmt = (ts: string) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return isSingleDay
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  };

  const periodLabel = (() => {
    if (!readings.length) return "N/A";
    const months = [...new Set(readings.map((r) => MONTHS[new Date(r.timestamp).getMonth()]))];
    const year   = new Date(readings[0].timestamp).getFullYear();
    return months.length === 1
      ? `${months[0]} ${year}`
      : `${months[0]} – ${months[months.length - 1]} ${year}`;
  })();

  const chartData = (() => {
    const raw = readings.map((r) => ({
      label:   fmt(r.timestamp),
      dateKey: new Date(r.timestamp).toDateString(),
      value:   r[activeParameter] ?? 0,
    }));
    if (raw.length <= 60 || isSingleDay) return raw;
    const byDay = new Map<string, { label: string; values: number[] }>();
    raw.forEach(({ dateKey, label, value }) => {
      if (!byDay.has(dateKey)) byDay.set(dateKey, { label, values: [] });
      byDay.get(dateKey)!.values.push(value);
    });
    return Array.from(byDay.values()).map(({ label, values }) => ({
      label,
      value: parseFloat((values.reduce((s, v) => s + v, 0) / values.length).toFixed(2)),
    }));
  })();

  const statusDot = (s: string) =>
    ({ online: "bg-green-500", maintenance: "bg-yellow-500", offline: "bg-red-500" }[s] ?? "bg-slate-400");
  const statusBadge = (s: string) =>
    ({
      online:      "bg-green-500/20 text-green-400",
      maintenance: "bg-yellow-500/20 text-yellow-400",
      offline:     "bg-red-500/20 text-red-400",
    }[s] ?? "bg-slate-500/20 text-slate-400");
  const shortLabel = (s: string) =>
    s.replace("Temperature","Temp").replace("Humidity","Humid")
     .replace("Wind Speed","Wind").replace("Pressure","Press").replace("Rainfall","Rain");

  return (
    <div
      className="h-full rounded-xl p-3 shadow-sm flex flex-col"
      style={{
        background: isDarkMode
          ? `linear-gradient(180deg,${FAO_BLUE}30 0%,${FAO_BLUE}15 100%)`
          : `linear-gradient(180deg,${FAO_BLUE}15 0%,${FAO_BLUE}05 100%)`,
        border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}`,
      }}
    >
      <div
        className={`flex-1 rounded-xl flex flex-col overflow-hidden min-h-0 ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"}`}
        style={{ border: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}` }}
      >
        {/* Station header */}
        <div
          className="flex-shrink-0 px-3 py-2.5"
          style={{
            background: selectedStation
              ? `linear-gradient(135deg,${isDarkMode ? "rgba(49,141,222,0.14)" : "rgba(49,141,222,0.07)"} 0%,transparent 100%)`
              : undefined,
            borderBottom: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}`,
          }}
        >
          {selectedStation ? (
            <div>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex-shrink-0">
                    <span className={`block w-2.5 h-2.5 rounded-full ${statusDot(selectedStation.status)}`} />
                    {selectedStation.status === "online" && (
                      <span className={`absolute inset-0 rounded-full animate-ping ${statusDot(selectedStation.status)} opacity-60`} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className={`text-sm font-bold leading-tight truncate ${headerText}`}>
                      {selectedStation.name}
                    </h2>
                    {stationCode && (
                      <span className="text-[9px] font-mono opacity-60" style={{ color: FAO_BLUE }}>
                        {stationCode}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 font-semibold ${statusBadge(selectedStation.status)}`}
                >
                  {selectedStation.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {selectedStation.region && (
                  <span className={`text-[10px] flex items-center gap-0.5 ${textMuted}`}>
                    <MapPin className="w-2.5 h-2.5 opacity-60" />{selectedStation.region}
                  </span>
                )}
                <span className={`text-[10px] flex items-center gap-0.5 ${textMuted}`}>
                  <Wifi className="w-2.5 h-2.5 opacity-60" />Signal {selectedStation.signal ?? 0}%
                </span>
                <span className={`text-[10px] font-mono ${textMuted}`}>
                  {selectedStation.lat.toFixed(3)}°, {selectedStation.lng.toFixed(3)}°
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 opacity-40" style={{ color: FAO_BLUE }} />
              <p className={`text-xs ${textMuted}`}>Click a station on the map to view readings</p>
            </div>
          )}
        </div>

        {/* Parameter tiles */}
        <div
          className="flex-shrink-0 px-3 py-2.5"
          style={{ borderBottom: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}` }}
        >
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(visibleParams.length, 5)}, 1fr)` }}
          >
            {visibleParams.map((param) => {
              const Icon       = param.icon;
              const isSelected = activeParameter === param.key;
              return (
                <button
                  key={param.key} type="button"
                  onClick={() => onChangeParameter(param.key)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-md transition-all duration-150 select-none"
                  style={{
                    background: isSelected
                      ? isDarkMode ? `${param.color}22` : `${param.color}14`
                      : isDarkMode ? "rgba(30,41,59,0.55)" : "rgba(241,245,249,0.9)",
                    border: `1px solid ${isSelected ? param.color + "55" : isDarkMode ? "#334155" : "#e2e8f0"}`,
                    boxShadow: isSelected ? `0 0 0 1px ${param.color}22` : undefined,
                  }}
                >
                  <Icon
                    className="w-3 h-3"
                    style={{ color: isSelected ? param.color : isDarkMode ? "#64748b" : "#94a3b8" }}
                  />
                  <span
                    className="text-[10px] font-bold leading-none"
                    style={{ color: isSelected ? param.color : isDarkMode ? "#cbd5e1" : "#374151" }}
                  >
                    {param.value}
                  </span>
                  <span
                    className="text-[8px] leading-none truncate w-full text-center"
                    style={{ color: isDarkMode ? "#64748b" : "#94a3b8" }}
                  >
                    {shortLabel(param.label)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-2 pb-2">
          <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
            <span className={`text-[11px] font-semibold ${textSecondary}`}>
              {periodLabel} · {active.label}
            </span>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: `${active.color}18`,
                color: active.color,
                border: `1px solid ${active.color}30`,
              }}
            >
              {minVal}{active.unit} – {maxVal}{active.unit}
            </span>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div
                className="animate-spin rounded-full h-5 w-5 border-2"
                style={{ borderColor: `${active.color}30`, borderTopColor: active.color }}
              />
            </div>
          ) : readings.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[10px] text-slate-500">
              No historical data available
            </div>
          ) : (
            <div className="flex-1 min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`grad_${activeParameter}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={active.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={active.color} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDarkMode ? "#334155" : "#e2e8f0"}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }}
                    tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 5))}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}${active.unit}`}
                  />
                  <RechartsTooltip
                    content={
                      <CustomTooltip
                        isDarkMode={isDarkMode}
                        color={active.color}
                        unit={active.unit}
                        labelName={active.label}
                      />
                    }
                  />
                  <Area
                    type="monotone" dataKey="value"
                    stroke={active.color} strokeWidth={2}
                    fill={`url(#grad_${activeParameter})`}
                    dot={false}
                    activeDot={{ r: 4, fill: active.color, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Map wrapper
// ---------------------------------------------------------------------------
const StationMap = ({
  isDarkMode, className = "", stations, onStationClick,
}: {
  isDarkMode: boolean; className?: string;
  stations: WeatherStation[]; onStationClick?: (s: WeatherStation) => void;
}) => (
  <WeatherStationsMap
    isDarkMode={isDarkMode}
    className={`rounded-lg md:rounded-xl ${className}`}
    badgeText={`${stations.filter((s) => s.status === "online").length} Active`}
    stations={stations}
    onStationClick={onStationClick}
  />
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function WeatherStationsPage({ isDarkMode = true }: WeatherStationsPageProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [activeTab,           setActiveTab]           = useState("all");
  const [selectedStationCode, setSelectedStationCode] = useState("");   // filter dropdown value
  const [selectedStatus,      setSelectedStatus]      = useState("");
  const [showMobileFilters,   setShowMobileFilters]   = useState(false);
  const [selectedStation,     setSelectedStation]     = useState<WeatherStation | null>(null);
  const [activeParameter,     setActiveParameter]     = useState<ActiveParamKey>("temperature");
  const [activeParams,        setActiveParams]        = useState<ActiveParams>(
    new Set(["temperature","humidity","wind_speed","pressure","rainfall"]) as ActiveParams,
  );

  // Track previous filter values to detect real changes
  const prevStationCode = useRef(selectedStationCode);
  const prevStatus      = useRef(selectedStatus);

  // ── Data — all stations (used for dropdown list + map) ────────────────────
  const {
    data: rawStations = [],
    isLoading: stationsLoading,
    refetch,
  } = useQuery<WeatherStationAPI[]>({
    queryKey:        ["weather-stations"],
    queryFn:         () => stationsAPI.getAll(),   // API ignores status param — filter client-side
    refetchInterval: 60_000,
  });

  const stations: WeatherStation[] = rawStations.map(toMapStation);

  // ── Derived counts ────────────────────────────────────────────────────────
  const onlineCount      = stations.filter((s) => s.status === "online").length;
  const offlineCount     = stations.filter((s) => s.status === "offline").length;
  const maintenanceCount = stations.filter((s) => s.status === "maintenance").length;

  // ── Stations shown on map — client-side filter by station code + status ───
  // NOTE: The API does not support server-side status filtering; we filter here.
  const displayedStations = stations.filter((s) => {
    const matchesCode   = !selectedStationCode || s.code === selectedStationCode;
    const matchesStatus = !selectedStatus      || s.status === selectedStatus;
    return matchesCode && matchesStatus;
  });

  // ── Auto-select station; sync when filter dropdown changes ────────────────
  useEffect(() => {
    const filterChanged =
      prevStationCode.current !== selectedStationCode ||
      prevStatus.current      !== selectedStatus;
    prevStationCode.current = selectedStationCode;
    prevStatus.current      = selectedStatus;

    if (displayedStations.length === 0) { setSelectedStation(null); return; }

    const currentStillVisible =
      !filterChanged &&
      selectedStation &&
      displayedStations.some((s) => s.id === selectedStation.id);

    if (!currentStillVisible) {
      setSelectedStation(
        displayedStations.find((s) => s.status === "online") ?? displayedStations[0],
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedStations, selectedStationCode, selectedStatus]);

  // ── Handler: station dropdown → also move map selection ──────────────────
  const handleStationCodeChange = (code: string) => {
    setSelectedStationCode(code);
    if (!code) {
      setSelectedStation(null); // effect will pick best from displayedStations
    } else {
      const found = stations.find((s) => s.code === code);
      if (found) setSelectedStation(found);
    }
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    setSelectedStation(null); // effect will re-pick from newly filtered list
  };

  // ── Readings — fetch for the currently selected station ───────────────────
  const stationCode = selectedStation?.code;

  const { data: readingsData, isLoading: readingsLoading } = useQuery({
    queryKey: ["station-readings", stationCode],
    queryFn:  async () => {
      if (!stationCode) return null;
      return stationsAPI.getReadings(stationCode, 720);
    },
    enabled:   !!stationCode,
    staleTime: 5  * 60_000,
    gcTime:    15 * 60_000,
  });

  const readings: NormalizedReading[] = (() => {
    let raw: any[] = [];
    if (Array.isArray(readingsData))                                        raw = readingsData;
    else if (readingsData && Array.isArray((readingsData as any).readings)) raw = (readingsData as any).readings;
    else if (readingsData && Array.isArray((readingsData as any).results))  raw = (readingsData as any).results;
    return raw.length ? raw.map(normaliseReading) : generateMockReadings(selectedStation);
  })();

  // ── Styling helpers ───────────────────────────────────────────────────────
  const cardBg        = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted     = isDarkMode ? "text-slate-400"  : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300"  : "text-slate-600";
  const borderColor   = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText    = isDarkMode ? "text-white"      : "text-slate-900";

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      const response = await stationsAPI.exportReadings(format);
      const blob = await response.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `weather-stations.${format}`;
      document.body.appendChild(a); a.click();
      window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const panelProps = {
    selectedStation, stationCode,
    readings, isLoading: readingsLoading,
    activeParameter, onChangeParameter: setActiveParameter,
    activeParams,
    isDarkMode, cardBg, borderColor, headerText, textMuted, textSecondary,
  };

  // Shared filter props
  const filterProps = {
    selectedStationCode, setSelectedStationCode: handleStationCodeChange,
    selectedStatus,      setSelectedStatus: handleStatusChange,
    activeParams,        setActiveParams,
    isDarkMode, textMuted, borderColor, headerText,
    onlineCount, offlineCount, maintenanceCount, totalCount: stations.length,
    stations_list: stations,
  };

  // ── Loading screen ────────────────────────────────────────────────────────
  if (stationsLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}>
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          />
          <p className={textMuted}>Loading Weather Stations…</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 3xl:p-8 4xl:p-10 min-h-screen">
      {/* Animated background rings */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border-2 border-blue-500/20"
              style={{
                width:  `${100 + i * 100}px`,
                height: `${100 + i * 100}px`,
                left: "10%", top: "30%",
                animation: `signalPulse ${3 + i * 0.5}s ease-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Header banner */}
        <div
          className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{ background: `linear-gradient(135deg,${FAO_BLUE}e6 0%,${FAO_BLUE}99 100%)` }}
        >
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
              <div>
                <h1 className="text-lg md:text-xl 3xl:text-2xl 4xl:text-3xl font-bold text-white">
                  Weather Stations
                </h1>
                <p className="text-slate-200 text-xs md:text-sm 3xl:text-base 4xl:text-lg">
                  AWS network monitoring
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <Wifi className="w-3 h-3" />{onlineCount} Online
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(239,68,68,0.4)" }}
                  >
                    <WifiOff className="w-3 h-3" />{offlineCount} Offline
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <BarChart3 className="w-3 h-3" />98.5% Uptime
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  <Download className="w-3 h-3" /><span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={() => refetch()}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <RefreshCw className="w-3 h-3" /><span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── DESKTOP ── */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">
          {/* Sidebar */}
          <div className="lg:col-span-3 flex flex-col">
            <div
              className="flex-1 rounded-xl p-3 shadow-sm flex flex-col"
              style={{
                background: isDarkMode
                  ? `linear-gradient(180deg,${FAO_BLUE}30 0%,${FAO_BLUE}15 100%)`
                  : `linear-gradient(180deg,${FAO_BLUE}15 0%,${FAO_BLUE}05 100%)`,
                border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}`,
              }}
            >
              <div
                className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"} border ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}
              >
                <FilterContent {...filterProps} />
              </div>
              <div className="mt-3 flex-1 flex relative min-h-[140px]">
                <div
                  className="absolute inset-0 rounded-xl overflow-hidden"
                  style={{
                    backgroundImage: "url(/stations-illustration.png)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="lg:col-span-9 space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {stationTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    activeTab === id
                      ? "text-white"
                      : `${isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-600"}`
                  }`}
                  style={{ backgroundColor: activeTab === id ? FAO_BLUE : undefined }}
                >
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* Map + readings */}
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px] 3xl:h-[840px] 4xl:h-[1020px]">
              {/* Map */}
              <div className="col-span-8 flex h-full">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm flex-1 flex flex-col`}
                >
                  <div className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>Station Network Map</h3>
                      {selectedStationCode && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: `${FAO_BLUE}20`, color: FAO_BLUE }}
                        >
                          {stations.find((s) => s.code === selectedStationCode)?.name ?? selectedStationCode}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedStationCode && (
                        <button
                          onClick={() => handleStationCodeChange("")}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${textMuted} hover:text-red-400 transition-colors`}
                        >
                          <X className="w-2.5 h-2.5" /> Clear
                        </button>
                      )}
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: isDarkMode ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.15)",
                          color: "#22c55e",
                        }}
                      >
                        {onlineCount} Active
                      </span>
                    </div>
                  </div>
                  <div className="relative flex-1 min-h-0">
                    <StationMap
                      isDarkMode={isDarkMode}
                      className="absolute inset-0 w-full h-full"
                      stations={displayedStations}
                      onStationClick={(s) => {
                        const found = stations.find((st) => st.id === s.id);
                        if (found) setSelectedStation(found);
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Readings panel */}
              <div className="col-span-4 h-full">
                <StationReadingsPanel key={selectedStation?.id ?? "none"} {...panelProps} />
              </div>
            </div>

            {/* About AWS */}
            <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}>
                <Info className="w-4 h-4" style={{ color: FAO_BLUE }} />About AWS Network
              </h3>
              <p className={`text-xs ${textMuted} mb-2`}>
                Automatic Weather Stations provide real-time meteorological data across Uganda.
              </p>
              <div className="space-y-1">
                {[
                  { I: Thermometer, l: "Temperature & Humidity" },
                  { I: Wind,        l: "Wind Speed & Direction" },
                  { I: CloudRain,   l: "Precipitation"          },
                  { I: Gauge,       l: "Barometric Pressure"    },
                ].map(({ I, l }) => (
                  <div key={l} className={`flex items-center gap-1.5 text-xs ${textSecondary}`}>
                    <I className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />{l}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── MOBILE ── */}
        <div className="block lg:hidden space-y-3">
          {/* Network overview */}
          <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}>
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>Network Overview</h3>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: onlineCount,      c: "text-green-500",  bg: "bg-green-500/10 border-green-500/20",   l: "Online"  },
                { v: offlineCount,     c: "text-red-500",    bg: "bg-red-500/10 border-red-500/20",       l: "Offline" },
                { v: maintenanceCount, c: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/20", l: "Maint"   },
                { v: stations.length,  c: "",                bg: "",                                       l: "Total"   },
              ].map(({ v, c, bg, l }) => (
                <div
                  key={l}
                  className={`rounded-lg p-2 border text-center ${bg}`}
                  style={l === "Total" ? { backgroundColor: `${FAO_BLUE}10`, borderColor: `${FAO_BLUE}30` } : undefined}
                >
                  <p
                    className={`text-lg font-bold ${c}`}
                    style={l === "Total" ? { color: FAO_BLUE } : undefined}
                  >
                    {v}
                  </p>
                  <p className={`text-[10px] ${textMuted}`}>{l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Map + filter popup */}
          <div className="relative">
            <div className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm`}>
              <div className={`flex items-center justify-between p-2 border-b ${borderColor}`}>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                  <h3 className={`text-sm font-semibold ${headerText}`}>Station Network Map</h3>
                  {selectedStationCode && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${FAO_BLUE}20`, color: FAO_BLUE }}
                    >
                      {stations.find((s) => s.code === selectedStationCode)?.name ?? selectedStationCode}
                    </span>
                  )}
                </div>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: isDarkMode ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.15)",
                    color: "#22c55e",
                  }}
                >
                  {onlineCount} Active
                </span>
              </div>
              <div className="aspect-video relative flex flex-col">
                <div className="flex-1 relative">
                  <StationMap
                    isDarkMode={isDarkMode}
                    className="absolute inset-0 w-full h-full"
                    stations={displayedStations}
                    onStationClick={(s) => {
                      const found = stations.find((st) => st.id === s.id);
                      if (found) setSelectedStation(found);
                    }}
                  />
                </div>
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <Filter className="w-4 h-4" />
                </button>
                <FloodHourSlider isDarkMode={isDarkMode} borderColor={borderColor} textMuted={textMuted} />
              </div>
            </div>

            {showMobileFilters && (
              <>
                <div className="fixed inset-0 z-[1002]" onClick={() => setShowMobileFilters(false)} />
                <div
                  className={`absolute right-2 top-1/2 -translate-y-1/2 z-[1003] w-64 rounded-xl shadow-lg border p-3 max-h-[70vh] overflow-y-auto ${
                    isDarkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`text-xs font-semibold ${headerText}`}>Station Filters</h4>
                    <button
                      onClick={() => setShowMobileFilters(false)}
                      className={`p-1 rounded-md ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FilterContent {...filterProps} />
                </div>
              </>
            )}
          </div>

          {/* Readings panel — mobile */}
          <div className="h-[450px]">
            <StationReadingsPanel key={selectedStation?.id ?? "none"} {...panelProps} />
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
        @keyframes signalPulse { 0% { transform:scale(1); opacity:0.5; } 100% { transform:scale(2); opacity:0; } }
        @keyframes fadeInUp    { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}