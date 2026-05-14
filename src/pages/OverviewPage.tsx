import {
  Cloud,
  Sun,
  Waves,
  Radio,
  AlertTriangle,
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  MapPin,
  Map as MapIcon,
  Filter,
  ArrowRight,
  X,
} from "lucide-react";
import type { PageType } from "../App";
import { useState, useEffect } from "react";
import OverviewMap from "../components/map/OverviewMap";
import { ThresholdScale } from "../components/shared/ThresholdScale";
import { getTrendIcon, getTrendColor } from "../utils/chartHelpers";
import { overviewAPI, alertsAPI, weatherAPI } from "../services/api";
import { FloodHourSlider } from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";

interface OverviewPageProps {
  onNavigate: (page: PageType) => void;
  isDarkMode?: boolean;
}

interface StatCard {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: any;
  color: string;
  min: number;
  max: number;
  thresholds: Array<{ value: number; color: string; label: string }>;
}

interface MonitoringModule {
  id: PageType;
  title: string;
  description: string;
  icon: any;
  metric: string;
  alerts: number;
  color: string;
}

interface AlertItem {
  title: string;
  location: string;
  time: string;
  type: string;
  severity: "high" | "medium";
}

// FAO Blue color matching the logo
const FAO_BLUE = "#318DDE";

// Helper: derive trend from delta
const trendOf = (delta: number): "up" | "down" | "neutral" =>
  delta > 0 ? "up" : delta < 0 ? "down" : "neutral";

// Helper: format delta with sign and suffix
const fmtDelta = (delta: number, suffix: string) =>
  `${delta > 0 ? "+" : ""}${delta}${suffix}`;

// Build stat cards directly from API weather data — mirrors WeatherForecastPage exactly
const buildStatCards = (weatherData: any): StatCard[] => [
  {
    label: "Temperature",
    icon: Thermometer,
    color: FAO_BLUE,
    min: 15,
    max: 40,
    value: `${weatherData?.temperature ?? 0}°C`,
    change: fmtDelta(weatherData?.temperature_delta ?? 0, "°C"),
    trend: trendOf(weatherData?.temperature_delta ?? 0),
    thresholds: [
      { value: 20, color: "#3b82f6", label: "Cool" },
      { value: 28, color: "#22c55e", label: "Normal" },
      { value: 35, color: "#f97316", label: "Warm" },
      { value: 40, color: "#dc2626", label: "Hot" },
    ],
  },
  {
    label: "Humidity",
    icon: Droplets,
    color: FAO_BLUE,
    min: 0,
    max: 100,
    value: `${weatherData?.humidity ?? 0}%`,
    change: fmtDelta(weatherData?.humidity_delta ?? 0, "%"),
    trend: trendOf(weatherData?.humidity_delta ?? 0),
    thresholds: [
      { value: 30, color: "#dc2626", label: "Dry" },
      { value: 50, color: "#fbbf24", label: "Low" },
      { value: 70, color: "#22c55e", label: "Normal" },
      { value: 85, color: "#dc2626", label: "High" },
    ],
  },
  {
    label: "Wind Speed",
    icon: Wind,
    color: FAO_BLUE,
    min: 0,
    max: 60,
    value: `${weatherData?.wind_speed ?? 0} km/h`,
    change: fmtDelta(weatherData?.wind_speed_delta ?? 0, " km/h"),
    trend: trendOf(weatherData?.wind_speed_delta ?? 0),
    thresholds: [
      { value: 10, color: "#22c55e", label: "Calm" },
      { value: 25, color: "#3b82f6", label: "Breezy" },
      { value: 40, color: "#f97316", label: "Windy" },
      { value: 60, color: "#dc2626", label: "Strong" },
    ],
  },
  {
    label: "Rainfall (24h)",
    icon: CloudRain,
    color: FAO_BLUE,
    min: 0,
    max: 100,
    value: `${weatherData?.rainfall_24h ?? 0} mm`,
    change: fmtDelta(weatherData?.rainfall_24h_delta ?? 0, " mm"),
    trend: trendOf(weatherData?.rainfall_24h_delta ?? 0),
    thresholds: [
      { value: 5, color: "#22c55e", label: "Dry" },
      { value: 20, color: "#3b82f6", label: "Light" },
      { value: 50, color: "#f97316", label: "Moderate" },
      { value: 100, color: "#dc2626", label: "Heavy" },
    ],
  },
];

// Loading placeholder cards — neutral until real data arrives
const getDefaultStatCards = (): StatCard[] => buildStatCards(null);

const getDefaultMonitoringModules = (): MonitoringModule[] => [
  {
    id: "weather" as PageType,
    title: "Weather Forecast",
    description:
      "24-hour nowcasting & 7-day forecasts with high accuracy predictions",
    icon: Cloud,
    metric: "Accuracy: --",
    alerts: 0,
    color: FAO_BLUE,
  },
  {
    id: "drought" as PageType,
    title: "Drought Monitor",
    description:
      "Combined Drought Index with TDI, PDI, VDI components for risk assessment",
    icon: Sun,
    metric: "Districts at Risk: --",
    alerts: 0,
    color: FAO_BLUE,
  },
  {
    id: "flood" as PageType,
    title: "Flood Monitor",
    description:
      "Real-time river discharge monitoring and early warning systems",
    icon: Waves,
    metric: "Alert Areas: --",
    alerts: 0,
    color: FAO_BLUE,
  },
  {
    id: "stations" as PageType,
    title: "Weather Stations",
    description: "Automatic Weather Station network monitoring across Uganda",
    icon: Radio,
    metric: "Online: --",
    alerts: 0,
    color: FAO_BLUE,
  },
];

// Helper function to format time ago
const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "recently";
  }
};

// Helper to get legend items based on selected module
const getOverviewLegendItems = (selectedModule: string) => {
  const allItems = [
    { label: "Weather", color: FAO_BLUE, id: "weather" },
    { label: "Drought", color: "#f97316", id: "drought" },
    { label: "Flood", color: "#06b6d4", id: "flood" },
    { label: "Stations", color: "#22c55e", id: "stations" },
  ];

  if (selectedModule === "all") return allItems;
  return allItems.filter((item) => item.id === selectedModule);
};

// Helper to get badge text based on selected module
const getOverviewBadgeText = (
  selectedModule: string,
  modules: MonitoringModule[],
) => {
  if (selectedModule === "all") return "Uganda";
  const module = modules.find((m) => m.id === selectedModule);
  return module ? module.title : "Uganda";
};

// Map Filters Component
const MapFilters = ({
  isDarkMode,
  selectedModule,
  onModuleChange,
}: {
  isDarkMode: boolean;
  selectedModule: string;
  onModuleChange: (module: string) => void;
}) => {
  const modules = [
    { id: "all", label: "All Modules", icon: Filter, color: FAO_BLUE },
    { id: "weather", label: "Weather Forecast", icon: Cloud, color: FAO_BLUE },
    // { id: "drought", label: "Drought Monitor", icon: Sun, color: FAO_BLUE },
    { id: "flood", label: "Flood Monitor", icon: Waves, color: FAO_BLUE },
    { id: "stations", label: "Weather Stations", icon: Radio, color: FAO_BLUE },
  ];

  return (
    <div className="space-y-1">
      {modules.map((module) => {
        const Icon = module.icon;
        const isSelected = selectedModule === module.id;
        return (
          <button
            key={module.id}
            onClick={() => onModuleChange(module.id)}
            className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
              isSelected
                ? isDarkMode
                  ? "bg-slate-700/80"
                  : "bg-blue-50"
                : isDarkMode
                  ? "hover:bg-slate-700/40"
                  : "hover:bg-slate-50"
            }`}
          >
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center p-0.5"
              style={{
                backgroundColor: isSelected
                  ? `${module.color}30`
                  : `${module.color}15`,
              }}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: module.color }} />
            </div>
            <span
              className={`text-xs font-medium ${isSelected ? (isDarkMode ? "text-white" : "text-slate-900") : isDarkMode ? "text-slate-300" : "text-slate-600"}`}
            >
              {module.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default function OverviewPage({
  onNavigate,
  isDarkMode = true,
}: OverviewPageProps) {
  const { selectedDistrictId } = useAppStore((state) => state);

  const [selectedModule, setSelectedModule] = useState("all");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // const [sliderValue, setSliderValue] = useState((2026 - 2001) * 12 + 2);

  // State
  const [statCards, setStatCards] = useState<StatCard[]>(getDefaultStatCards());
  const [monitoringModules, setMonitoringModules] = useState(
    getDefaultMonitoringModules(),
  );
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [quickStats, setQuickStats] = useState({
    activeAlerts: 0,
    stationsOnline: 0,
    stationsTotal: 0,
    lastUpdated: "",
  });
  const [apiError, setApiError] = useState<string | null>(null);

  // const getMonthYear = (months: number) => {
  //   const year = 2001 + Math.floor(months / 12);
  //   const month = months % 12;
  //   const monthNames = [
  //     "Jan",
  //     "Feb",
  //     "Mar",
  //     "Apr",
  //     "May",
  //     "Jun",
  //     "Jul",
  //     "Aug",
  //     "Sep",
  //     "Oct",
  //     "Nov",
  //     "Dec",
  //   ];
  //   return `${monthNames[month]} ${year}`;
  // };

  useEffect(() => {
    const fetchOverviewStats = async () => {
      try {
        const [moduleStats, quickStatsData, weatherData, alertsData] =
          await Promise.all([
            overviewAPI.getModuleStats() as Promise<any>,
            overviewAPI.getQuickStats() as Promise<any>,
            weatherAPI.getDashboard() as Promise<any>,
            alertsAPI.getRecent(5) as Promise<any>,
          ]);

        // Update monitoring modules with API data
        if (moduleStats && moduleStats.weather_forecast) {
          setMonitoringModules((prev) => {
            const updated = [...prev];
            updated[0].metric = `Accuracy: ${moduleStats.weather_forecast.accuracy_pct || "--"}%`;
            updated[1].metric = `Districts at Risk: ${moduleStats.drought_monitor?.districts_at_risk || "--"}`;
            updated[2].metric = `Alert Areas: ${moduleStats.flood_monitor?.alert_areas || "--"}`;
            updated[3].metric = `Online: ${moduleStats.weather_stations?.online || "--"}/${moduleStats.weather_stations?.total || "--"}`;
            return updated;
          });
        }

        // Update quick stats
        if (quickStatsData) {
          setQuickStats({
            activeAlerts: quickStatsData.active_alerts || 0,
            stationsOnline: quickStatsData.stations_online || 0,
            stationsTotal: quickStatsData.stations_total || 0,
            lastUpdated: quickStatsData.last_updated
              ? new Date(quickStatsData.last_updated).toLocaleString()
              : "Just now",
          });
        }

        // ── KEY FIX: Build fresh stat cards from API data ──────────────────
        // Never spread stale state. Always build new objects from weatherData
        // so deltas and trends are correct on every fetch.
        if (weatherData) {
          setStatCards(buildStatCards(weatherData));
        }

        // Update recent alerts
        if (alertsData && Array.isArray(alertsData.results)) {
          const formatted = alertsData.results
            .slice(0, 3)
            .map((alert: any) => ({
              title: alert.title || alert.message || "Alert",
              location: alert.location || "Uganda",
              time: alert.created_at
                ? formatTimeAgo(alert.created_at)
                : "Recently",
              type: alert.alert_type || "alert",
              severity: alert.severity === "high" ? "high" : "medium",
            }));
          setRecentAlerts(formatted);
        }

        setApiError(null);
      } catch (error) {
        console.error("Error fetching overview data:", error);
        setApiError("Unable to load overview data. Using cached values.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverviewStats();
    const interval = setInterval(fetchOverviewStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedDistrictId]);

  const cardBg = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300" : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText = isDarkMode ? "text-white" : "text-slate-900";

  if (isLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          ></div>
          <p className={textMuted}>Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 min-h-screen relative">
      {/* Animated Background - Only in Dark Mode */}
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-15 animate-pulse"
            style={{ backgroundColor: FAO_BLUE, animationDuration: "4s" }}
          />
          <div
            className="absolute top-1/2 -left-40 w-80 h-80 rounded-full blur-3xl opacity-10 animate-pulse bg-blue-400"
            style={{ animationDuration: "6s", animationDelay: "1s" }}
          />
        </div>
      )}

      {/* Error notification */}
      {apiError && (
        <div
          className={`mb-4 p-3 rounded-lg border-l-4 ${isDarkMode ? "bg-yellow-900/20 border-yellow-600 text-yellow-200" : "bg-yellow-50 border-yellow-400 text-yellow-800"}`}
        >
          <p className="text-xs font-medium">{apiError}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-4 md:mb-6 animate-fade-in-up">
          <h1
            className={`text-xl md:text-2xl font-bold mb-0.5 md:mb-1 ${headerText}`}
          >
            Dashboard Overview
          </h1>
          <p className={`text-sm ${textMuted}`}>
            Welcome to Uganda Multi Hazard Observatory System
          </p>
        </div>

        {/* Stat Cards — identical structure to WeatherForecastPage */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
            <span
              className={`text-xs font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}
            >
              Kampala, Central Region
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: isDarkMode ? `${FAO_BLUE}30` : `${FAO_BLUE}20`,
                color: FAO_BLUE,
              }}
            >
              Live
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
            {statCards.map((card, index) => {
              const Icon = card.icon;
              const numericValue =
                parseFloat(card.value.replace(/[^0-9.]/g, "")) || 0;
              return (
                <div
                  key={index}
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl p-2.5 md:p-3 shadow-sm animate-fade-in-up transition-all hover:shadow-md`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div>
                      <p
                        className={`text-[10px] md:text-xs ${textMuted} mb-0.5`}
                      >
                        {card.label}
                      </p>
                      <p
                        className={`text-base md:text-lg font-bold ${headerText}`}
                      >
                        {card.value}
                      </p>
                    </div>
                    <div
                      className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${FAO_BLUE}20` }}
                    >
                      <Icon
                        className="w-3.5 h-3.5 md:w-4 md:h-4"
                        style={{ color: FAO_BLUE }}
                      />
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1 text-[10px] ${getTrendColor(card.trend, isDarkMode)}`}
                  >
                    {getTrendIcon(card.trend)}
                    <span>{card.change}</span>
                  </div>
                  <ThresholdScale
                    value={numericValue}
                    min={card.min}
                    max={card.max}
                    thresholds={card.thresholds}
                    isDarkMode={isDarkMode}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* MOBILE LAYOUT */}
        <div className="block lg:hidden space-y-3">
          <div className="relative">
            <div
              className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg overflow-hidden shadow-sm`}
            >
              <div
                className={`flex items-center justify-between p-2 border-b ${borderColor}`}
              >
                <div className="flex items-center gap-1.5">
                  <MapIcon
                    className="w-3.5 h-3.5"
                    style={{ color: FAO_BLUE }}
                  />
                  <h2 className={`text-xs font-semibold ${headerText}`}>
                    Uganda Map
                  </h2>
                </div>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: isDarkMode
                      ? `${FAO_BLUE}30`
                      : `${FAO_BLUE}20`,
                    color: FAO_BLUE,
                  }}
                >
                  Live
                </span>
              </div>
              <div className="relative aspect-[4/3] flex flex-col">
                <div className="flex-1 relative">
                  <OverviewMap
                    isDarkMode={isDarkMode}
                    className="absolute inset-0 w-full h-full rounded-xl md:rounded-2xl"
                    badgeText={getOverviewBadgeText(
                      selectedModule,
                      monitoringModules,
                    )}
                    legendTitle="Legend"
                    legendItems={getOverviewLegendItems(selectedModule)}
                  />
                </div>
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <Filter className="w-4 h-4" />
                </button>
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
                      Map Filters
                    </h4>
                    <button
                      onClick={() => setShowMobileFilters(false)}
                      className={`p-1 rounded-md ${isDarkMode ? "hover:bg-slate-700" : "hover:bg-slate-100"}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <MapFilters
                    isDarkMode={isDarkMode}
                    selectedModule={selectedModule}
                    onModuleChange={(mod) => {
                      setSelectedModule(mod);
                      setShowMobileFilters(false);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* DESKTOP LAYOUT */}
        <div className="hidden lg:flex lg:flex-col gap-4">
          {/* Monitoring Modules */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${FAO_BLUE}20` }}
                >
                  <Cloud className="w-4 h-4" style={{ color: FAO_BLUE }} />
                </div>
                <h2 className={`text-base font-semibold ${headerText}`}>
                  Monitoring Modules
                </h2>
              </div>
              <button
                className="flex items-center gap-1 text-xs transition-colors hover:opacity-80"
                style={{ color: FAO_BLUE }}
              >
                View All <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {monitoringModules.map((module) => {
                const Icon = module.icon;
                return (
                  <button
                    key={module.id}
                    onClick={() => onNavigate(module.id)}
                    className={`relative flex flex-col overflow-hidden rounded-xl p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md group border ${isDarkMode ? "border-slate-700/50" : "border-slate-200"}`}
                    style={{
                      minHeight: "150px",
                      background: isDarkMode
                        ? `linear-gradient(135deg, ${module.color}30 0%, rgba(15, 23, 42, 1) 100%)`
                        : `linear-gradient(135deg, ${module.color}20 0%, rgba(241, 245, 249, 1) 100%)`,
                    }}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
                      <Icon
                        className="w-24 h-24"
                        style={{ color: module.color }}
                      />
                    </div>
                    <div className="relative z-10 flex-1 flex flex-col justify-between w-full">
                      <div className="flex items-center justify-between mb-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                          style={{
                            backgroundColor: isDarkMode
                              ? `${module.color}30`
                              : "white",
                            border: isDarkMode
                              ? `1px solid ${module.color}40`
                              : `1px solid ${module.color}20`,
                          }}
                        >
                          <Icon
                            className="w-5 h-5"
                            style={{ color: module.color }}
                          />
                        </div>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${isDarkMode ? "bg-slate-800/50" : "bg-white/60"} group-hover:shadow-sm`}
                        >
                          <ArrowRight
                            className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                            style={{ color: module.color }}
                          />
                        </div>
                      </div>
                      <div>
                        <p
                          className={`text-sm font-semibold mb-1 ${headerText}`}
                        >
                          {module.title}
                        </p>
                        <p
                          className={`text-[11px] ${textMuted} line-clamp-2 leading-relaxed mb-3`}
                        >
                          {module.description}
                        </p>
                        <div
                          className="inline-flex items-center px-2 py-1 rounded border"
                          style={{
                            backgroundColor: isDarkMode
                              ? `${module.color}10`
                              : "white",
                            borderColor: `${module.color}30`,
                            color: module.color,
                          }}
                        >
                          <span className="text-[10px] font-medium">
                            {module.metric}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Map and Sidebar Grid */}
          <div className="grid lg:grid-cols-12 gap-4">
            {/* Left Sidebar */}
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
                <div className="mt-1 mb-4">
                  <div
                    className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/80 border-slate-700/30" : "bg-white/90 border-slate-200"} border shadow-sm`}
                  >
                    <h3
                      className={`text-xs font-semibold mb-2 ${isDarkMode ? "text-white" : "text-slate-900"}`}
                    >
                      Map Filters
                    </h3>
                    <MapFilters
                      isDarkMode={isDarkMode}
                      selectedModule={selectedModule}
                      onModuleChange={setSelectedModule}
                    />
                  </div>
                </div>

                <div
                  className={`p-3 rounded-xl ${isDarkMode ? "bg-slate-800/60" : "bg-white/70"} border ${isDarkMode ? "border-slate-700/30" : "border-slate-200"}`}
                >
                  <h3 className={`text-xs font-semibold mb-2 ${headerText}`}>
                    Quick Stats
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${textMuted}`}>
                        Active Alerts
                      </span>
                      <span className="text-[11px] font-medium text-red-500">
                        {quickStats.activeAlerts}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${textMuted}`}>
                        Stations Online
                      </span>
                      <span className="text-[11px] font-medium text-green-500">
                        {quickStats.stationsOnline}/{quickStats.stationsTotal}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${textMuted}`}>
                        Updated
                      </span>
                      <span className={`text-[11px] ${textSecondary}`}>
                        {quickStats.lastUpdated}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-3">
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{
                      backgroundImage: "url(/climate-illustration.png)",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      height: "120px",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Map and Alerts Row */}
            <div className="lg:col-span-9 grid grid-cols-12 gap-4 h-[520px] xl:h-[600px] 2xl:h-[680px]">
              {/* Map */}
              <div className="col-span-9 h-full">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-xl overflow-hidden shadow-sm h-full flex flex-col`}
                >
                  <div
                    className={`flex items-center justify-between p-2 border-b ${borderColor}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapIcon
                        className="w-4 h-4"
                        style={{ color: FAO_BLUE }}
                      />
                      <h2 className={`text-sm font-semibold ${headerText}`}>
                        Uganda Map View
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] ${textMuted}`}>
                        Lat: 1.3733° N
                      </span>
                      <span className={`text-[11px] ${textMuted}`}>
                        Long: 32.2903° E
                      </span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: isDarkMode
                            ? `${FAO_BLUE}30`
                            : `${FAO_BLUE}20`,
                          color: FAO_BLUE,
                        }}
                      >
                        Live
                      </span>
                    </div>
                  </div>
                  <div className="relative flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 relative min-h-0">
                      <OverviewMap
                        isDarkMode={isDarkMode}
                        className="absolute inset-0 w-full h-full rounded-xl md:rounded-2xl"
                        badgeText={getOverviewBadgeText(
                          selectedModule,
                          monitoringModules,
                        )}
                        legendTitle="Legend"
                        legendItems={getOverviewLegendItems(selectedModule)}
                      />
                    </div>
                    {/* <div
                      className={`px-4 py-3 border-t ${borderColor} flex items-center gap-4 ${isDarkMode ? "bg-slate-800/80" : "bg-slate-50"}`}
                    >
                      <span className={`text-xs font-medium ${textMuted}`}>
                        2001
                      </span>
                      <input
                        type="range"
                        min="0"
                        max={(2026 - 2001 + 1) * 12 - 1}
                        value={sliderValue}
                        onChange={(e) =>
                          setSliderValue(parseInt(e.target.value))
                        }
                        className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                        style={{
                          backgroundColor: isDarkMode ? "#334155" : "#cbd5e1",
                          accentColor: FAO_BLUE,
                        }}
                      />
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap"
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
              </div>

              {/* Recent Alerts */}
              <div className="col-span-3">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-xl p-3 shadow-sm h-full flex flex-col`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle
                        className="w-4 h-4"
                        style={{ color: FAO_BLUE }}
                      />
                      <h3 className={`text-sm font-semibold ${headerText}`}>
                        Recent Alerts
                      </h3>
                    </div>
                    <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                      4 New
                    </span>
                  </div>
                  <div className="space-y-2 flex-1 overflow-y-auto max-h-[280px]">
                    {recentAlerts.length > 0 ? (
                      recentAlerts.map((alert, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border ${isDarkMode ? "bg-slate-900/50 border-slate-700/30" : "bg-slate-50 border-slate-200"}`}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${alert.severity === "high" ? "bg-red-500/20" : "bg-yellow-500/20"}`}
                            >
                              <AlertTriangle
                                className={`w-3.5 h-3.5 ${alert.severity === "high" ? "text-red-500" : "text-yellow-500"}`}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-[11px] font-medium truncate ${headerText}`}
                              >
                                {alert.title}
                              </p>
                              <div
                                className={`flex items-center gap-2 text-[10px] ${textMuted}`}
                              >
                                <span className="flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {alert.location}
                                </span>
                                <span>{alert.time}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className={`p-3 text-center text-xs ${textMuted}`}>
                        <p>No recent alerts</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
