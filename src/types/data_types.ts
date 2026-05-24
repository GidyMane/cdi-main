export interface WeatherData {
  district_name: string;
  forecast_date: string; // "YYYY-MM-DD"
  temperature: number;
  temperature_delta: number | null;
  feels_like: number;
  humidity: number;
  humidity_delta: number | null;
  dew_point: number;
  wind_speed: number;
  wind_speed_delta: number | null;
  wind_direction: number;
  wind_direction_label: string;
  rainfall_24h: number;
  rainfall_24h_delta: number | null;
  weather_code: number;
  weather_description: string;
  avg_temp: number;
  max_temp: number;
  min_temp: number;
  total_rain: number;
  fetched_at: string; // ISO 8601 Timestamp
}

export type TrendType = string;

export interface TrendIndicatorProps {
  label: string;
  trend: TrendType; // Using the same type here
}

export interface HourlyForecast {
  temp: number;
  time: string; // Format: "YYYY-MM-DDTHH:mm"
  precip: number;
  weather_code: number;
  weather_description: string;
}

export interface DailyEntry {
  date: string;
  temp_max: number;
  temp_min: number;
  precip_sum: number;
  weather_code: number;
  wind_speed_max: number;
  weather_description: string;
}

export interface ForecastPerHour {
  district: string;
  forecast_date: string; // Format: "YYYY-MM-DD"
  fetched_at: string; // ISO 8601 Timestamp
  hourly: HourlyForecast[];
}

export interface DailyForecastItem {
  date: string; // Format: "YYYY-MM-DD"
  temp_max: number;
  temp_min: number;
  precip_sum: number;
  weather_code: number;
  wind_speed_max: number;
  weather_description: string;
}

export interface DailyForecastResponse {
  district: string;
  forecast_date: string; // Format: "YYYY-MM-DD"
  fetched_at: string; // ISO 8601 Timestampp
  daily: DailyForecastItem[];
}

export interface WeatherForecastStats {
  accuracy_pct: number;
}

export interface DroughtMonitorStats {
  districts_at_risk: number;
}

export interface FloodMonitorStats {
  alert_areas: number;
}

export interface WeatherStationStats {
  online: number;
  total: number;
}

export interface WeatherSystemSummary {
  weather_forecast: WeatherForecastStats;
  drought_monitor: DroughtMonitorStats;
  flood_monitor: FloodMonitorStats;
  weather_stations: WeatherStationStats;
}

export interface district {
  id: number;
  name: string;
}

export interface LegendItem {
  label: string;
  color: string;
}

export interface UgandaBoundaryMapProps {
  className?: string;
  isDarkMode: boolean;
  badgeText?: string;
  legendTitle?: string;
  legendItems?: LegendItem[];
  district?: string;
  setDistrict?: (name: string) => void;
  getTheBounds?: string; // from reference: fits map to a named district
  zoom?: number;
  minZoom?: number;
  district_list?: any;
}

export interface LayerDef {
  id: string;
  label: string;
  wms: string;
  date?: string;
  pages: string[]; // list of page paths where this layer should be available, e.g. ["/", "/flood", "/weather"]
}

export interface WeatherStation {
  id: number;
  name: string;
  region?: string;
  status: "online" | "offline" | "maintenance";
  latitude?: number;
  longitude?: number;
  elevation?: number;
  last_update?: string;
  signal_strength?: number;
}

export interface StationReading {
  timestamp: string;
  temperature?: number;
  humidity?: number;
  wind_speed?: number;
  wind_direction?: number;
  pressure?: number;
  rainfall?: number;
  rainfall_rate?: number;
}

export interface StationAlert {
  id: number;
  station_id: number;
  station_name: string;
  alert_type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface NetworkSummary {
  total_stations: number;
  online_count: number;
  offline_count: number;
  maintenance_count: number;
  data_quality_percent: number;
  network_uptime_percent: number;
}
