import { useState } from "react";
import {
  Radio,
  MapPin,
  Download,
  RefreshCw,
  Wifi,
  WifiOff,
  Settings,
  Thermometer,
  Wind,
  Gauge,
  CloudRain,
  AlertTriangle,
  Info,
  BarChart3,
  Filter,
  X,
} from "lucide-react";
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

const getStatusColor = (status: string) => {
  switch (status) {
    case "online":
      return "text-green-500";
    case "maintenance":
      return "text-yellow-500";
    case "offline":
      return "text-red-500";
    default:
      return "text-slate-400";
  }
};

const getStatusBg = (status: string) => {
  switch (status) {
    case "online":
      return "bg-green-500/20";
    case "maintenance":
      return "bg-yellow-500/20";
    case "offline":
      return "bg-red-500/20";
    default:
      return "bg-slate-500/20";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "online":
      return <Wifi className="w-4 h-4" />;
    case "maintenance":
      return <Settings className="w-4 h-4" />;
    case "offline":
      return <WifiOff className="w-4 h-4" />;
    default:
      return <WifiOff className="w-4 h-4" />;
  }
};

const FilterContent = ({
  selectedRegion,
  setSelectedRegion,
  selectedStatus,
  setSelectedStatus,
  isDarkMode,
  textMuted,
  textSecondary,
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
  isDarkMode: boolean;
  textMuted: string;
  textSecondary: string;
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
      <label className={`text-xs ${textMuted} mb-1 block`}>Parameter</label>
      <div className="space-y-1.5">
        {["Temperature", "Humidity", "Wind", "Pressure", "Rainfall"].map(
          (param) => (
            <label
              key={param}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                className={`rounded ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-slate-300"}`}
                defaultChecked
              />
              <span className={textSecondary}>{param}</span>
            </label>
          ),
        )}
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

// Map Component with station markers
const StationMap = ({
  isDarkMode,
  className = "",
  stations,
}: {
  isDarkMode: boolean;
  className?: string;
  stations: WeatherStation[];
}) => {
  return (
    <WeatherStationsMap
      isDarkMode={isDarkMode}
      className={`rounded-lg md:rounded-xl ${className}`}
      badgeText={`${stations.filter((s) => s.status === "online").length} Active`}
      stations={stations}
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
    <div className="p-4 md:p-6 min-h-screen">
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

      <div className="relative z-10 max-w-[1600px] mx-auto">
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
                <h1 className="text-lg md:text-xl font-bold text-white">
                  Weather Stations
                </h1>
                <p className="text-slate-200 text-xs md:text-sm">
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
                  isDarkMode={isDarkMode}
                  textMuted={textMuted}
                  textSecondary={textSecondary}
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
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px]">
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
              <div className="col-span-4 flex flex-col gap-3">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm h-full`}
                >
                  <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
                    Network Overview
                  </h3>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
                      <p className="text-xl font-bold text-green-500">
                        {onlineCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Online</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                      <p className="text-xl font-bold text-red-500">
                        {offlineCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Offline</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2">
                      <p className="text-xl font-bold text-yellow-500">
                        {maintenanceCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Maintenance</p>
                    </div>
                    <div
                      className="rounded-lg p-2 border"
                      style={{
                        backgroundColor: `${FAO_BLUE}10`,
                        borderColor: `${FAO_BLUE}30`,
                      }}
                    >
                      <p
                        className="text-xl font-bold"
                        style={{ color: FAO_BLUE }}
                      >
                        {stations.length}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Total</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs ${textMuted}`}>
                          Data Quality
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: FAO_BLUE }}
                        >
                          94%
                        </span>
                      </div>
                      <div
                        className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: "94%", backgroundColor: FAO_BLUE }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs ${textMuted}`}>
                          Network Uptime
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: FAO_BLUE }}
                        >
                          98.5%
                        </span>
                      </div>
                      <div
                        className={`h-1.5 rounded-full overflow-hidden ${isDarkMode ? "bg-slate-700" : "bg-slate-200"}`}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{ width: "98.5%", backgroundColor: FAO_BLUE }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Station Status - Mobile styling adopted for right column */}
                <div
                  className={`hidden lg:flex flex-col ${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1`}
                >
                  <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
                    Station Status
                  </h3>
                  <div
                    className="overflow-y-auto pr-1"
                    style={{ maxHeight: "250px" }}
                  >
                    <div className="space-y-1.5">
                      {stations.map((station, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? "bg-slate-700/30" : "bg-slate-100"}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2.5 h-2.5 rounded-full ${getStatusColor(station.status).replace("text", "bg")}`}
                            ></div>
                            <div>
                              <p
                                className={`text-xs font-medium truncate max-w-[100px] ${headerText}`}
                                title={station.name}
                              >
                                {station.name}
                              </p>
                              <p className={`text-[10px] ${textMuted}`}>
                                {station.id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right hidden xl:block">
                              <p className={`text-[10px] ${textMuted}`}>
                                Signal
                              </p>
                              <p
                                className={`text-xs font-medium ${headerText}`}
                              >
                                {station.signal ?? 0}%
                              </p>
                            </div>
                            <div className="w-14">
                              <span
                                className={`inline-block text-center text-[9px] px-1 py-0.5 rounded w-full ${getStatusBg(station.status)} ${getStatusColor(station.status)}`}
                              >
                                {station.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    textSecondary={textSecondary}
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
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
              Station Status
            </h3>
            <div className="space-y-2">
              {stations.slice(0, 4).map((station, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg ${isDarkMode ? "bg-slate-700/30" : "bg-slate-100"}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center ${getStatusBg(station.status)}`}
                      >
                        {getStatusIcon(station.status)}
                      </div>
                      <div>
                        <p className={`text-xs font-medium ${headerText}`}>
                          {station.name}
                        </p>
                        <p className={`text-[10px] ${textMuted}`}>
                          {station.id}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusBg(station.status)} ${getStatusColor(station.status)}`}
                    >
                      {station.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
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
