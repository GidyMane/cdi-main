/**
 * Centralized API service for all weather/disaster data fetching
 * Uses environment variables for endpoints
 */

import type { WeatherStation, StationReading, StationAlert, NetworkSummary } from "@/types/data_types";
import { API_BASE } from "@/config";

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
      ? `weather/forecasts/?district_id=${districtId}`
      : "weather/forecasts/";
    const response = await fetchData<any>(endpoint);
    // Transform the paginated response to hourly forecast format
    // Generate hourly data from the forecast results
    const hourlyData = (response.results || []).flatMap((item: any) => {
      // Create 24 hourly entries from the forecast data
      const baseDate = new Date(item.forecast_date || new Date());
      return Array.from({ length: 24 }, (_, hour) => {
        const date = new Date(baseDate);
        date.setHours(hour, 0, 0, 0);
        return {
          temp: item.temperature || 0,
          time: date.toISOString(),
          precip: 0,
          weather_code: item.weather_code || 0,
          weather_description: item.weather_description || "",
        };
      });
    });
    const firstForecast = response.results?.[0];
    return {
      hourly: hourlyData.slice(0, 24), // Limit to first 24 hours
      district: firstForecast?.district_name || "Uganda",
      forecast_date: firstForecast?.forecast_date || new Date().toISOString().split('T')[0],
      fetched_at: new Date().toISOString()
    };
  },

  getForecastDaily: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/forecast/?district_id=${districtId}`
      : "weather/forecast/";
    return fetchData(endpoint);
  },

  getExportData: async (districtId?: number) => {
    const endpoint = districtId
      ? `weather/export?district_id=${districtId}`
      : "weather/export";

    const url = `${API_BASE}${endpoint}`;
    return fetch(url);
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
  summary?: {
    critical_basins: number;
    at_risk_population: number;
    active_alerts: number;
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
    return fetchData<WeatherStation[]>(endpoint);
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
    const res = await fetchData<any>("boundaries/districts/autocomplete/");

    console.log("Fetched districts:", res);
    return res || []; // unwrap here so the query gets a clean array
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
