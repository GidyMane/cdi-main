/**
 * Centralized API service for all weather/disaster data fetching
 * Uses environment variables for endpoints
 */

import type { WeatherStation, StationReading, StationAlert, NetworkSummary } from "@/types/data_types";
import { API_BASE } from "@/config";

/** Shape returned by the weather-stations API */
export interface WeatherStationAPI {
  id: number;
  code: string;
  name: string;
  region: string;
  status: "online" | "offline" | "maintenance";
  lat: number;
  lon: number;
  signal_pct: number;
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Generic fetch wrapper with error  handling
 */
async function fetchData<T>(
  endpoint: string,
  options?: FetchOptions,
): Promise<T | null> {
  try {
    const url = endpoint.startsWith("http")
      ? endpoint
      : `${API_BASE}${endpoint}`;

    const response = await fetch(url, {
      method: options?.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    // 404 = no data for this query (normal), 204 = empty response (normal)
    // These are not errors — return null so callers can treat them as empty.
    if (response.status === 404 || response.status === 204) {
      return null;
    }

    // 5xx or other unexpected codes = real server error → throw so partialErrors fires
    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data: T = await response.json();
    return data;
  } catch (error) {
    console.error(`API Error fetching ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Overview API
 */
export const overviewAPI = {
  getModuleStats: async () => {
    return fetchData("overview/modules/");
  },

  getQuickStats: async () => {
    return fetchData("overview/quick-stats/");
  },
};

/**
 * Alerts API
 */
export const alertsAPI = {
  getRecent: async (limit: number = 5) => {
    return fetchData(`alerts/recent/?limit=${limit}`);
  },
};

/**
 * Weather/Dashboard API
 */
export const weatherAPI = {
  getDashboard: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/dashboard/?district_id=${districtId}`
      : "weather/dashboard/";
    return fetchData(endpoint);
  },

  getForecast: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/forecast/?district_id=${districtId}`
      : "weather/forecast/";
    return fetchData(endpoint);
  },

  getForecastHourly: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/hourly/?district_id=${districtId}`
      : "weather/hourly/";
    return fetchData<{
      district: string;
      forecast_date: string;
      fetched_at: string;
      hourly: Array<{
        time: string;
        temp: number | null;
        precip: number | null;
        weather_code: number | null;
        weather_description: string;
        humidity: number | null;
        wind_speed: number | null;
      }>;
    }>(endpoint);
  },

  getForecastDaily: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/forecast/?district_id=${districtId}`
      : "weather/forecast/";
    return fetchData<{
      district: string;
      forecast_date: string;
      fetched_at: string;
      daily: Array<{
        date: string;
        temp_max: number;
        temp_min: number;
        precip_sum: number;
        weather_code: number;
        wind_speed_max: number;
        weather_description: string;
        humidity: number | null;
      }>;
    }>(endpoint);
  },

  getExportData: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/export?district_id=${districtId}`
      : "weather/export";

    const url = `${API_BASE}${endpoint}`;
    return fetch(url);
  },

  /**
   * Get all districts available for weather queries.
   * Optionally filter by region name.
   */
  getDistricts: async (region?: string) => {
    let endpoint = "weather/districts/";
    if (region) endpoint += `?region=${encodeURIComponent(region)}`;
    return fetchData<{
      count: number;
      districts: Array<{ id: number; name: string; region: string | null }>;
    }>(endpoint);
  },
};

/**
 * Drought API
 */
export const droughtAPI = {
  getData: async (districtId?: number) => {
    const endpoint = districtId
      ? `${import.meta.env.VITE_API_DROUGHT_ENDPOINT || "drought/data"}?district_id=${districtId}`
      : import.meta.env.VITE_API_DROUGHT_ENDPOINT || "drought/data";
    return fetchData(endpoint);
  },

  getRegions: async () => {
    return fetchData("drought/regions");
  },
};

/**
 * Flood API Types
 */
export interface FloodReading {
  timestamp?: string;
  level?: number;
  discharge?: number;
}

export interface BasinTrend {
  basin: string;
  current_level_m: number | null;
  trend: "unknown" | "rising" | "falling" | "stable";
  readings: FloodReading[];
}

export interface BasinStatus {
  name: string;
  level: number;
  status: "normal" | "minor" | "moderate" | "severe" | "extreme";
  population_at_risk: number;
  discharge_rate: number;
}

export interface District {
  id: number;
  name: string;
  flood_risk_level?: "low" | "medium" | "high" | "critical";
  population_affected?: number;
}

export interface FloodDashboard {
  status: "no_data" | "ok" | "warning" | "alert";
  forecasts: any[];
  forecast_date?: string;
  summary?: {
    critical_basins: number;
    at_risk_population: number;
    active_alerts: number;
    affected_roads_km?: number;
    affected_buildings?: number;
    affected_pois?: number;
    total_flood_extent_km2?: number;
  };
}

export interface FloodForecast {
  id: number;
  basin: string;
  forecast_date: string;
  expected_level: number;
  confidence: number;
  impact_assessment?: string;
}

// ── Full typed shape returned by /api/v1/floods/forecasts/ ────────────────────
export interface FloodImpact {
  id: number;
  district_name: string | null;
  river_basin_name: string | null;
  affected_population: number;
  affected_roads_km: number;
  affected_buildings_count: number;
  affected_pois_count: number;
  affected_landuse_area_km2: number;
  max_discharge: number;
  avg_discharge: number;
  flood_extent_km2: number;
}

export interface FloodForecastFull {
  id: number;
  forecast_date: string;
  valid_date: string;
  leadtime_hours: number;
  downloaded: boolean;
  processed: boolean;
  uploaded_to_geoserver: boolean;
  alert_level: "none" | "low" | "medium" | "high" | "extreme";
  total_affected_population: number;
  total_flood_extent_km2: number;
  wms_url: string | null;
  layer_name: string | null;
  impacts: FloodImpact[];
}

export interface FloodRasterLayer {
  id: number;
  forecast_id: number;
  forecast_date: string;
  valid_date: string;
  leadtime_hours: number;
  workspace: string;
  layer_name: string;
  raw_layer_name: string;
  store_name: string;
  wms_url: string | null;
  published: boolean;
  uploaded_to_geoserver: boolean;
  image: string | null;
}

export interface FloodQuery {
  date?: string;
  leadtimeHours?: number;
}

function floodQueryString(query?: FloodQuery): string {
  const params = new URLSearchParams();
  if (query?.date) params.set("date", query.date);
  if (query?.leadtimeHours !== undefined) {
    params.set("leadtime_hours", String(query.leadtimeHours));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

/**
 * Flood API
 */
// ── New flood API types ───────────────────────────────────────────────────────

export interface FloodActualEvent {
  id: number;
  basin_name: string | null;
  district_name: string | null;
  event_date: string;
  severity: "minor" | "moderate" | "severe" | "extreme";
  area_affected_km2?: number;
  affected_population?: number;
  description?: string;
}

export interface FloodBasin {
  id: number;
  name: string;
  area_km2?: number;
  flood_threshold?: number;       // m³/s bank-full discharge threshold
  warning_threshold?: number;     // m³/s
  alert_level?: "none" | "low" | "medium" | "high" | "extreme";
}

export interface FloodSeason {
  id: number;
  name: string;
  start_month: number;
  end_month: number;
  season_type: "long_rains" | "short_rains" | "dry";
  is_current: boolean;
}

export interface FloodPipelineStatus {
  status: "idle" | "running" | "success" | "failed";
  last_run?: string;       // ISO datetime
  next_run?: string;       // ISO datetime
  forecast_date?: string;
  message?: string;
}

export const floodAPI = {
  /**
   * Get flood dashboard with overall status and recent forecasts
   */
  getDashboard: async (query?: FloodQuery) => {
    return fetchData<FloodDashboard>(`floods/dashboard/${floodQueryString(query)}`);
  },

  /**
   * Get extended dashboard with additional metrics
   */
  getDashboardExtended: async () => {
    return fetchData("floods/dashboard/extended/");
  },

  /**
   * Get basin status for all rivers
   */
  getBasinStatus: async (query?: FloodQuery) => {
    return fetchData<BasinStatus[]>(`floods/basin-status/${floodQueryString(query)}`);
  },

  /**
   * Get basin trend for a specific basin
   */
  getBasinTrend: async (basin?: string, query?: FloodQuery) => {
    const params = new URLSearchParams();
    if (basin) params.set("basin", basin);
    if (query?.date) params.set("date", query.date);
    if (query?.leadtimeHours !== undefined) {
      params.set("leadtime_hours", String(query.leadtimeHours));
    }
    const queryString = params.toString();
    const endpoint = `floods/basin-trend/${queryString ? `?${queryString}` : ""}`;
    return fetchData<BasinTrend>(endpoint);
  },

  /**
   * Get all available forecast dates
   */
  getForecastDates: async () => {
    return fetchData<string[]>("floods/dates/");
  },

  /**
   * Get flood raster layers that are actually published in GeoServer.
   */
  getRasterLayers: async (date?: string) => {
    const endpoint = date
      ? `floods/layers/?date=${date}`
      : "floods/layers/";
    return fetchData<{
      count: number;
      latest_forecast_date: string | null;
      layers: FloodRasterLayer[];
    }>(endpoint);
  },

  /**
   * Get flood forecasts, optionally filtered by date.
   * Returns the full forecast shape including per-district and per-basin impacts.
   */
  getForecasts: async (date?: string, leadtimeHours?: number) => {
    const endpoint = `floods/forecasts/${floodQueryString({
      date,
      leadtimeHours,
    })}`;
    // The API returns a paginated object { count, results: FloodForecastFull[] }
    const raw = await fetchData<{ count: number; results: FloodForecastFull[] } | FloodForecastFull[]>(endpoint);
    // Handle both paginated and plain-array responses
    if (Array.isArray(raw)) return raw;
    return (raw as any).results ?? [];
  },

  /**
   * Get specific forecast by ID
   */
  getForecastById: async (id: number) => {
    return fetchData<FloodForecast>(`floods/forecasts/${id}/`);
  },

  /**
   * Get districts affected by floods
   */
  getDistricts: async (query?: FloodQuery) => {
    return fetchData<{ date: string | null; districts: District[] }>(
      `floods/districts/${floodQueryString(query)}`,
    );
  },

  /**
   * Get raw flood data (legacy endpoint)
   */
  getData: async (districtId?: number) => {
    const endpoint = districtId
      ? `${import.meta.env.VITE_API_FLOOD_ENDPOINT || "floods/data"}?district_id=${districtId}`
      : import.meta.env.VITE_API_FLOOD_ENDPOINT || "floods/data";
    return fetchData(endpoint);
  },

  /**
   * Get flood-prone areas
   */
  getAreas: async () => {
    return fetchData("floods/areas/");
  },

  /**
   * Get confirmed actual flood events (not forecasts)
   */
  getActualEvents: async (limit = 10) => {
    return fetchData<{ count: number; results: FloodActualEvent[] }>(
      `floods/actual-events/?limit=${limit}`
    );
  },

  /**
   * Get all monitored river basins with thresholds
   */
  getBasins: async () => {
    return fetchData<FloodBasin[]>("floods/basins/");
  },

  /**
   * Get flood seasons (current + upcoming)
   */
  getSeasons: async () => {
    return fetchData<FloodSeason[]>("floods/seasons/");
  },

  /**
   * Get forecast pipeline status (last run, next run, running state)
   */
  getForecastPipeline: async () => {
    return fetchData<FloodPipelineStatus>("floods/forecast-pipeline/");
  },

  /**
   * Export flood data — pass current date + basin for contextual export
   */
  exportData: async (format: "csv" | "pdf" | "json" = "csv", date?: string, basin?: string) => {
    const params = new URLSearchParams();
    params.set("format", format);
    if (date) params.set("date", date);
    if (basin && basin !== "All Basins") params.set("basin", basin);
    return fetchData(`floods/export/?${params.toString()}`);
  },

  /**
   * Get pipeline status
   */
  getPipelineStatus: async (jobId: string) => {
    return fetchData(`floods/pipeline/status/${jobId}/`);
  },

  /**
   * Trigger pipeline run
   */
  runPipeline: async () => {
    return fetchData("floods/pipeline/run/", { method: "POST" });
  },
};

/**
 * Weather Stations API
 */
export const stationsAPI = {
  getAll: async (region?: string, status?: "online" | "offline" | "maintenance") => {
    let endpoint = "weather-stations/";
    const params = new URLSearchParams();
    if (region) params.append("region", region);
    if (status) params.append("status", status);
    if (params.toString()) endpoint += `?${params.toString()}`;
    return fetchData<WeatherStationAPI[]>(endpoint);
  },

  getById: async (stationId: string | number) => {
    return fetchData<WeatherStation>(`weather-stations/${stationId}/`);
  },

  getReadings: async (stationCode: string, hours: number = 24) => {
    // Endpoint: /api/v1/weather-stations/{station_code}/readings/?hours=N
    return fetchData<StationReading[]>(
      `weather-stations/${stationCode}/readings/?hours=${hours}`
    );
  },

  getAlerts: async () => {
    return fetchData<StationAlert[]>("weather-stations/alerts/");
  },

  getNetworkSummary: async () => {
    return fetchData<NetworkSummary>("weather-stations/network-summary/");
  },

  exportReadings: async (format: "csv" | "pdf" = "csv", stationId?: string | number, hours?: number) => {
    let endpoint = `weather-stations/export/?format=${format}`;
    if (stationId) endpoint += `&station_id=${stationId}`;
    if (hours) endpoint += `&hours=${hours}`;
    const url = `${API_BASE}${endpoint}`;
    return fetch(url);
  },

  syncStatus: async () => {
    return fetchData("weather-stations/sync/", { method: "POST" });
  },
};

/**
 * GeoJSON data fetching (for boundaries, maps, etc.)
 */
export const geoAPI = {
  getUgandaBoundary: async () => {
    const res: any = await fetchData("boundaries/admin");
    return res?.results;
  },

  getDistricts: async () => {
    return fetchData("geojson/districts");
  },

  getWaterAreas: async () => {
    return fetchData("geojson/water-areas");
  },
};

// Districts API (for dropdowns, filters, etc.)
export const DistrictsAPI = {
  getAll: async () => {
    const res = await fetchData<{
      count: number;
      districts: Array<{ id: number; name: string; region: string | null }>;
    }>("weather/districts/");
    return res?.districts || [];
  },
};
export default {
  overviewAPI,
  alertsAPI,
  weatherAPI,
  droughtAPI,
  floodAPI,
  stationsAPI,
  geoAPI,
  DistrictsAPI,
};