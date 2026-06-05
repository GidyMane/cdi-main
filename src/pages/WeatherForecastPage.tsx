import { useState, useEffect } from "react";
import {
  Cloud,
  Sun,
  CloudRain,
  CloudLightning,
  Wind,
  Droplets,
  Thermometer,
  Calendar,
  Clock,
  Filter,
  X,
  MapPin,
  Map as MapIcon,
  TrendingUp,
} from "lucide-react";
import WeatherForcastMap from "../components/map/WeatherForcastMap";
import { getTrendIcon, getTrendColor } from "../utils/chartHelpers";
import { ThresholdScale } from "../components/shared/ThresholdScale";
import { weatherAPI, DistrictsAPI } from "../services/api";
import type {
  DailyForecastResponse,
  district,
  ForecastPerHour,
  WeatherData,
} from "@/types/data_types";
import ExportData from "@/components/shared/ExportData";
import { normaliseDaily, normaliseHourly } from "@/utils/woker_fn";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import TabBar from "@/components/shared/TabBar";
import HourlyCards from "@/components/shared/HourlyCards";
import { DailyCards } from "@/components/shared/DailyCards";
import { useAppStore } from "@/store/useAppStore";
import { useQuery } from "@tanstack/react-query";
import FloodHourSlider from "@/components/shared/FloodHourSlider";
import Districts_list from "@/components/shared/Districts_list";
import { geoData } from "@/utils/geodata";

interface WeatherForecastPageProps {
  isDarkMode?: boolean;
}

const FAO_BLUE = "#318DDE";

// ── District centroid from geoData ────────────────────────────────────────────

function getDistrictCentroid(districtName: string): { lat: number; lng: number } | null {
  if (!geoData || !(geoData as any).features) return null;
  const name = districtName.trim().toLowerCase();
  const feature = (geoData as any).features.find(
    (f: any) => f?.properties?.name?.trim().toLowerCase() === name,
  );
  if (!feature?.geometry) return null;

  // Collect all coordinate pairs from Polygon or MultiPolygon
  const coords: number[][] = [];
  const addRing = (ring: number[][]) => ring.forEach((c) => coords.push(c));
  if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates.forEach(addRing);
  } else if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((poly: number[][][]) =>
      poly.forEach(addRing),
    );
  }
  if (!coords.length) return null;

  const sumLng = coords.reduce((s, c) => s + c[0], 0);
  const sumLat = coords.reduce((s, c) => s + c[1], 0);
  return { lat: sumLat / coords.length, lng: sumLng / coords.length };
}

// ── Open-Meteo 7-day forecast fetch ──────────────────────────────────────────

interface OmDailyPoint {
  label: string;
  temp: number;
  rain: number;
  wind: number;
  humidity: number;
}

async function fetchOmDailyForecast(lat: number, lng: number): Promise<OmDailyPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "daily",
    "temperature_2m_max,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean",
  );
  url.searchParams.set("timezone", "Africa/Kampala");
  url.searchParams.set("forecast_days", "7");

  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dates: string[] = json.daily?.time ?? [];
  const temps: number[] = json.daily?.temperature_2m_max ?? [];
  const rains: number[] = json.daily?.precipitation_sum ?? [];
  const winds: number[] = json.daily?.wind_speed_10m_max ?? [];
  const humidities: number[] = json.daily?.relative_humidity_2m_mean ?? [];

  return dates.map((dateStr, i) => {
    // Parse as local date (dateStr is "YYYY-MM-DD" with no time component)
    const parts = dateStr.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return {
      label: `${DAYS_SHORT[d.getDay()]} ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
      temp: Math.round((temps[i] ?? 0) * 10) / 10,
      rain: Math.round((rains[i] ?? 0) * 100) / 100,
      wind: Math.round((winds[i] ?? 0) * 10) / 10,
      humidity: Math.round((humidities[i] ?? 0) * 10) / 10,
    };
  });
}

// ── Open-Meteo 48-hour hourly forecast (nowcast wind + humidity) ──────────────

interface OmHourlyPoint {
  time: string; // ISO datetime string
  wind: number;
  humidity: number;
}

async function fetchOmHourlyForecast(lat: number, lng: number): Promise<OmHourlyPoint[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "wind_speed_10m,relative_humidity_2m");
  url.searchParams.set("timezone", "Africa/Kampala");
  url.searchParams.set("forecast_days", "2");

  const res = await fetch(url.href);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();

  const times: string[] = json.hourly?.time ?? [];
  const winds: number[] = json.hourly?.wind_speed_10m ?? [];
  const humidities: number[] = json.hourly?.relative_humidity_2m ?? [];

  return times.map((t, i) => ({
    time: t,
    wind: Math.round((winds[i] ?? 0) * 10) / 10,
    humidity: Math.round((humidities[i] ?? 0) * 10) / 10,
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const getWeatherIcon = (type?: string, className = "w-8 h-8") => {
  switch (type) {
    case "sun":
      return <Sun className={`${className} text-yellow-400`} />;
    case "rain":
      return <CloudRain className={`${className} text-blue-400`} />;
    case "cloud":
      return <Cloud className={`${className} text-slate-400`} />;
    case "storm":
      return <CloudLightning className={`${className} text-purple-400`} />;
    default:
      return <Sun className={`${className} text-yellow-400`} />;
  }
};

export const EmptyState = ({
  icon: Icon,
  message,
  isDarkMode,
  className = "",
}: {
  icon: React.ElementType;
  message: string;
  isDarkMode: boolean;
  className?: string;
}) => (
  <div
    className={`flex flex-col items-center justify-center rounded-lg py-6 ${isDarkMode ? "bg-slate-700/20" : "bg-slate-100"} ${className}`}
  >
    <Icon
      className={`w-6 h-6 mb-1 ${isDarkMode ? "text-slate-600" : "text-slate-300"}`}
    />
    <p
      className={`text-[10px] ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}
    >
      {message}
    </p>
  </div>
);

// ── Custom Tooltip for Metrics ────────────────────────────────────────────────

const CustomMetricTooltip = ({
  active,
  payload,
  label,
  isDarkMode,
  metric,
  unit,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  isDarkMode: boolean;
  metric: "temp" | "rain" | "wind" | "humidity";
  unit: string;
}) => {
  if (!active || !payload?.length) return null;

  const metricLabels: Record<"temp" | "rain" | "wind" | "humidity", string> = {
    temp: "Temperature",
    rain: "Rainfall",
    wind: "Wind Speed",
    humidity: "Humidity",
  };

  return (
    <div
      className={`px-2.5 py-1.5 rounded-lg shadow-lg border text-xs ${isDarkMode ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"}`}
    >
      <p className="font-semibold mb-0.5">{label ?? ""}</p>
      <p style={{ color: FAO_BLUE }}>
        {metricLabels[metric]}: {payload[0]?.value ?? 0}
        {unit}
      </p>
    </div>
  );
};

// ── Weather Trend Chart (supports multiple metrics) ────────────────────────────

const WeatherTrendChart = ({
  hourlyForecast,
  isDarkMode,
  gradientId,
  height,
  margin,
  fontSize,
  chartData,
  metric = "temp",
}: {
  hourlyForecast: any[];
  isDarkMode: boolean;
  gradientId: string;
  height: string | number;
  margin: object;
  fontSize: number;
  chartData?: any[];
  metric?: "temp" | "rain" | "wind" | "humidity";
}) => {
  const dataToDisplay = (chartData && chartData.length >= 2) ? chartData : (hourlyForecast?.length >= 2 ? hourlyForecast : null);
  if (!dataToDisplay || dataToDisplay.length < 2) {
    return (
      <EmptyState
        icon={TrendingUp}
        message="No data available"
        isDarkMode={isDarkMode}
        className="h-full"
      />
    );
  }

  const metricConfig = {
    temp: { label: "Temperature", unit: "°C", color: FAO_BLUE, key: "temp" },
    rain: { label: "Rainfall", unit: "mm", color: "#3b82f6", key: "rain" },
    wind: { label: "Wind Speed", unit: "km/h", color: "#f97316", key: "wind" },
    humidity: { label: "Humidity", unit: "%", color: "#22c55e", key: "humidity" },
  };

  const config = metricConfig[metric] ?? metricConfig.temp;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={dataToDisplay} margin={margin}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={config.color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={config.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDarkMode ? "#334155" : "#e2e8f0"}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={(props: any) => {
            const { x, y, payload } = props;
            // label is e.g. "Tue Jun 3" — split on first space to get day vs rest
            const parts = (payload.value ?? "").split(" ");
            const day = parts[0] ?? "";
            const date = parts.slice(1).join(" ");
            return (
              <g transform={`translate(${x},${y})`}>
                <text
                  x={0} y={0} dy={10}
                  textAnchor="middle"
                  fill={isDarkMode ? "#94a3b8" : "#64748b"}
                  fontSize={fontSize + 1}
                  fontWeight={600}
                >
                  {day}
                </text>
                <text
                  x={0} y={0} dy={22}
                  textAnchor="middle"
                  fill={isDarkMode ? "#64748b" : "#94a3b8"}
                  fontSize={fontSize - 1}
                >
                  {date}
                </text>
              </g>
            );
          }}
          tickLine={false}
          axisLine={false}
          interval={0}
          height={36}
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize, fill: isDarkMode ? "#64748b" : "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}${config.unit}`}
        />
        <Tooltip
          content={
            <CustomMetricTooltip
              isDarkMode={isDarkMode}
              metric={metric}
              unit={config.unit}
            />
          }
        />
        <Area
          type="monotone"
          dataKey={config.key}
          stroke={config.color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: config.color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

// ── Filter Sidebar ────────────────────────────────────────────────────────────

const FilterContent = ({
  selectedParameter,
  setSelectedParameter,
  isDarkMode,
  textMuted,
  textSecondary,
  borderColor,
  weatherData,
  // dateRange,
  // setDateRange,
  district_list,
}: {
  selectedRegion: string;
  setSelectedRegion: (v: string) => void;
  selectedParameter: string;
  setSelectedParameter: (v: string) => void;
  isDarkMode: boolean;
  textMuted: string;
  textSecondary: string;
  borderColor: string;
  weatherData: WeatherData | null;
  dateRange: string;
  setDateRange: (dateRange: string) => void;
  district_list: district[] | undefined;
}) => (
  <div className="space-y-3">
    <Districts_list
      district_list={district_list}
      isDarkMode={isDarkMode}
      textMuted={textMuted}
    />
    <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Parameter</label>
      <select
        value={selectedParameter}
        onChange={(e) => setSelectedParameter(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      >
        {[
          ["temperature", "Temperature"],
          ["humidity", "Humidity"],
          ["wind", "Wind Speed"],
          ["rainfall", "Rainfall"],
        ].map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
    {/* <div>
      <label className={`text-xs ${textMuted} mb-1 block`}>Select Date</label>
      <input
        type="date"
        value={dateRange}
        onChange={(e) => setDateRange(e.target.value)}
        className={`w-full p-2 rounded-lg text-sm outline-none border ${isDarkMode ? "bg-slate-700 border-slate-600 text-white" : "bg-white border-slate-200 text-slate-900"}`}
      />
    </div> */}
    <div className={`pt-3 border-t ${borderColor}`}>
      <h4 className={`text-xs font-semibold mb-2 ${textSecondary}`}>
        Quick Stats
      </h4>
      <div className="space-y-1.5">
        {[
          {
            label: "Avg Temp",
            value: `${weatherData?.avg_temp ?? 0}°C`,
            color: FAO_BLUE,
          },
          {
            label: "Max Temp",
            value: `${weatherData?.max_temp ?? 0}°C`,
            color: "#ef4444",
          },
          {
            label: "Min Temp",
            value: `${weatherData?.min_temp ?? 0}°C`,
            color: "#3b82f6",
          },
          {
            label: "Total Rain",
            value: `${weatherData?.total_rain ?? 0}mm`,
            color: "#06b6d4",
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between text-xs">
            <span className={textMuted}>{label}</span>
            <span className="font-medium" style={{ color }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WeatherForecastPage({
  isDarkMode = true,
}: WeatherForecastPageProps) {
  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: district_list = [] } = useQuery<district[]>({
    queryKey: ["districts"],
    queryFn: DistrictsAPI.getAll,
    staleTime: 10 * 60 * 1000,  // districts don't change — cache for 10 min
    gcTime: 30 * 60 * 1000,     // keep in memory for 30 min
  });

  const {
    selectedParameter,
    setSelectedParameter,
    dateRange,
    setDateRange,
    selectedDistrictId,
    setLayerMode,
    mapInteractionMetric,
    setSliderhourIndexValue,
  } = useAppStore((state) => state);

  const [activeTab, setActiveTabState] = useState<"nowcast" | "forecast">("nowcast");
  const [selectedRegion, setSelectedRegion] = useState("All Regions");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [forecastData, setForecastData] = useState<ForecastPerHour | null>(
    null,
  );
  const [dailyForecasts, setDailyForecast] =
    useState<DailyForecastResponse | null>(null);
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(
    null,
  );
  const [chartMetric, setChartMetric] = useState<"temp" | "rain" | "wind" | "humidity">(
    "temp",
  );
  const [maxForecastTime, setMaxForecastTime] = useState<string | undefined>(
    undefined,
  );
  const [omDailyForecast, setOmDailyForecast] = useState<OmDailyPoint[]>([]);
  const [omHourlyForecast, setOmHourlyForecast] = useState<OmHourlyPoint[]>([]);

  // Unified tab setter: keeps map layerMode in sync with the forecast tab
  const setActiveTab = (tab: "nowcast" | "forecast") => {
    setActiveTabState(tab);
    setLayerMode(tab);
  };

  // ── Live map hover state — district name + sampled value from Open-Meteo ─────
  const [mapHoverDistrict, setMapHoverDistrict] = useState<string | null>(null);
  const [mapHoverValue, setMapHoverValue] = useState<number | null>(null);
  const [mapHoverUnit, setMapHoverUnit] = useState<string>("");

  const handleMapHoverChange = (
    district: string | null,
    value: number | null,
    unit: string,
  ) => {
    setMapHoverDistrict(district);
    setMapHoverValue(value);
    setMapHoverUnit(unit);
  };

  // ── Sync activeTab ↔ layerMode ────────────────────────────────────────────────
  // Tab → map: "nowcast" = ICON, "forecast" = GFS
  useEffect(() => {
    setLayerMode(activeTab === "forecast" ? "forecast" : "nowcast");
  }, [activeTab, setLayerMode]);

  // ── Sync selectedCardIndex → slider hour ──────────────────────────────────────
  // When the user clicks an hourly forecast card, move the map to that hour.
  // Since the nowcast now spans into the next day, hours > 23 wrap to the next day.
  useEffect(() => {
    if (activeTab !== "nowcast" || selectedCardIndex === null) return;
    const nowHour = new Date().getHours();
    const targetHour = (nowHour + selectedCardIndex) % 24;
    setSliderhourIndexValue(targetHour);
  }, [selectedCardIndex, activeTab, setSliderhourIndexValue]);

  // Sync chart metric with map interaction (parameter click on map toolbar)
  useEffect(() => {
    if (mapInteractionMetric) {
      handleSetChartMetric(mapInteractionMetric);
    }
  }, [mapInteractionMetric]); // eslint-disable-line react-hooks/exhaustive-deps

  // Two-way sync: changing chartMetric also updates the parameter dropdown, and vice versa.
  const metricToParam: Record<string, string> = {
    temp: "temperature",
    rain: "rainfall",
    wind: "wind",
    humidity: "humidity",
  };
  const handleSetChartMetric = (m: "temp" | "rain" | "wind" | "humidity") => {
    setChartMetric(m);
    setSelectedParameter(metricToParam[m]);
  };

  // Sync chart metric when the parameter filter changes (one-way: filter → chart)
  useEffect(() => {
    const paramToMetric: Record<string, "temp" | "rain" | "wind" | "humidity"> = {
      temperature: "temp",
      rainfall: "rain",
      wind: "wind",
      humidity: "humidity",
    };
    const mapped = paramToMetric[selectedParameter?.toLowerCase() ?? "temperature"];
    if (mapped) setChartMetric(mapped);
  }, [selectedParameter]);

  // Fetch max forecast time from raster frames API
  useEffect(() => {
    const model = activeTab === "forecast" ? "gfs" : "icon";
    weatherAPI.getRasterFrames(model).then((data) => {
      if (!data || !data.frames.length) return;
      // Find the last frame's effective time
      const lastFrame = data.frames[data.frames.length - 1];
      const runDate = new Date(lastFrame.run);
      const endTime = new Date(runDate.getTime() + lastFrame.forecast_hour * 3600000);
      setMaxForecastTime(endTime.toISOString());
    }).catch(() => {});
  }, [activeTab]);

  // When no district is selected, default stats to Kampala
  const kampala = district_list.find((d: district) =>
    d.name.toLowerCase().includes("kampala"),
  );
  const statsId = selectedDistrictId?.id ?? kampala?.id;
  const statsLabel = selectedDistrictId?.name ?? kampala?.name ?? "Uganda";

  // Ensure layerMode is set correctly on mount (activeTab default is "nowcast")
  useEffect(() => {
    setLayerMode("nowcast");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch Open-Meteo 7-day forecast for wind + humidity — fetch always (not gated
  // on forecast tab) so data is ready the moment the user switches to the 7-day view.
  useEffect(() => {
    let cancelled = false;
    const districtName = selectedDistrictId?.name ?? kampala?.name ?? "";
    const centroid =
      getDistrictCentroid(districtName) ??
      getDistrictCentroid("Kampala") ??
      { lat: 1.3733, lng: 32.2903 };
    fetchOmDailyForecast(centroid.lat, centroid.lng)
      .then((data) => {
        if (!cancelled) setOmDailyForecast(data);
      })
      .catch(() => {
        if (!cancelled) setOmDailyForecast([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDistrictId, statsLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Open-Meteo 48-hr hourly forecast for nowcast wind + humidity values
  useEffect(() => {
    if (activeTab !== "nowcast") return;
    let cancelled = false;
    const districtName = selectedDistrictId?.name ?? kampala?.name ?? "";
    const centroid =
      getDistrictCentroid(districtName) ??
      getDistrictCentroid("Kampala") ??
      { lat: 1.3733, lng: 32.2903 };
    fetchOmHourlyForecast(centroid.lat, centroid.lng)
      .then((data) => {
        if (!cancelled) setOmHourlyForecast(data);
      })
      .catch(() => {
        if (!cancelled) setOmHourlyForecast([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedDistrictId, statsLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch dashboard + forecasts whenever the stats district changes.
  // Guard against undefined statsId (districts query still loading) so we
  // don't fire a no-district request that returns zeros before Kampala resolves.
  useEffect(() => {
    if (statsId === undefined) return;
    (async () => {
      try {
        const [dashboard, hourlyForecast, dailyForecast] = await Promise.all([
          weatherAPI.getDashboard(statsId),
          weatherAPI.getForecastHourly(statsId),
          weatherAPI.getForecastDaily(statsId),
        ]);
        setWeatherData((dashboard ?? null) as WeatherData | null);
        setForecastData((hourlyForecast ?? null) as ForecastPerHour | null);
        setDailyForecast((dailyForecast ?? null) as DailyForecastResponse | null);
      } catch (err) {
        console.error("Failed to fetch weather data:", err);
      }
    })();
  }, [statsId]);

  // Reset selected card when switching tabs
  useEffect(() => {
    setSelectedCardIndex(null);
  }, [activeTab]);

  // Safe normalisation — keep up to 48 hours so we always have data into the next day
  const allHourlyForecast = forecastData?.hourly?.length
    ? normaliseHourly(forecastData.hourly).slice(0, 48)
    : [];

  // Start from current hour and show the next 24 hours (spanning into tomorrow)
  const now = new Date();
  const currentHour = now.getHours();
  const hourlyForecast = allHourlyForecast.slice(currentHour, currentHour + 24);

  const dailyForecast = dailyForecasts?.daily?.length
    ? normaliseDaily(dailyForecasts.daily).slice(0, 20)
    : [];

 


  // Get chart data based on active tab, selected card, metric, and date filters
  const getChartData = () => {
    if (activeTab === "nowcast") {
      let filtered = hourlyForecast;

      // Filter by date if dateRange is set
      if (dateRange) {
        const selectedDate = new Date(dateRange);
        filtered = hourlyForecast.filter((h) => {
          if (!h.rawDate) return false;
          return (
            h.rawDate.getFullYear() === selectedDate.getFullYear() &&
            h.rawDate.getMonth() === selectedDate.getMonth() &&
            h.rawDate.getDate() === selectedDate.getDate()
          );
        });
      }

      let sliced = filtered;
      if (selectedCardIndex !== null && filtered[selectedCardIndex]) {
        const startIdx = Math.max(0, selectedCardIndex - 2);
        const endIdx = Math.min(filtered.length, selectedCardIndex + 3);
        sliced = filtered.slice(startIdx, endIdx);
      } else if (!dateRange) {
        // When no card is selected, use all the data (already filtered by current hour)
        sliced = filtered;
      }

      return sliced.map((h) => {
        const displayTime = h.rawDate
          ? h.rawDate.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : h.time;
        // Match this hour to an OM hourly entry by ISO time prefix (YYYY-MM-DDTHH)
        const rawTimePrefix = h.rawTime
          ? h.rawTime.slice(0, 13)
          : null;
        const omMatch = rawTimePrefix
          ? omHourlyForecast.find((o) => o.time.slice(0, 13) === rawTimePrefix)
          : null;
        return {
          label: displayTime,
          temp: h.temp,
          rain: h.rain,
          wind: omMatch?.wind ?? h.windSpeed ?? 0,
          humidity: omMatch?.humidity ?? h.humidity ?? 0,
        };
      });
    } else {
      // 7-day chart uses Open-Meteo directly — all 4 metrics are reliable from OM.
      // The backend daily API does not return wind or humidity reliably.
      // omDailyForecast already has label, temp, rain, wind, humidity all populated.
      if (omDailyForecast.length === 0) return [];

      const forecastSource = omDailyForecast.map((d) => ({
        label: d.label,
        temp: d.temp,
        rain: d.rain,
        wind: d.wind,
        humidity: d.humidity,
      }));

      if (selectedCardIndex !== null) {
        const startIdx = Math.max(0, selectedCardIndex - 1);
        const endIdx = Math.min(baseSource.length, selectedCardIndex + 2);
        return baseSource.slice(startIdx, endIdx);
      }

      return baseSource;
    }
  };

  const rawChartData = getChartData();
  // Pass undefined (not []) when empty so the chart component can fall back gracefully
  const chartData = rawChartData && rawChartData.length >= 2 ? rawChartData : undefined;

  // Trigger chart update when filters or parameter changes
  useEffect(() => {
    // This effect ensures the chart updates whenever filters change
    // The dependency array includes all filter-related variables
  }, [activeTab, selectedCardIndex, dateRange, selectedParameter, statsId]);

  // Stat colours match Open-Meteo weather map color scale mid-range stops
  const STAT_COLOR = {
    temperature: "#f97316", // warm orange (35° stop)
    rainfall: "#0284c7", // medium blue (50 mm stop)
    humidity: "#22c55e", // green (70% stop — moderate)
    wind: "#3b82f6", // blue (20 km/h stop — moderate)
  };

  // Determine if a given stat card is the currently active map parameter
  const activeParam = selectedParameter?.toLowerCase() ?? "temperature";
  const paramToStatKey: Record<string, keyof typeof STAT_COLOR> = {
    temperature: "temperature",
    rainfall: "rainfall",
    precipitation: "rainfall",
    humidity: "humidity",
    wind: "wind",
  };

  // Live value override from map hover — shown in place of the API value
  // when the user hovers a district on the map with the matching parameter active.
  const liveHoverOverride = (statParam: keyof typeof STAT_COLOR): string | null => {
    if (!mapHoverDistrict || mapHoverValue == null) return null;
    if (paramToStatKey[activeParam] !== statParam) return null;
    return `${mapHoverValue}${mapHoverUnit}`;
  };

  const statCards = [
    {
      label: "Temperature",
      statKey: "temperature" as keyof typeof STAT_COLOR,
      icon: Thermometer,
      color: STAT_COLOR.temperature,
      min: 15,
      max: 40,
      value: `${weatherData?.temperature ?? 0}°C`,
      change: `${(weatherData?.temperature_delta ?? 0) > 0 ? "+" : ""}${weatherData?.temperature_delta ?? 0}°C`,
      trend:
        (weatherData?.temperature_delta ?? 0) > 0
          ? "up"
          : (weatherData?.temperature_delta ?? 0) < 0
            ? "down"
            : "neutral",
      thresholds: [
        { value: 20, color: "#3b82f6", label: "Cool" },
        { value: 28, color: "#22c55e", label: "Mild" },
        { value: 35, color: "#f97316", label: "Warm" },
        { value: 40, color: "#ef4444", label: "Hot" },
      ],
    },
    {
      label: "Rainfall (Hourly)",
      statKey: "rainfall" as keyof typeof STAT_COLOR,
      icon: CloudRain,
      color: STAT_COLOR.rainfall,
      min: 0,
      max: 100,
      value: `${weatherData?.rainfall_24h ?? 0} mm`,
      change: `${(weatherData?.rainfall_24h_delta ?? 0) > 0 ? "+" : ""}${weatherData?.rainfall_24h_delta ?? 0} mm`,
      trend:
        (weatherData?.rainfall_24h_delta ?? 0) > 0
          ? "up"
          : (weatherData?.rainfall_24h_delta ?? 0) < 0
            ? "down"
            : "neutral",
      thresholds: [
        { value: 5, color: "#e0f2fe", label: "Dry" },
        { value: 25, color: "#38bdf8", label: "Light" },
        { value: 50, color: "#0284c7", label: "Moderate" },
        { value: 100, color: "#1e3a8a", label: "Heavy" },
      ],
    },
    {
      label: "Humidity",
      statKey: "humidity" as keyof typeof STAT_COLOR,
      icon: Droplets,
      color: STAT_COLOR.humidity,
      min: 0,
      max: 100,
      value: `${weatherData?.humidity ?? 0}%`,
      change: `${(weatherData?.humidity_delta ?? 0) > 0 ? "+" : ""}${weatherData?.humidity_delta ?? 0}%`,
      trend:
        (weatherData?.humidity_delta ?? 0) > 0
          ? "up"
          : (weatherData?.humidity_delta ?? 0) < 0
            ? "down"
            : "neutral",
      thresholds: [
        { value: 30, color: "#dc2626", label: "Dry" },
        { value: 50, color: "#fbbf24", label: "Low" },
        { value: 70, color: "#22c55e", label: "Normal" },
        { value: 85, color: "#3b82f6", label: "High" },
      ],
    },
    {
      label: "Wind Speed",
      statKey: "wind" as keyof typeof STAT_COLOR,
      icon: Wind,
      color: STAT_COLOR.wind,
      min: 0,
      max: 60,
      value: `${weatherData?.wind_speed ?? 0} km/h`,
      change: `${(weatherData?.wind_speed_delta ?? 0) > 0 ? "+" : ""}${weatherData?.wind_speed_delta ?? 0} km/h`,
      trend:
        (weatherData?.wind_speed_delta ?? 0) > 0
          ? "up"
          : (weatherData?.wind_speed_delta ?? 0) < 0
            ? "down"
            : "neutral",
      thresholds: [
        { value: 10, color: "#22c55e", label: "Calm" },
        { value: 25, color: "#3b82f6", label: "Breezy" },
        { value: 40, color: "#f97316", label: "Windy" },
        { value: 60, color: "#dc2626", label: "Strong" },
      ],
    },
  ];

  const cardBg = isDarkMode ? "bg-slate-800/85" : "bg-white/95";
  const textMuted = isDarkMode ? "text-slate-400" : "text-slate-500";
  const textSecondary = isDarkMode ? "text-slate-300" : "text-slate-600";
  const borderColor = isDarkMode ? "border-slate-700/30" : "border-slate-200";
  const headerText = isDarkMode ? "text-white" : "text-slate-900";

  return (
    <div className="p-3 md:p-5 min-h-screen">
      {isDarkMode && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute opacity-10"
              style={{
                left: `${-20 + i * 25}%`,
                top: `${10 + (i % 3) * 20}%`,
                animation: `drift ${20 + i * 5}s linear infinite`,
              }}
            >
              <Cloud className="w-32 h-32 text-blue-300" />
            </div>
          ))}
        </div>
      )}

      <div className="relative z-10 w-full">
        {/* Header */}
        <div
          className="relative overflow-hidden rounded-lg md:rounded-xl p-3 md:p-4 mb-3 animate-fade-in-up"
          style={{
            background: `linear-gradient(135deg, ${FAO_BLUE}e6 0%, ${FAO_BLUE}99 100%)`,
          }}
        >
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white">
                Weather Forecast
              </h1>
              <p className="text-slate-200 text-xs md:text-sm">
                24-hour nowcasting & 7-day forecasts
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span
                  className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
                >
                  <Clock className="w-3 h-3" />
                  Updated 5 min ago
                </span>
              </div>
            </div>
            <ExportData />
          </div>
        </div>

        {/* Stat cards */}
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-3.5 h-3.5" style={{ color: FAO_BLUE }} />
          <span
            className={`text-xs font-medium ${isDarkMode ? "text-slate-300" : "text-slate-700"}`}
          >
            {statsLabel}, Uganda
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 mb-3">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            const liveVal = liveHoverOverride(card.statKey);
            const displayValue = liveVal ?? card.value;
            const numericValue =
              parseFloat(displayValue.replace(/[^0-9.]/g, "")) || 0;
            const isActiveParam = paramToStatKey[activeParam] === card.statKey;
            return (
              <div
                key={index}
                onClick={() => setSelectedParameter(card.statKey)}
                className={`${cardBg} backdrop-blur-sm border rounded-lg md:rounded-xl p-2.5 md:p-3 shadow-sm animate-fade-in-up transition-all hover:shadow-md cursor-pointer`}
                style={{
                  animationDelay: `${index * 0.1}s`,
                  borderColor: isActiveParam ? card.color : undefined,
                  borderWidth: isActiveParam ? 2 : undefined,
                }}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className={`text-[10px] md:text-xs ${textMuted} mb-0.5`}>
                      {card.label}
                      {liveVal && mapHoverDistrict && (
                        <span
                          className="ml-1 font-semibold"
                          style={{ color: card.color }}
                        >
                          · {mapHoverDistrict}
                        </span>
                      )}
                    </p>
                    <p
                      className={`text-base md:text-lg font-bold ${headerText}`}
                      style={liveVal ? { color: card.color } : undefined}
                    >
                      {displayValue}
                    </p>
                  </div>
                  <div
                    className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${card.color}22` }}
                  >
                    <Icon
                      className="w-3.5 h-3.5 md:w-4 md:h-4"
                      style={{ color: card.color }}
                    />
                  </div>
                </div>
                <div
                  className={`flex items-center gap-1 text-[10px] ${getTrendColor(card.trend, isDarkMode)}`}
                >
                  {getTrendIcon(card.trend)}
                  <span style={{ color: card.color }}>{card.change}</span>
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

        {/* ── Desktop ── */}
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
                <h3 className={`text-sm font-semibold mb-3 ${textSecondary}`}>
                  Filters
                </h3>
                <FilterContent
                  selectedRegion={selectedRegion}
                  setSelectedRegion={setSelectedRegion}
                  selectedParameter={selectedParameter}
                  setSelectedParameter={setSelectedParameter}
                  isDarkMode={isDarkMode}
                  textMuted={textMuted}
                  textSecondary={textSecondary}
                  borderColor={borderColor}
                  weatherData={weatherData}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  district_list={district_list}
                />
              </div>
              <div className="mt-auto pt-3">
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    backgroundImage: "url(/weather-illustration.png)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    height: "140px",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Main */}
          <div className="lg:col-span-9 space-y-3">
            {/* Map + cards row — fixed shared height */}
            <div
              className="grid grid-cols-12 gap-3"
              style={{ height: "clamp(520px, 63vh, 940px)" }}
            >
              {/* Map — left */}
              <div className="col-span-8 flex h-full">
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col`}
                >
                  {/* Map card header — title + layer-mode tabs + Live badge */}
                  <div
                    className={`flex items-center justify-between px-2 pt-2 pb-0 border-b ${borderColor} flex-shrink-0`}
                  >
                    <div className="flex items-center gap-1.5">
                      <MapIcon
                        className="w-4 h-4"
                        style={{ color: FAO_BLUE }}
                      />
                      <h3 className={`text-sm font-semibold ${headerText}`}>
                        {selectedParameter === "rainfall" ? "Precipitation" : selectedParameter === "wind" ? "Wind Speed" : selectedParameter === "humidity" ? "Humidity" : "Temperature"} Forecast
                      </h3>
                    </div>

                    {/* Compact pill tab switcher */}
                    <div
                      className="flex items-center rounded-full overflow-hidden"
                      style={{
                        border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                      }}
                    >
                      {(["nowcast", "forecast"] as const).map((tab) => (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className="px-2.5 py-0.5 text-[10px] font-semibold transition-all whitespace-nowrap"
                          style={{
                            backgroundColor: activeTab === tab ? FAO_BLUE : "transparent",
                            color: activeTab === tab ? "#fff" : isDarkMode ? "#94a3b8" : "#64748b",
                          }}
                        >
                          {tab === "nowcast" ? "Hourly" : "7-Day"}
                        </button>
                      ))}
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
                      Open-Meteo
                    </span>
                  </div>
                  <div className="flex-1 relative min-h-0">
                    <WeatherForcastMap
                      isDarkMode={isDarkMode}
                      className="absolute inset-0 w-full h-full rounded-none"
                      badgeText={selectedDistrictId?.name ?? "Uganda"}
                      getTheBounds={selectedDistrictId?.name ?? ""}
                      district_list={district_list}
                      onHoverChange={handleMapHoverChange}
                    />
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500]">
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

              {/* Right panel — forecast cards (top) + trend chart (bottom) */}
              <div className="col-span-4 h-full min-h-0 flex flex-col gap-2">
                {/* Nowcast / Forecast cards — natural height, capped at 56%, scrolls inside */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg shadow-sm flex flex-col flex-shrink-0`}
                  style={{ maxHeight: "56%", overflow: "hidden" }}
                >
                  <TabBar
                    mobile={false}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    borderColor={borderColor}
                    isDarkMode={isDarkMode}
                    FAO_BLUE={FAO_BLUE}
                  />
                  <div className="p-3 overflow-y-auto">
                    {activeTab?.toLowerCase() === "nowcast" ? (
                      <>
                        <h4
                          className={`text-xs font-semibold mb-2 ${headerText}`}
                        >
                          Hourly Forecast
                        </h4>
                        <HourlyCards
                          hourlyForecast={hourlyForecast}
                          isDarkMode={isDarkMode}
                          textMuted={textMuted}
                          headerText={headerText}
                          FAO_BLUE={FAO_BLUE}
                          selectedIndex={selectedCardIndex}
                          onSelectCard={setSelectedCardIndex}
                        />
                      </>
                    ) : (
                      <>
                        <h4
                          className={`text-xs font-semibold mb-2 ${headerText}`}
                        >
                          7-Day Forecast
                        </h4>
                        <DailyCards
                          dailyForecast={dailyForecast}
                          isDarkMode={isDarkMode}
                          textMuted={textMuted}
                          headerText={headerText}
                          FAO_BLUE={FAO_BLUE}
                          selectedIndex={selectedCardIndex}
                          onSelectCard={setSelectedCardIndex}
                        />
                      </>
                    )}
                  </div>
                </div>

                {/* Weather Trend chart — fills all remaining space */}
                <div
                  className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm flex-1 flex flex-col min-h-0`}
                >
                  <div className="flex items-center justify-between mb-0.5 flex-shrink-0">
                    <h3
                      className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}
                    >
                      <TrendingUp
                        className="w-4 h-4"
                        style={{ color: FAO_BLUE }}
                      />
                      Weather Trend
                    </h3>
                    <div className="flex gap-1">
                      {(["temp", "rain", "humidity", "wind"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => handleSetChartMetric(m)}
                          className={`text-xs px-2 py-0.5 rounded transition-all ${
                            chartMetric === m
                              ? "font-semibold text-white"
                              : textMuted
                          }`}
                          style={{
                            backgroundColor:
                              chartMetric === m ? FAO_BLUE : "transparent",
                          }}
                        >
                          {m === "temp"
                            ? "Temp"
                            : m === "rain"
                              ? "Rain"
                              : m === "wind"
                                ? "Wind"
                                : "Humid"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={`text-[10px] ${textMuted} mb-1 flex-shrink-0`}>
                    {activeTab === "nowcast" ? "Hourly" : "7-Day"} · {statsLabel} · {selectedParameter.charAt(0).toUpperCase() + selectedParameter.slice(1)}
                  </p>
                  <div className="flex-1 min-h-0">
                    <WeatherTrendChart
                      hourlyForecast={hourlyForecast}
                      isDarkMode={isDarkMode}
                      gradientId="tempFillDesktop"
                      height="100%"
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                      fontSize={9}
                      chartData={chartData}
                      metric={chartMetric}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile ── */}
        <div className="block lg:hidden space-y-3">
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg shadow-sm overflow-hidden`}
          >
            <TabBar
              mobile={true}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              borderColor={borderColor}
              isDarkMode={isDarkMode}
              FAO_BLUE={FAO_BLUE}
            />
            <div className="p-3">
              {activeTab === "nowcast" ? (
                <>
                  <h3
                    className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}
                  >
                    <Clock className="w-4 h-4" style={{ color: FAO_BLUE }} />
                    Hourly Forecast
                  </h3>
                  <HourlyCards
                    hourlyForecast={hourlyForecast}
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    headerText={headerText}
                    FAO_BLUE={FAO_BLUE}
                    selectedIndex={selectedCardIndex}
                    onSelectCard={setSelectedCardIndex}
                  />
                </>
              ) : (
                <>
                  <h3
                    className={`text-sm font-semibold mb-2 flex items-center gap-1.5 ${headerText}`}
                  >
                    <Calendar className="w-4 h-4" style={{ color: FAO_BLUE }} />
                    7-Day Forecast
                  </h3>
                  <DailyCards
                    dailyForecast={dailyForecast}
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    headerText={headerText}
                    FAO_BLUE={FAO_BLUE}
                    mobile
                    selectedIndex={selectedCardIndex}
                    onSelectCard={setSelectedCardIndex}
                  />
                </>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="relative">
            <div
              className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg md:rounded-xl overflow-hidden shadow-sm`}
            >
              <div
                className={`flex items-center justify-between px-2 pt-2 pb-0 border-b ${borderColor}`}
              >
                <div className="flex items-center gap-1.5">
                  <MapIcon className="w-4 h-4" style={{ color: FAO_BLUE }} />
                  <h3 className={`text-sm font-semibold ${headerText}`}>
                    Weather Map
                  </h3>
                </div>

                {/* Compact pill tab switcher */}
                <div
                  className="flex items-center rounded-full overflow-hidden"
                  style={{
                    border: `1px solid ${isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                  }}
                >
                  {(["nowcast", "forecast"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="px-2.5 py-0.5 text-[10px] font-semibold transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: activeTab === tab ? FAO_BLUE : "transparent",
                        color: activeTab === tab ? "#fff" : isDarkMode ? "#94a3b8" : "#64748b",
                      }}
                    >
                      {tab === "nowcast" ? "Hourly" : "7-Day"}
                    </button>
                  ))}
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
              <div className="relative aspect-[16/11]">
                <WeatherForcastMap
                  isDarkMode={isDarkMode}
                  className="absolute inset-0 w-full h-full"
                  badgeText={selectedDistrictId?.name ?? "Uganda"}
                  getTheBounds={selectedDistrictId?.name ?? ""}
                  district_list={district_list}
                  onHoverChange={handleMapHoverChange}
                />
                <button
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center shadow-md z-[1001] text-white"
                  style={{ backgroundColor: FAO_BLUE }}
                >
                  <Filter className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[500]">
                  <FloodHourSlider
                    floating
                    isDarkMode={isDarkMode}
                    borderColor={borderColor}
                    textMuted={textMuted}
                  />
                </div>
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
                    selectedRegion={selectedRegion}
                    setSelectedRegion={setSelectedRegion}
                    selectedParameter={selectedParameter}
                    setSelectedParameter={setSelectedParameter}
                    isDarkMode={isDarkMode}
                    textMuted={textMuted}
                    textSecondary={textSecondary}
                    borderColor={borderColor}
                    weatherData={weatherData}
                    dateRange={dateRange}
                    setDateRange={setDateRange}
                    district_list={district_list}
                  />
                </div>
              </>
            )}
          </div>

          {/* Trend */}
          <div
            className={`${cardBg} backdrop-blur-sm border ${borderColor} rounded-lg p-3 shadow-sm`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <h3
                className={`text-sm font-semibold flex items-center gap-1.5 ${headerText}`}
              >
                <TrendingUp className="w-4 h-4" style={{ color: FAO_BLUE }} />
                Weather Trend
              </h3>
              <div className="flex gap-1">
                {(["temp", "rain", "humidity", "wind"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => handleSetChartMetric(m)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-all ${
                      chartMetric === m ? "font-semibold text-white" : textMuted
                    }`}
                    style={{
                      backgroundColor:
                        chartMetric === m ? FAO_BLUE : "transparent",
                    }}
                  >
                    {m === "temp" ? "°C" : m === "rain" ? "mm" : m === "wind" ? "km/h" : "%"}
                  </button>
                ))}
              </div>
            </div>
            <p className={`text-[10px] ${textMuted} mb-2`}>
              {activeTab === "nowcast" ? "Hourly" : "7-Day"} · {statsLabel} · {selectedParameter.charAt(0).toUpperCase() + selectedParameter.slice(1)}
            </p>
            <div className="h-36">
              <WeatherTrendChart
                hourlyForecast={hourlyForecast}
                isDarkMode={isDarkMode}
                gradientId="tempFillMobile"
                height="100%"
                margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
                fontSize={8}
                chartData={chartData}
                metric={chartMetric}
              />
            </div>
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
        @keyframes drift    { from { transform: translateX(-100%); } to { transform: translateX(100vw); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in-up { animation: fadeInUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}