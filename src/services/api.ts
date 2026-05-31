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
): Promise<T> {
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

  /**
   * Fetch available raster frames from the weather raster API.
   * Returns frames with wms_layer names and geoserver WMS URL.
   */
  getRasterFrames: async (model: string, parameter?: string) => {
    let endpoint = `weather/raster/frames/${model}/`;
    if (parameter) endpoint += `?parameter=${parameter}`;
    return fetchData<{
      model: string;
      count: number;
      frames: Array<{
        model: string;
        parameter: string;
        level: string;
        run: string;
        run_epoch: number;
        forecast_hour: number;
        file: string;
        wms_layer: string;
        future_wms_layer: string;
        frame_url: string;
      }>;
      geoserver: {
        workspace: string;
        wms_url: string;
      };
    }>(endpoint);
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

/**
 * Flood API
 */
export const floodAPI = {
  /**
   * Get flood dashboard with overall status and recent forecasts
   */
  getDashboard: async () => {
    return fetchData<FloodDashboard>("floods/dashboard/");
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
  getBasinStatus: async () => {
    return fetchData<BasinStatus[]>("floods/basin-status/");
  },

  /**
   * Get basin trend for a specific basin
   */
  getBasinTrend: async (basin?: string) => {
    const endpoint = basin
      ? `floods/basin-trend/?basin=${basin}`
      : "floods/basin-trend/";
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
   * Get flood forecasts, optionally filtered by date
   */
  getForecasts: async (date?: string) => {
    const endpoint = date
      ? `floods/forecasts/?date=${date}`
      : "floods/forecasts/";
    return fetchData<FloodForecast[]>(endpoint);
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
  getDistricts: async () => {
    return fetchData<{ date: string | null; districts: District[] }>(
      "floods/districts/",
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
   * Export flood data
   */
  exportData: async (format: "csv" | "pdf" | "json" = "csv") => {
    return fetchData(`floods/export/?format=${format}`);
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

  getReadings: async (stationId: string | number, hours: number = 24) => {
    return fetchData<StationReading[]>(
      `weather-stations/${stationId}/readings/?hours=${hours}`
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
