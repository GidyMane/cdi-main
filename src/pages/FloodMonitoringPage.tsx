import { useState, useRef, useEffect } from "react";
import {
  Waves,
  MapPin,
  Download,
  TrendingUp,
  AlertTriangle,
  Info,
  Droplets,
  ChevronUp,
  ChevronDown,
  Minus,
  Users,
  Filter,
  X,
  Clock,
  RefreshCw,
} from "lucide-react";
import FloodMonitorMap from "../components/map/FloodMonitorMap";
import { useFloodData } from "../hooks/useFloodData";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import { useAppStore } from "@/store/useAppStore";

interface FloodMonitoringPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

// Fallback mock data for when API data is not available
const fallbackRiverBasins = [
  {
    name: "Nile Basin",
    level: 4.2,
    trend: "up" as const,
    population: 620000,
    rainfall: 85,
    discharge: 3200,
    status: "severe" as const,
  },
  {
    name: "Victoria Nile",
    level: 3.8,
    trend: "up" as const,
    population: 620000,
    rainfall: 78,
    discharge: 2800,
    status: "severe" as const,
  },
  {
    name: "Albert Nile",
    level: 2.9,
    trend: "stable" as const,
    population: 540000,
    rainfall: 65,
    discharge: 1900,
    status: "moderate" as const,
  },
  {
    name: "Kafu River",
    level: 2.4,
    trend: "up" as const,
    population: 180000,
    rainfall: 72,
    discharge: 1200,
    status: "moderate" as const,
  },
  {
    name: "Mpologoma",
    level: 1.8,
    trend: "down" as const,
    population: 95000,
    rainfall: 45,
    discharge: 800,
    status: "minor" as const,
  },
  {
    name: "Manafwa",
    level: 1.5,
    trend: "stable" as const,
    population: 78000,
    rainfall: 38,
    discharge: 650,
    status: "minor" as const,
  },
  {
    name: "Malaba",
    level: 0.9,
    trend: "stable" as const,
    population: 65000,
    rainfall: 28,
    discharge: 420,
    status: "normal" as const,
  },
  {
    name: "Okot",
    level: 0.7,
    trend: "down" as const,
    population: 32000,
    rainfall: 22,
    discharge: 310,
    status: "normal" as const,
  },
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

const getStatusColor = (status: string) => {
  switch (status) {
    case "severe":
      return "text-red-500";
    case "moderate":
      return "text-orange-500";
    case "minor":
      return "text-yellow-500";
    default:
      return "text-green-500";
  }
};

const getStatusBg = (status: string) => {
  switch (status) {
    case "severe":
      return "bg-red-500/20";
    case "moderate":
      return "bg-orange-500/20";
    case "minor":
      return "bg-yellow-500/20";
    default:
      return "bg-green-500/20";
  }
};

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case "up":
      return <ChevronUp className="w-4 h-4 text-red-500" />;
    case "down":
      return <ChevronDown className="w-4 h-4 text-green-500" />;
    default:
      return <Minus className="w-4 h-4 text-yellow-500" />;
  }
};

const FilterContent = ({
  timeRange,
  setTimeRange,
  selectedBasin,
  setSelectedBasin,
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
  isDarkMode: boolean;
  textMuted: string;
  textSecondary: string;
  borderColor: string;
  headerText: string;
  dateRange: string;
  setDateRange: (dateRange: string) => void;
  riverBasins: Array<{
    name: string;
    level: number;
    trend: string;
    population: number;
    rainfall: number;
    discharge: number;
    status: string;
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
      <select
        value={timeRange}
        onChange={(e) => setTimeRange(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        <option value="Last 24 Hours">Last 24 Hours</option>
        <option value="Last 7 Days">Last 7 Days</option>
        <option value="Last 30 Days">Last 30 Days</option>
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>River Basin</label>
      <select
        value={selectedBasin}
        onChange={(e) => setSelectedBasin(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        {riverBasins.map((b) => (
          <option key={b.name} value={b.name}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Alert Level</label>
      <div className="space-y-1.5">
        {["All Levels", "Critical Only", "Warning Only", "Normal"].map(
          (level) => (
            <label
              key={level}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                className={`rounded ${isDarkMode ? "bg-slate-700 border-slate-600" : "bg-white border-slate-300"}`}
                defaultChecked={level === "All Levels"}
              />
              <span className={textSecondary}>{level}</span>
            </label>
          ),
        )}
      </div>
    </div>
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${headerText}`}>
        Quick Stats
      </h4>
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
          <span className="font-medium" style={{ color: FAO_BLUE }}>
            54mm
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className={textMuted}>Active Alerts</span>
          <span className="text-red-500 font-medium">3</span>
        </div>
      </div>
    </div>
  </div>
);

// Map Component with Legend
const FloodMap = ({
  isDarkMode,
  className = "",
}: {
  isDarkMode: boolean;
  className?: string;
}) => {
  return (
    <FloodMonitorMap
      isDarkMode={isDarkMode}
      className={`rounded-lg md:rounded-xl ${className}`}
      badgeText="2 Critical"
      legendTitle="Flood Levels"
      legendItems={[
        { label: "Extreme Flood", color: "#b91c1c" },
        { label: "Severe Flood", color: "#ef4444" },
        { label: "Moderate Flood", color: "#f97316" },
        { label: "Minor Flood", color: "#eab308" },
        { label: "Normal", color: "#22c55e" },
      ]}
    />
  );
};

export default function FloodMonitoringPage({
  isDarkMode = true,
}: FloodMonitoringPageProps) {
  const { dateRange, setDateRange, setLayerMode } = useAppStore(
    (state) => state,
  );
  const [timeRange, setTimeRange] = useState("Last 24 Hours");
  const [selectedBasin, setSelectedBasin] = useState("Nile Basin");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  // const [sliderValue, setSliderValue] = useState((2026 - 2001) * 12 + 2); // Mar 2026
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch flood data from API
  const {
    basinStatus,
    basinTrend,
    loading: dataLoading,
    partialErrors = {},
    refetch,
  } = useFloodData();
  const [pageLoading, setPageLoading] = useState(true);

  //set default layer mode

  useEffect(() => {
    setLayerMode("forecast");
  }, []);

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
            basinTrend?.trend === "rising"
              ? "up"
              : basinTrend?.trend === "falling"
                ? "down"
                : "stable";
          return {
            name: basin.name,
            level: basin.level,
            trend,
            population: basin.population_at_risk,
            discharge: basin.discharge_rate,
            rainfall: 0, // Not provided by API yet
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
  const criticalBasins = riverBasins.filter(
    (b) => b.status === "severe" || b.status === "extreme",
  ).length;
  const atRiskPopulation = riverBasins.reduce(
    (sum, b) => sum + b.population,
    0,
  );
  const severeCount = riverBasins.filter((b) => b.status === "severe").length;
  const moderateCount = riverBasins.filter(
    (b) => b.status === "moderate",
  ).length;
  const minorCount = riverBasins.filter((b) => b.status === "minor").length;
  const normalCount = riverBasins.filter((b) => b.status === "normal").length;

  const cardBg = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300" : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText = isDarkMode ? "text-white" : "text-slate-900";

  if (pageLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-slate-900" : "bg-slate-50"}`}
      >
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${FAO_BLUE}30`, borderTopColor: FAO_BLUE }}
          ></div>
          <p className={textMuted}>Loading Flood Monitoring...</p>
        </div>
      </div>
    );
  }

  // Show error banner if data fetch failed
  const isUsingFallback =
    basinStatus.length === 0 ||
    Object.values(partialErrors).some((v) => v === true);

  return (
    <div className="p-4 md:p-6 min-h-screen">
      {/* Animated Background */}
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

      <div className="relative z-10 max-w-[1600px] mx-auto">
        {/* Fallback Data Banner */}
        {isUsingFallback && (
          <div></div>
          // <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start justify-between">
          //   <div className="flex items-start gap-2">
          //     <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          //     <div className="flex-1">
          //       <p className={`text-xs font-medium ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>Displaying Demo Data</p>
          //       <p className={`text-xs ${isDarkMode ? 'text-blue-300/70' : 'text-blue-600/70'}`}>
          //         Some real-time data sources are currently unavailable. Showing demo data instead. {basinStatus.length > 0 && 'Actual data will display once available.'}
          //       </p>
          //       {Object.entries(partialErrors).filter(([_, failed]) => failed).length > 0 && (
          //         <div className={`text-xs mt-1.5 space-y-0.5 ${isDarkMode ? 'text-blue-300/60' : 'text-blue-600/60'}`}>
          //           <p className="font-medium">Unavailable sources:</p>
          //           <div className="flex flex-wrap gap-1">
          //             {Object.entries(partialErrors).filter(([_, failed]) => failed).map(([key]) => (
          //               <span key={key} className={`px-1.5 py-0.5 rounded text-[10px] ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
          //                 {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
          //               </span>
          //             ))}
          //           </div>
          //         </div>
          //       )}
          //     </div>
          //   </div>
          //   <button
          //     onClick={() => refetch()}
          //     disabled={dataLoading}
          //     className={`flex-shrink-0 ml-2 text-xs font-medium px-2 py-1 rounded ${isDarkMode ? 'hover:bg-blue-500/20' : 'hover:bg-blue-100'} disabled:opacity-50`}
          //   >
          //     Retry
          //   </button>
          // </div>
        )}

        {/* Compact Header Banner */}
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
                  Flood Monitoring
                </h1>
                <p className="text-slate-200 text-xs md:text-sm">
                  Real-time rainfall data and flood risk assessment{" "}
                  {isUsingFallback && "(Demo Data)"}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {criticalBasins > 0 && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(239, 68, 68, 0.4)" }}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {criticalBasins} Severe Alert
                      {criticalBasins !== 1 ? "s" : ""}
                    </span>
                  )}
                  {basinTrend?.trend === "rising" && (
                    <span
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                    >
                      <Droplets className="w-3 h-3" />
                      Rising Levels
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetch()}
                  disabled={dataLoading}
                  className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 disabled:opacity-50 rounded-lg text-xs font-medium text-white transition-colors"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${dataLoading ? "animate-spin" : ""}`}
                  />
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
                  timeRange={timeRange}
                  setTimeRange={setTimeRange}
                  selectedBasin={selectedBasin}
                  setSelectedBasin={setSelectedBasin}
                  isDarkMode={isDarkMode}
                  textMuted={textMuted}
                  textSecondary={textSecondary}
                  borderColor={borderColor}
                  headerText={headerText}
                  riverBasins={riverBasins}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                />
              </div>

              {/* Illustration at bottom */}
              <div className="mt-3 flex-1 flex relative min-h-[140px]">
                <div
                  className="absolute inset-0 rounded-xl overflow-hidden"
                  style={{
                    backgroundImage: "url(/flood-illustration.png)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-9 space-y-3">
            {/* Map and Charts Row */}
            <div className="grid grid-cols-12 gap-3 h-[550px] xl:h-[620px] 2xl:h-[700px]">
              {/* Map - 7 columns */}
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
                    <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                      2 Critical
                    </span>
                  </div>
                  <div className="flex-1 relative min-h-0">
                    <FloodMap
                      isDarkMode={isDarkMode}
                      className="absolute inset-0 w-full h-full"
                    />
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                      <FloodHourSlider
                        floating
                        isDarkMode={isDarkMode}
                        borderColor={borderColor}
                        textMuted={textMuted}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - 5 columns */}
              <div className="col-span-5 flex flex-col gap-3">
                {/* Flood Summary */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
                >
                  <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
                    Flood Summary
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-red-500">
                        {severeCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Severe</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-500">
                        {moderateCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Moderate</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-yellow-500">
                        {minorCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Minor</p>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-green-500">
                        {normalCount}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>Normal</p>
                    </div>
                  </div>
                  <div className={`mt-2 pt-2 border-t ${borderColor}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Users className={`w-3.5 h-3.5 ${textMuted}`} />
                        <span className={`text-xs ${textMuted}`}>
                          Population at Risk
                        </span>
                      </div>
                      <span className={`text-sm font-bold ${headerText}`}>
                        {(atRiskPopulation / 1000000).toFixed(1)}M
                      </span>
                    </div>
                  </div>
                </div>

                {/* Time Series Chart */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3
                      className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}
                    >
                      <Clock className="w-4 h-4" style={{ color: FAO_BLUE }} />
                      {selectedBasin} - 24h Trend
                    </h3>
                  </div>
                  <div className="h-32 relative">
                    <div
                      className={`absolute left-0 top-0 bottom-5 w-6 flex flex-col justify-between text-[10px] ${textMuted}`}
                    >
                      <span>5m</span>
                      <span>4m</span>
                      <span>3m</span>
                      <span>2m</span>
                      <span>1m</span>
                    </div>
                    <div className="ml-6 h-full relative">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`absolute left-0 right-0 h-px ${isDarkMode ? "bg-slate-700/50" : "bg-slate-200"}`}
                          style={{ top: `${i * 25}%` }}
                        />
                      ))}
                      <svg
                        ref={svgRef}
                        key={selectedBasin}
                        className="w-full h-[85%]"
                        viewBox="0 0 400 120"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="floodGradient"
                            x1="0%"
                            y1="0%"
                            x2="0%"
                            y2="100%"
                          >
                            <stop
                              offset="0%"
                              stopColor={FAO_BLUE}
                              stopOpacity="0.3"
                            />
                            <stop
                              offset="100%"
                              stopColor={FAO_BLUE}
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d={`M0,${120 - ((timeSeriesData[0].level - 1) / 4) * 120} ${timeSeriesData.map((d, i) => `L${(i / (timeSeriesData.length - 1)) * 400},${120 - ((d.level - 1) / 4) * 120}`).join(" ")} L400,120 L0,120 Z`}
                          fill="url(#floodGradient)"
                        />
                        <polyline
                          fill="none"
                          stroke={FAO_BLUE}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={timeSeriesData
                            .map(
                              (d, i) =>
                                `${(i / (timeSeriesData.length - 1)) * 400},${120 - ((d.level - 1) / 4) * 120}`,
                            )
                            .join(" ")}
                        />
                        {timeSeriesData.map((d, i) => (
                          <circle
                            key={i}
                            cx={(i / (timeSeriesData.length - 1)) * 400}
                            cy={120 - ((d.level - 1) / 4) * 120}
                            r="3"
                            fill={FAO_BLUE}
                          />
                        ))}
                      </svg>
                      <div
                        className={`flex justify-between text-[10px] ${textMuted} mt-1`}
                      >
                        {timeSeriesData.map((d, i) => (
                          <span key={i}>{d.time}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className={`text-[10px] ${textMuted}`}>
                      Current:{" "}
                      <span className="font-medium" style={{ color: FAO_BLUE }}>
                        4.25m
                      </span>
                    </span>
                    <span className={`text-[10px] ${textMuted}`}>
                      Trend:{" "}
                      <span className="text-red-500 font-medium flex items-center gap-0.5">
                        <TrendingUp className="w-3 h-3" />
                        Rising
                      </span>
                    </span>
                  </div>
                </div>

                {/* River Basin Status - Right Column Desktop */}
                <div
                  className={`hidden lg:flex flex-col ${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1`}
                >
                  <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
                    River Basin Status
                  </h3>
                  <div
                    className="overflow-y-auto pr-1"
                    style={{ maxHeight: "170px" }}
                  >
                    <div className="space-y-1.5">
                      {riverBasins.map((basin, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? "bg-slate-700/30" : "bg-slate-100"}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-2 h-2 rounded-full ${getStatusColor(basin.status).replace("text", "bg")}`}
                            ></div>
                            <div>
                              <p
                                className={`text-xs font-medium truncate max-w-[90px] ${headerText}`}
                                title={basin.name}
                              >
                                {basin.name}
                              </p>
                              <p className={`text-[10px] ${textMuted}`}>
                                Pop: {(basin.population / 1000).toFixed(0)}k
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-right">
                            <div className="hidden xl:block">
                              <p className={`text-[10px] ${textMuted}`}>
                                Trend
                              </p>
                              <div className="flex justify-end">
                                {getTrendIcon(basin.trend)}
                              </div>
                            </div>
                            <div>
                              <p className={`text-[10px] ${textMuted}`}>
                                Level
                              </p>
                              <p
                                className={`text-xs font-bold ${getStatusColor(basin.status)}`}
                              >
                                {basin.level}m
                              </p>
                            </div>
                            <div className="w-14">
                              <span
                                className={`inline-block text-center text-[9px] px-1 py-0.5 rounded w-full ${getStatusBg(basin.status)} ${getStatusColor(basin.status)}`}
                              >
                                {basin.status}
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

            {/* About Container - After Graph */}
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
                Real-time monitoring of Uganda's major river basins with
                automated alerts when water levels exceed safe thresholds. Data
                is collected from multiple sensors and updated every 15 minutes.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <Droplets
                    className="w-3.5 h-3.5"
                    style={{ color: FAO_BLUE }}
                  />
                  Rainfall monitoring
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <TrendingUp
                    className="w-3.5 h-3.5"
                    style={{ color: FAO_BLUE }}
                  />
                  Trend analysis
                </div>
                <div
                  className={`flex items-center gap-1.5 text-xs ${textSecondary}`}
                >
                  <Waves className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
                  Flow discharge tracking
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="block lg:hidden space-y-3">
          {/* Flood Summary (above map) */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
              Flood Summary
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-red-500">{severeCount}</p>
                <p className={`text-[10px] ${textMuted}`}>Severe</p>
              </div>
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-orange-500">
                  {moderateCount}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Moderate</p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-yellow-500">
                  {minorCount}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Minor</p>
              </div>
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-green-500">
                  {normalCount}
                </p>
                <p className={`text-[10px] ${textMuted}`}>Normal</p>
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
                    River Basin Map
                  </h3>
                </div>
                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-500 rounded text-[10px] font-medium">
                  2 Critical
                </span>
              </div>
              <div className="relative aspect-video">
                <FloodMap
                  isDarkMode={isDarkMode}
                  className="absolute inset-0 w-full h-full"
                />
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

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[500]">
                  <FloodHourSlider
                    floating
                    isDarkMode={isDarkMode}
                    borderColor={borderColor}
                    textMuted={textMuted}
                  />
                </div>
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
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    textSecondary={textSecondary}
                    borderColor={borderColor}
                    headerText={headerText}
                    riverBasins={riverBasins}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                  />
                </div>
              </>
            )}
          </div>

          {/* Time Series Chart */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3
                className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}
              >
                <Clock className="w-4 h-4" style={{ color: FAO_BLUE }} />
                {selectedBasin} - 24h Trend
              </h3>
            </div>
            <div className="h-32 relative">
              <div
                className={`absolute left-0 top-0 bottom-5 w-6 flex flex-col justify-between text-[10px] ${textMuted}`}
              >
                <span>5m</span>
                <span>4m</span>
                <span>3m</span>
                <span>2m</span>
                <span>1m</span>
              </div>
              <div className="ml-6 h-full relative">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`absolute left-0 right-0 h-px ${isDarkMode ? "bg-slate-700/50" : "bg-slate-200"}`}
                    style={{ top: `${i * 25}%` }}
                  />
                ))}
                <svg
                  ref={svgRef}
                  key={selectedBasin}
                  className="w-full h-[85%]"
                  viewBox="0 0 400 120"
                  preserveAspectRatio="none"
                >
                  <defs>
                    <linearGradient
                      id="floodGradient"
                      x1="0%"
                      y1="0%"
                      x2="0%"
                      y2="100%"
                    >
                      <stop
                        offset="0%"
                        stopColor={FAO_BLUE}
                        stopOpacity="0.3"
                      />
                      <stop
                        offset="100%"
                        stopColor={FAO_BLUE}
                        stopOpacity="0"
                      />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M0,${120 - ((timeSeriesData[0].level - 1) / 4) * 120} ${timeSeriesData.map((d, i) => `L${(i / (timeSeriesData.length - 1)) * 400},${120 - ((d.level - 1) / 4) * 120}`).join(" ")} L400,120 L0,120 Z`}
                    fill="url(#floodGradient)"
                  />
                  <polyline
                    fill="none"
                    stroke={FAO_BLUE}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={timeSeriesData
                      .map(
                        (d, i) =>
                          `${(i / (timeSeriesData.length - 1)) * 400},${120 - ((d.level - 1) / 4) * 120}`,
                      )
                      .join(" ")}
                  />
                  {timeSeriesData.map((d, i) => (
                    <circle
                      key={i}
                      cx={(i / (timeSeriesData.length - 1)) * 400}
                      cy={120 - ((d.level - 1) / 4) * 120}
                      r="3"
                      fill={FAO_BLUE}
                    />
                  ))}
                </svg>
                <div
                  className={`flex justify-between text-[10px] ${textMuted} mt-1`}
                >
                  {timeSeriesData.map((d, i) => (
                    <span key={i}>{d.time}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* River Basin Status - Mobile */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <h3 className={`text-sm font-semibold mb-2 ${headerText}`}>
              River Basin Status
            </h3>
            <div className="space-y-1.5">
              {riverBasins.slice(0, 4).map((basin, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? "bg-slate-700/30" : "bg-slate-100"}`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${getStatusColor(basin.status).replace("text", "bg")}`}
                    ></div>
                    <div>
                      <p className={`text-xs font-medium ${headerText}`}>
                        {basin.name}
                      </p>
                      <p className={`text-[10px] ${textMuted}`}>
                        Level: {basin.level}m
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusBg(basin.status)} ${getStatusColor(basin.status)}`}
                  >
                    {basin.status}
                  </span>
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
        @keyframes wave { 0%, 100% { transform: translateX(-100%); opacity: 0; } 50% { transform: translateX(100%); opacity: 0.2; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}
