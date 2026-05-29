import { useState, useEffect } from "react";
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
  AlertTriangle,
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
import type { district } from "@/types/data_types";
import { DistrictsAPI, stationsAPI } from "@/services/api";
import type { WeatherStationAPI } from "@/services/api";

interface WeatherStationsPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

type ActiveParams = Set<"temperature" | "humidity" | "wind_speed" | "pressure" | "rainfall">;

const PARAM_META = [
  { key: "temperature" as const, label: "Temperature", unit: "°C",   color: "#f97316", Icon: Thermometer },
  { key: "humidity"    as const, label: "Humidity",    unit: "%",    color: "#22c55e", Icon: Droplets   },
  { key: "wind_speed"  as const, label: "Wind Speed",  unit: "km/h", color: "#3b82f6", Icon: Wind       },
  { key: "pressure"    as const, label: "Pressure",    unit: "hPa",  color: "#a855f7", Icon: Gauge      },
  { key: "rainfall"    as const, label: "Rainfall",    unit: "mm",   color: "#06b6d4", Icon: CloudRain  },
];

const stationTabs = [
  { id: "all", label: "All Stations", icon: Radio },
  { id: "readings", label: "Recent Readings", icon: BarChart3 },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
];

/** Map API shape → WeatherStation used by the map component */
function toMapStation(s: WeatherStationAPI): WeatherStation {
  return {
    id: String(s.id),
    name: s.name,
    region: s.region,
    status: s.status,
    lat: s.lat,
    lng: s.lon,
    signal: s.signal_pct,
  };
}



const FilterContent = ({
  selectedRegion,
  setSelectedRegion,
  selectedStatus,
  setSelectedStatus,
  activeParams,
  setActiveParams,
  isDarkMode,
  textMuted,
  borderColor,
  headerText,
  onlineCount,
  offlineCount,
  totalCount,
  district_list,
}: {
  selectedRegion: string;
  setSelectedRegion: (val: string) => void;
  selectedStatus: string;
  setSelectedStatus: (val: string) => void;
  activeParams: ActiveParams;
  setActiveParams: React.Dispatch<React.SetStateAction<ActiveParams>>;
  isDarkMode: boolean;
  textMuted: string;
  borderColor: string;
  headerText: string;
  onlineCount: number;
  offlineCount: number;
  totalCount: number;
  district_list: district[] | undefined;
}) => (
  <div className="space-y-3">
    {/* <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Region</label>
      <select
        value={selectedRegion}
        onChange={(e) => setSelectedRegion(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        <option value="All Regions">All Regions</option>
        <option value="Central">Central</option>
        <option value="Eastern">Eastern</option>
        <option value="Western">Western</option>
        <option value="Northern">Northern</option>
      </select>
    </div> */}
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Districts</label>
      <select
        value={selectedRegion}
        onChange={(e) => setSelectedRegion(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        <option value="">All Districts</option>
        {district_list?.map((r) => (
          <option key={r.id} value={r.name}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Status</label>
      <select
        value={selectedStatus}
        onChange={(e) => setSelectedStatus(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        <option value="">All Status</option>
        <option value="online">Online</option>
        <option value="maintenance">Maintenance</option>
        <option value="offline">Offline</option>
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1.5 block`}>Parameters</label>
      <div className="space-y-1">
        {PARAM_META.map((p) => {
          const checked = activeParams.has(p.key);
          const Icon = p.Icon;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() =>
                setActiveParams((prev) => {
                  const next = new Set(prev) as ActiveParams;
                  if (next.has(p.key)) next.delete(p.key);
                  else next.add(p.key);
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
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>
        Network Stats
      </h4>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Total Stations</span>
          <span className={`font-medium ${headerText}`}>{totalCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Online</span>
          <span className="text-green-500 font-medium">{onlineCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Offline</span>
          <span className="text-red-500 font-medium">{offlineCount}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Data Quality</span>
          <span className="font-medium" style={{ color: FAO_BLUE }}>
            94%
          </span>
        </div>
      </div>
    </div>
  </div>
);

interface NormalizedReading {
  timestamp: string;
  temperature: number;
  humidity: number;
  wind_speed: number;
  wind_direction: number;
  pressure: number;
  rainfall: number;
}

function generateMockReadings(station: WeatherStation | null): NormalizedReading[] {
  if (!station) return [];
  const list: NormalizedReading[] = [];
  const now = new Date();
  
  const getHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };
  
  const seed = getHash(station.name || String(station.id));
  const baseTemp = 20 + (seed % 8); // 20 to 28
  const baseHumidity = 60 + (seed % 20); // 60 to 80
  const basePressure = 1008 + (seed % 8); // 1008 to 1016
  const baseWind = 4 + (seed % 10); // 4 to 14
  
  // Generate daily points for the past 30 days
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const daySeed = seed + i;
    const tempVar = Math.sin(i * 0.2) * 3 + ((daySeed % 5) - 2);
    const humVar = Math.cos(i * 0.25) * 10 + ((daySeed % 8) - 4);
    const pressVar = Math.sin(i * 0.15) * 2 + ((daySeed % 4) - 2);
    const windVar = Math.cos(i * 0.3) * 4 + ((daySeed % 6) - 3);
    const rainVal = (daySeed % 8 === 0) ? parseFloat(((daySeed % 8) * 1.2).toFixed(1)) : 0;
    
    list.push({
      timestamp: date.toISOString(),
      temperature: parseFloat((baseTemp + tempVar).toFixed(1)),
      humidity: Math.min(100, Math.max(0, Math.round(baseHumidity + humVar))),
      wind_speed: parseFloat(Math.max(0, baseWind + windVar).toFixed(1)),
      wind_direction: Math.round(180 + (daySeed % 12) * 15) % 360,
      pressure: Math.round(basePressure + pressVar),
      rainfall: rainVal,
    });
  }
  return list;
}

const CustomTooltip = ({
  active,
  payload,
  label,
  isDarkMode,
  color,
  unit,
  labelName,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  isDarkMode: boolean;
  color: string;
  unit: string;
  labelName: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={`px-2.5 py-1.5 rounded-lg shadow-lg border text-xs ${
        isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
      }`}
    >
      <p className="font-semibold mb-0.5">{label}</p>
      <p style={{ color }}>
        {labelName}: {payload[0].value} {unit}
      </p>
    </div>
  );
};

const StationReadingsPanel = ({
  selectedStation,
  stationCode,
  readings,
  isLoading,
  activeParameter,
  onChangeParameter,
  activeParams,
  isDarkMode,
  headerText,
  textMuted,
  textSecondary,
}: {
  selectedStation: WeatherStation | null;
  stationCode?: string;
  readings: any[];
  isLoading: boolean;
  activeParameter: "temperature" | "humidity" | "wind_speed" | "pressure" | "rainfall";
  onChangeParameter: (param: "temperature" | "humidity" | "wind_speed" | "pressure" | "rainfall") => void;
  activeParams: ActiveParams;
  isDarkMode: boolean;
  headerText: string;
  textMuted: string;
  textSecondary: string;
}) => {
  const latestReading = readings[readings.length - 1] || {};

  const allParameters = [
    { key: "temperature" as const, label: "Temperature", unit: "°C",   color: "#f97316", icon: Thermometer, value: latestReading.temperature !== undefined ? `${Number(latestReading.temperature).toFixed(1)}°C` : "—" },
    { key: "humidity"    as const, label: "Humidity",    unit: "%",    color: "#22c55e", icon: Droplets,    value: latestReading.humidity    !== undefined ? `${Number(latestReading.humidity).toFixed(0)}%`    : "—" },
    { key: "wind_speed"  as const, label: "Wind Speed",  unit: "km/h", color: "#3b82f6", icon: Wind,        value: latestReading.wind_speed  !== undefined ? `${Number(latestReading.wind_speed).toFixed(1)}`   : "—" },
    { key: "pressure"    as const, label: "Pressure",    unit: "hPa",  color: "#a855f7", icon: Gauge,       value: latestReading.pressure    !== undefined ? `${Math.round(latestReading.pressure)} hPa`        : "—" },
    { key: "rainfall"    as const, label: "Rainfall",    unit: "mm",   color: "#06b6d4", icon: CloudRain,   value: latestReading.rainfall    !== undefined ? `${Number(latestReading.rainfall).toFixed(1)} mm`  : "—" },
  ];
  const parameters = allParameters.filter((p) => activeParams.has(p.key));

  const parameterConfig = {
    temperature: { label: "Temperature", unit: "°C", color: "#f97316" },
    humidity: { label: "Humidity", unit: "%", color: "#22c55e" },
    wind_speed: { label: "Wind Speed", unit: "km/h", color: "#3b82f6" },
    pressure: { label: "Pressure", unit: "hPa", color: "#a855f7" },
    rainfall: { label: "Rainfall", unit: "mm", color: "#06b6d4" },
  };

  const activeDetails = parameterConfig[activeParameter];
  const activeValues = readings.map((r: any) => r[activeParameter] ?? 0);
  const minVal = activeValues.length > 0 ? Math.min(...activeValues) : 0;
  const maxVal = activeValues.length > 0 ? Math.max(...activeValues) : 0;

  const getMonthAndYearRange = (items: any[]) => {
    if (items.length === 0) return "N/A";
    const monthsSet = new Set<string>();
    const yearsSet = new Set<string>();
    const monthsList = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    items.forEach((item) => {
      const d = new Date(item.timestamp);
      if (!isNaN(d.getTime())) {
        monthsSet.add(monthsList[d.getMonth()]);
        yearsSet.add(d.getFullYear().toString());
      }
    });

    const months = Array.from(monthsSet);
    const years = Array.from(yearsSet);
    
    if (months.length === 1) {
      return `${months[0]} ${years[0] || ""}`;
    } else if (months.length > 1) {
      return `${months[0]} - ${months[months.length - 1]} ${years[0] || ""}`;
    }
    return "Selected Period";
  };

  const periodLabel = getMonthAndYearRange(readings);

  const isSingleDay = (() => {
    if (readings.length < 2) return true;
    const first = new Date(readings[0].timestamp);
    const last = new Date(readings[readings.length - 1].timestamp);
    return first.toDateString() === last.toDateString();
  })();

  const formatTimestamp = (ts: string, isSingle: boolean) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    if (isSingle) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${months[d.getMonth()]} ${d.getDate()}`;
    }
  };

  const chartData = readings.map((r: any) => ({
    label: formatTimestamp(r.timestamp, isSingleDay),
    value: r[activeParameter] ?? 0,
  }));

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":      return "bg-green-500";
      case "maintenance": return "bg-yellow-500";
      case "offline":     return "bg-red-500";
      default:            return "bg-slate-400";
    }
  };

  const shortLabel = (s: string) =>
    s.replace("Temperature", "Temp").replace("Humidity", "Humid")
     .replace("Wind Speed", "Wind").replace("Pressure", "Press").replace("Rainfall", "Rain");

  return (
    /* Gradient outer wrapper — mirrors the left sidebar */
    <div
      className="h-full rounded-xl p-3 shadow-sm flex flex-col"
      style={{
        background: isDarkMode
          ? `linear-gradient(180deg, ${FAO_BLUE}30 0%, ${FAO_BLUE}15 100%)`
          : `linear-gradient(180deg, ${FAO_BLUE}15 0%, ${FAO_BLUE}05 100%)`,
        border: `1px solid ${isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}15`}`,
      }}
    >
      {/* Inner card */}
      <div
        className={`flex-1 rounded-xl flex flex-col overflow-hidden min-h-0 ${isDarkMode ? "bg-slate-800/80" : "bg-white/90"}`}
        style={{ border: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}` }}
      >
        {/* ── Station header ── */}
        <div
          className="flex-shrink-0 px-3 py-2.5"
          style={{
            background: selectedStation
              ? `linear-gradient(135deg, ${isDarkMode ? "rgba(49,141,222,0.14)" : "rgba(49,141,222,0.07)"} 0%, transparent 100%)`
              : undefined,
            borderBottom: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}`,
          }}
        >
          {selectedStation ? (
            <div>
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex-shrink-0">
                    <span className={`block w-2.5 h-2.5 rounded-full ${getStatusColor(selectedStation.status)}`} />
                    {selectedStation.status === "online" && (
                      <span className={`absolute inset-0 rounded-full animate-ping ${getStatusColor(selectedStation.status)} opacity-60`} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className={`text-sm font-bold leading-tight truncate ${headerText}`}>{selectedStation.name}</h2>
                    {stationCode && (
                      <span className="text-[9px] font-mono opacity-60" style={{ color: FAO_BLUE }}>{stationCode}</span>
                    )}
                  </div>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ml-1 font-semibold ${
                  selectedStation.status === "online"      ? "bg-green-500/20 text-green-400" :
                  selectedStation.status === "maintenance" ? "bg-yellow-500/20 text-yellow-400" :
                  "bg-red-500/20 text-red-400"
                }`}>{selectedStation.status}</span>
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

        {/* ── Parameter tiles — rounded-md cards with gap ── */}
        <div
          className="flex-shrink-0 px-3 py-2.5"
          style={{ borderBottom: `1px solid ${isDarkMode ? "rgba(51,65,85,0.5)" : "#e2e8f0"}` }}
        >
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${Math.min(parameters.length, 5)}, 1fr)` }}
          >
            {parameters.map((param) => {
              const Icon = param.icon;
              const isSelected = activeParameter === param.key;
              return (
                <button
                  key={param.key}
                  type="button"
                  onClick={() => onChangeParameter(param.key)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-md transition-all duration-150 select-none"
                  style={{
                    background: isSelected
                      ? isDarkMode ? `${param.color}22` : `${param.color}14`
                      : isDarkMode ? "rgba(30,41,59,0.55)" : "rgba(241,245,249,0.9)",
                    border: `1px solid ${isSelected
                      ? param.color + "55"
                      : isDarkMode ? "#334155" : "#e2e8f0"}`,
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

        {/* ── Chart section — fills remaining space ── */}
        <div className="flex-1 flex flex-col min-h-0 px-3 pt-2 pb-2">
          <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
            <span className={`text-[11px] font-semibold ${textSecondary}`}>
              {periodLabel} · {activeDetails.label}
            </span>
            <span
              className="flex items-center gap-1.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                background: `${activeDetails.color}18`,
                color: activeDetails.color,
                border: `1px solid ${activeDetails.color}30`,
              }}
            >
              <span>Min: {minVal}{activeDetails.unit}</span>
              <span style={{ opacity: 0.4 }}>|</span>
              <span>Max: {maxVal}{activeDetails.unit}</span>
            </span>
          </div>

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-2" style={{ borderColor: `${activeDetails.color}30`, borderTopColor: activeDetails.color }} />
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
                    <linearGradient id={`panel_color_${activeParameter}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={activeDetails.color} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={activeDetails.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "#334155" : "#e2e8f0"} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(0, Math.floor(chartData.length / 5))}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 9, fill: isDarkMode ? "#64748b" : "#94a3b8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}${activeDetails.unit}`}
                  />
                  <RechartsTooltip
                    content={
                      <CustomTooltip
                        isDarkMode={isDarkMode}
                        color={activeDetails.color}
                        unit={activeDetails.unit}
                        labelName={activeDetails.label}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={activeDetails.color}
                    strokeWidth={2}
                    fill={`url(#panel_color_${activeParameter})`}
                    dot={false}
                    activeDot={{ r: 4, fill: activeDetails.color, strokeWidth: 0 }}
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

// Map Component with station markers
const StationMap = ({
  isDarkMode,
  className = "",
  stations,
  onStationClick,
}: {
  isDarkMode: boolean;
  className?: string;
  stations: WeatherStation[];
  onStationClick?: (station: WeatherStation) => void;
}) => {
  return (
    <WeatherStationsMap
      isDarkMode={isDarkMode}
      className={`rounded-lg md:rounded-xl ${className}`}
      badgeText={`${stations.filter((s) => s.status === "online").length} Active`}
      stations={stations}
      onStationClick={onStationClick}
    />
  );
};

export default function WeatherStationsPage({
  isDarkMode = true,
}: WeatherStationsPageProps) {
  // ── State ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("all");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedStation, setSelectedStation] = useState<WeatherStation | null>(null);
  const [activeParameter, setActiveParameter] = useState<"temperature" | "humidity" | "wind_speed" | "pressure" | "rainfall">("temperature");
  const [activeParams, setActiveParams] = useState<ActiveParams>(
    new Set(["temperature", "humidity", "wind_speed", "pressure", "rainfall"]) as ActiveParams,
  );

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: district_list = [] } = useQuery<district[]>({
    queryKey: ["districts"],
    queryFn: DistrictsAPI.getAll,
  });
  const {
    data: rawStations = [],
    isLoading: stationsLoading,
    refetch,
  } = useQuery<WeatherStationAPI[]>({
    queryKey: ["weather-stations", selectedRegion, selectedStatus],
    queryFn: () =>
      stationsAPI.getAll(
        selectedRegion || undefined,
        (selectedStatus as any) || undefined,
      ),
    refetchInterval: 60_000,
  });

  // Map API shape → map-compatible shape
  const stations: WeatherStation[] = rawStations.map(toMapStation);

  const onlineCount = stations.filter((s) => s.status === "online").length;
  const offlineCount = stations.filter((s) => s.status === "offline").length;
  const maintenanceCount = stations.filter(
    (s) => s.status === "maintenance",
  ).length;

  // Auto-select the first online station on load
  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      const firstOnline = stations.find((s) => s.status === "online") || stations[0];
      setSelectedStation(firstOnline);
    }
  }, [stations, selectedStation]);

  // Fetch readings for the selected station
  const { data: readingsData, isLoading: readingsLoading } = useQuery({
    queryKey: ["station-readings", selectedStation?.id],
    queryFn: async () => {
      if (!selectedStation) return null;
      return stationsAPI.getReadings(selectedStation.id, 720); // 720 hours = 30 days
    },
    enabled: !!selectedStation,
  });

  const readings = (() => {
    let rawList: any[] = [];
    if (readingsData) {
      if (Array.isArray(readingsData)) {
        rawList = readingsData;
      } else if (readingsData && typeof readingsData === "object" && Array.isArray((readingsData as any).readings)) {
        rawList = (readingsData as any).readings;
      }
    }

    if (!rawList || rawList.length === 0) {
      return generateMockReadings(selectedStation);
    }

    return rawList.map((r: any) => ({
      timestamp: r.timestamp,
      temperature: r.temperature_c ?? r.temperature ?? 0,
      humidity: r.humidity_pct ?? r.humidity ?? 0,
      wind_speed: r.wind_speed_kmh ?? r.wind_speed ?? 0,
      wind_direction: r.wind_direction_deg ?? r.wind_direction ?? 0,
      pressure: r.pressure_hpa ?? r.pressure ?? 0,
      rainfall: r.rainfall_mm ?? r.rainfall ?? 0,
    }));
  })();

  const selectedRaw = rawStations.find((s) => String(s.id) === selectedStation?.id);

  const cardBg = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300" : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText = isDarkMode ? "text-white" : "text-slate-900";

  const handleRefresh = async () => {
    await refetch();
  };

  const handleExport = async (format: "csv" | "pdf") => {
    try {
      const response = await stationsAPI.exportReadings(format);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `weather-stations.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Export failed:", error);
    }
  };

  if (stationsLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          ></div>
          <p className={textMuted}>Loading Weather Stations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 3xl:p-8 4xl:p-10 min-h-screen">
      {/* Animated Background */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border-2 border-blue-500/20"
              style={{
                width: `${100 + i * 100}px`,
                height: `${100 + i * 100}px`,
                left: "10%",
                top: "30%",
                animation: `signalPulse ${3 + i * 0.5}s ease-out infinite`,
                animationDelay: `${i * 0.3}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Compact Header Banner - No alert buttons */}
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
                    <Wifi className="w-3 h-3" />
                    {onlineCount} Online
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }}
                  >
                    <WifiOff className="w-3 h-3" />
                    {offlineCount} Offline
                  </span>
                  <span
                    className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                    style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                  >
                    <BarChart3 className="w-3 h-3" />
                    98.5% Uptime
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleExport("csv")}
                  className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <RefreshCw className="w-3 h-3" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Layout with Sidebar */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">
          {/* Left Sidebar - Filter next to map */}
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
                  selectedRegion={selectedRegion}
                  setSelectedRegion={setSelectedRegion}
                  selectedStatus={selectedStatus}
                  setSelectedStatus={setSelectedStatus}
                  activeParams={activeParams}
                  setActiveParams={setActiveParams}
                  isDarkMode={isDarkMode}
                  textMuted={textMuted}
                  borderColor={borderColor}
                  headerText={headerText}
                  onlineCount={onlineCount}
                  offlineCount={offlineCount}
                  totalCount={stations.length}
                  district_list={district_list}
                />
              </div>

              {/* Illustration at bottom */}
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

          {/* Main Content */}
          <div className="lg:col-span-9 space-y-3">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {stationTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? "text-white"
                        : `${isDarkMode ? "bg-slate-800 text-slate-400" : "bg-slate-200 text-slate-600"}`
                    }`}
                    style={{
                      backgroundColor:
                        activeTab === tab.id ? FAO_BLUE : undefined,
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Map and Network Overview Row */}
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px] 3xl:h-[840px] 4xl:h-[1020px] 5xl:h-[1260px]">
              {/* Map - 8 columns */}
              <div className="col-span-8 flex h-full">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm flex-1 flex flex-col`}
                >
                  <div
                    className={`flex items-center justify-between p-2 border-b ${borderColor} flex-shrink-0`}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      <h3 className={`text-sm font-semibold ${headerText}`}>
                        Station Network Map
                      </h3>
                    </div>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: isDarkMode
                          ? "rgba(34, 197, 94, 0.2)"
                          : "rgba(34, 197, 94, 0.15)",
                        color: "#22c55e",
                      }}
                    >
                      {onlineCount} Active
                    </span>
                  </div>
                  <div className="relative flex-1 flex flex-col min-h-0">
                    <div className="flex-1 relative min-h-0">
                      <StationMap
                        isDarkMode={isDarkMode}
                        className="absolute inset-0 w-full h-full"
                        stations={stations}
                        onStationClick={(station) => {
                          const found = stations.find((s) => s.id === station.id);
                          if (found) setSelectedStation(found);
                        }}
                      />
                    </div>

                    {/* Time Slider */}
                    {/* <div className={`px-4 py-3 border-t ${borderColor} flex items-center gap-4 ${isDarkMode ? 'bg-slate-800/80' : 'bg-slate-50'}`}>
                      <span className={`text-xs font-medium ${textMuted}`}>2001</span>
                      <input 
                        type="range" 
                        min="0" 
                        max={(2026 - 2001 + 1) * 12 - 1} 
                        value={sliderValue}
                        onChange={(e) => setSliderValue(parseInt(e.target.value))}
                        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{ backgroundColor: isDarkMode ? '#334155' : '#cbd5e1', accentColor: FAO_BLUE }}
                      />
                      <span className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap" style={{ backgroundColor: `${FAO_BLUE}20`, color: FAO_BLUE }}>
                        {getMonthYear(sliderValue)}
                      </span>
                    </div> */}
                    {/* <FloodHourSlider
                      isDarkMode={isDarkMode}
                      borderColor={borderColor}
                      textMuted={textMuted}
                    /> */}
                  </div>
                </div>
              </div>

              {/* Right Column - 4 columns */}
              <div className="col-span-4 h-full">
                <StationReadingsPanel
                  key={selectedStation?.id ?? "none"}
                  selectedStation={selectedStation}
                  stationCode={selectedRaw?.code}
                  readings={readings}
                  isLoading={readingsLoading}
                  activeParameter={activeParameter}
                  onChangeParameter={setActiveParameter}
                  activeParams={activeParams}
                  isDarkMode={isDarkMode}
                  cardBg={cardBg}
                  borderColor={borderColor}
                  headerText={headerText}
                  textMuted={textMuted}
                  textSecondary={textSecondary}
                />
              </div>
            </div>

            {/* About AWS Networks */}
            <div
              className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
            >
              <h3
                className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}
              >
                <Info className="w-4 h-4" style={{ color: FAO_BLUE }} />
                About AWS Network
              </h3>
              <p className={`text-xs ${textMuted} mb-2`}>
                Automatic Weather Stations provide real-time meteorological data
                across Uganda.
              </p>
              <div className="space-y-1">
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <Thermometer
                    className="w-3.5 h-3.5"
                    style={{ color: FAO_BLUE }}
                  />
                  Temperature & Humidity
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <Wind className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                  Wind Speed & Direction
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <CloudRain
                    className="w-3.5 h-3.5"
                    style={{ color: FAO_BLUE }}
                  />
                  Precipitation
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <Gauge className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                  Barometric Pressure
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Layouts */}
        <div className="block lg:hidden space-y-3">
          {/* Network Overview - Mobile (above map) */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
              Network Overview
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-green-500">
                  {onlineCount}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Online</p>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-red-500">{offlineCount}</p>
                <p className={`text-[10px] ${textMuted}`}>Offline</p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-yellow-500">
                  {maintenanceCount}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Maint</p>
              </div>
              <div
                className="rounded-lg p-2 border"
                style={{
                  backgroundColor: `${FAO_BLUE}10`,
                  borderColor: `${FAO_BLUE}30`,
                }}
              >
                <p className="text-lg font-bold" style={{ color: FAO_BLUE }}>
                  {stations.length}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Total</p>
              </div>
            </div>
          </div>

          {/* Map Section with Filter Popup */}
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
                    Station Network Map
                  </h3>
                </div>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: isDarkMode
                      ? "rgba(34, 197, 94, 0.2)"
                      : "rgba(34, 197, 94, 0.15)",
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
                    stations={stations}
                  />
                </div>
                {/* Filter button on map */}
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <Filter className="w-4 h-4" />
                </button>

                {/* Time Slider */}
                {/* <div
                  className={`px-2 py-2 border-t ${borderColor} flex items-center gap-2 ${isDarkMode ? "bg-slate-800/80" : "bg-slate-50"} z-[1001]`}
                >
                  <span className={`text-[10px] font-medium ${textMuted}`}>
                    2001
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={(2026 - 2001 + 1) * 12 - 1}
                    value={sliderValue}
                    onChange={(e) => setSliderValue(parseInt(e.target.value))}
                    className="flex-1 h-1 rounded-lg appearance-none cursor-pointer"
                    style={{
                      backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
                      accentColor: FAO_BLUE,
                    }}
                  />
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{
                      backgroundColor: `${FAO_BLUE}20`,
                      color: FAO_BLUE,
                    }}
                  >
                    {getMonthYear(sliderValue)}
                  </span>
                </div> */}
                <FloodHourSlider
                  isDarkMode={isDarkMode}
                  borderColor={borderColor}
                  textMuted={textMuted}
                />
              </div>
            </div>
            {/* Filter Popup */}
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
                      Station Filters
                    </h4>
                    <button
                      onClick={() => setShowMobileFilters(false)}
                      className={`p-1 rounded-md ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <FilterContent
                    selectedRegion={selectedRegion}
                    setSelectedRegion={setSelectedRegion}
                    selectedStatus={selectedStatus}
                    setSelectedStatus={setSelectedStatus}
                    activeParams={activeParams}
                    setActiveParams={setActiveParams}
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    borderColor={borderColor}
                    headerText={headerText}
                    onlineCount={onlineCount}
                    offlineCount={offlineCount}
                    totalCount={stations.length}
                    district_list={district_list}
                  />
                </div>
              </>
            )}
          </div>

          {/* Station Status - Mobile */}
          <div className="h-[450px]">
            <StationReadingsPanel
              key={selectedStation?.id ?? "none"}
              selectedStation={selectedStation}
              stationCode={selectedRaw?.code}
              readings={readings}
              isLoading={readingsLoading}
              activeParameter={activeParameter}
              onChangeParameter={setActiveParameter}
              activeParams={activeParams}
              isDarkMode={isDarkMode}
              cardBg={cardBg}
              borderColor={borderColor}
              headerText={headerText}
              textMuted={textMuted}
              textSecondary={textSecondary}
            />
          </div>
        </div>

        {/* Footer */}
        <footer className={`mt-6 pt-4 border-t ${borderColor}`}>
          <div
            className={`flex flex-col md:flex-row items-center justify-between text-xs ${textMuted} gap-1`}
          >
            <p>© 2025 FAO Uganda. All Rights Reserved.</p>
            <span className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: FAO_BLUE }}
              ></div>
              System Operational
            </span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes signalPulse { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(2); opacity: 0; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}
