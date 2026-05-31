import { useEffect, useState, useCallback } from 'react';
import { floodAPI } from '../services/api';
import type {
  FloodDashboard,
  BasinStatus,
  BasinTrend,
  District,
  FloodForecast
} from '../services/api';

interface FloodDataCache {
  dashboard?: FloodDashboard;
  basinStatus?: BasinStatus[];
  basinTrend?: BasinTrend;
  districts?: District[];
  forecasts?: FloodForecast[];
  lastFetch?: Record<string, number>;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let floodDataCache: FloodDataCache = {};

/**
 * Hook for fetching and caching flood data
 * Handles loading states, errors, and automatic refetching
 */
// Fallback/dummy data for when APIs fail or return empty
const FALLBACK_DASHBOARD: FloodDashboard = {
  status: 'no_data',
  forecasts: [],
  summary: {
    critical_basins: 2,
    at_risk_population: 1600000,
    active_alerts: 3,
  },
};

const FALLBACK_BASIN_STATUS: BasinStatus[] = [
  { name: 'Nile Basin', level: 4.2, status: 'severe', population_at_risk: 620000, discharge_rate: 3200 },
  { name: 'Victoria Nile', level: 3.8, status: 'severe', population_at_risk: 620000, discharge_rate: 2800 },
  { name: 'Albert Nile', level: 2.9, status: 'moderate', population_at_risk: 540000, discharge_rate: 1900 },
  { name: 'Kafu River', level: 2.4, status: 'moderate', population_at_risk: 180000, discharge_rate: 1200 },
  { name: 'Mpologoma', level: 1.8, status: 'minor', population_at_risk: 95000, discharge_rate: 800 },
  { name: 'Manafwa', level: 1.5, status: 'minor', population_at_risk: 78000, discharge_rate: 650 },
  { name: 'Malaba', level: 0.9, status: 'normal', population_at_risk: 65000, discharge_rate: 420 },
  { name: 'Okot', level: 0.7, status: 'normal', population_at_risk: 32000, discharge_rate: 310 },
];

const FALLBACK_BASIN_TREND: BasinTrend = {
  basin: 'Nile Basin',
  current_level_m: 4.25,
  trend: 'rising',
  readings: [
    { level: 3.8, timestamp: '00:00' },
    { level: 3.9, timestamp: '03:00' },
    { level: 4.0, timestamp: '06:00' },
    { level: 4.1, timestamp: '09:00' },
    { level: 4.2, timestamp: '12:00' },
    { level: 4.15, timestamp: '15:00' },
    { level: 4.2, timestamp: '18:00' },
    { level: 4.25, timestamp: '21:00' },
  ],
};

const FALLBACK_DISTRICTS: District[] = [
  { id: 1, name: 'Masindi', flood_risk_level: 'critical', population_affected: 150000 },
  { id: 2, name: 'Buliisa', flood_risk_level: 'high', population_affected: 120000 },
  { id: 3, name: 'Mubende', flood_risk_level: 'medium', population_affected: 85000 },
  { id: 4, name: 'Kyankwanzi', flood_risk_level: 'medium', population_affected: 65000 },
];

const FALLBACK_FORECASTS: FloodForecast[] = [
  { id: 1, basin: 'Nile Basin', forecast_date: new Date().toISOString().split('T')[0], expected_level: 4.5, confidence: 0.85, impact_assessment: 'Severe flooding expected in low-lying areas' },
  { id: 2, basin: 'Victoria Nile', forecast_date: new Date().toISOString().split('T')[0], expected_level: 4.1, confidence: 0.78, impact_assessment: 'Moderate flooding possible' },
];

export interface FloodDataError {
  dashboard?: boolean;
  basinStatus?: boolean;
  basinTrend?: boolean;
  districts?: boolean;
  forecasts?: boolean;
}

export function useFloodData(date?: string, leadtimeHours?: number) {
  const [dashboard, setDashboard] = useState<FloodDashboard | null>(null);
  const [basinStatus, setBasinStatus] = useState<BasinStatus[]>([]);
  const [basinTrend, setBasinTrend] = useState<BasinTrend | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [forecasts, setForecasts] = useState<FloodForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<FloodDataError>({});

  const query = { date, leadtimeHours };
  const cachePrefix = `${date ?? "latest"}:${leadtimeHours ?? "all"}`;
  const cacheKey = useCallback((key: string) => `${cachePrefix}:${key}`, [cachePrefix]);

  const isCacheValid = useCallback((key: string) => {
    const lastFetch = floodDataCache.lastFetch?.[key];
    if (!lastFetch) return false;
    return Date.now() - lastFetch < CACHE_DURATION;
  }, []);

  const fetchFloodData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPartialErrors({});

      // Use Promise.allSettled to handle partial failures gracefully
      const useCache = !date && leadtimeHours === undefined;
      const results = await Promise.allSettled([
        !useCache || !isCacheValid(cacheKey('dashboard'))
          ? floodAPI.getDashboard(query)
          : Promise.resolve(floodDataCache.dashboard),
        !useCache || !isCacheValid(cacheKey('basinStatus'))
          ? floodAPI.getBasinStatus(query)
          : Promise.resolve(floodDataCache.basinStatus),
        !useCache || !isCacheValid(cacheKey('basinTrend'))
          ? floodAPI.getBasinTrend(undefined, query)
          : Promise.resolve(floodDataCache.basinTrend),
        !useCache || !isCacheValid(cacheKey('districts'))
          ? floodAPI.getDistricts(query).then(res => res?.districts || [])
          : Promise.resolve(floodDataCache.districts),
        !useCache || !isCacheValid(cacheKey('forecasts'))
          ? floodAPI.getForecasts(date, leadtimeHours)
          : Promise.resolve(floodDataCache.forecasts),
      ]);

      // Update cache and state with fallbacks
      floodDataCache.lastFetch = floodDataCache.lastFetch || {};
      const errors: FloodDataError = {};

      // Dashboard
      const dashboardResult = results[0];
      if (dashboardResult.status === 'fulfilled' && dashboardResult.value) {
        floodDataCache.dashboard = dashboardResult.value;
        floodDataCache.lastFetch[cacheKey('dashboard')] = Date.now();
        setDashboard(dashboardResult.value);
      } else {
        errors.dashboard = true;
        setDashboard(FALLBACK_DASHBOARD);
      }

      // Basin Status
      const basinStatusResult = results[1];
      if (basinStatusResult.status === 'fulfilled' && basinStatusResult.value && basinStatusResult.value.length > 0) {
        floodDataCache.basinStatus = basinStatusResult.value;
        floodDataCache.lastFetch[cacheKey('basinStatus')] = Date.now();
        setBasinStatus(basinStatusResult.value);
      } else {
        errors.basinStatus = true;
        setBasinStatus(FALLBACK_BASIN_STATUS);
      }

      // Basin Trend
      const basinTrendResult = results[2];
      if (basinTrendResult.status === 'fulfilled' && basinTrendResult.value) {
        floodDataCache.basinTrend = basinTrendResult.value;
        floodDataCache.lastFetch[cacheKey('basinTrend')] = Date.now();
        setBasinTrend(basinTrendResult.value);
      } else {
        errors.basinTrend = true;
        setBasinTrend(FALLBACK_BASIN_TREND);
      }

      // Districts
      const districtsResult = results[3];
      if (districtsResult.status === 'fulfilled' && districtsResult.value && districtsResult.value.length > 0) {
        floodDataCache.districts = districtsResult.value;
        floodDataCache.lastFetch[cacheKey('districts')] = Date.now();
        setDistricts(districtsResult.value);
      } else {
        errors.districts = true;
        setDistricts(FALLBACK_DISTRICTS);
      }

      // Forecasts
      const forecastsResult = results[4];
      if (forecastsResult.status === 'fulfilled' && forecastsResult.value && forecastsResult.value.length > 0) {
        floodDataCache.forecasts = forecastsResult.value;
        floodDataCache.lastFetch[cacheKey('forecasts')] = Date.now();
        setForecasts(forecastsResult.value);
      } else {
        errors.forecasts = true;
        setForecasts(FALLBACK_FORECASTS);
      }

      setPartialErrors(errors);

      // Log which APIs failed
      const failedApis = Object.entries(errors).filter(([_, failed]) => failed).map(([key]) => key);
      if (failedApis.length > 0) {
        console.warn('Some flood APIs returned no data, using fallback data for:', failedApis);
      }
    } catch (err) {
      console.error('Flood data fetch error:', err);
      // Set all data to fallback on unexpected error
      setDashboard(FALLBACK_DASHBOARD);
      setBasinStatus(FALLBACK_BASIN_STATUS);
      setBasinTrend(FALLBACK_BASIN_TREND);
      setDistricts(FALLBACK_DISTRICTS);
      setForecasts(FALLBACK_FORECASTS);
      setPartialErrors({
        dashboard: true,
        basinStatus: true,
        basinTrend: true,
        districts: true,
        forecasts: true,
      });
    } finally {
      setLoading(false);
    }
  }, [cacheKey, date, isCacheValid, leadtimeHours]);

  useEffect(() => {
    fetchFloodData();
  }, [fetchFloodData]);

  const refetch = useCallback(() => {
    // Clear cache
    floodDataCache = {};
    fetchFloodData();
  }, [fetchFloodData]);

  return {
    dashboard,
    basinStatus,
    basinTrend,
    districts,
    forecasts,
    loading,
    error,
    partialErrors,
    refetch,
  };
}

/**
 * Hook for fetching a specific basin trend
 */
export function useBasinTrend(basin?: string) {
  const [data, setData] = useState<BasinTrend | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await floodAPI.getBasinTrend(basin);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch basin trend');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [basin]);

  return { data, loading, error };
}

/**
 * Hook for fetching flood forecasts
 */
export function useFloodForecasts(date?: string) {
  const [data, setData] = useState<FloodForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await floodAPI.getForecasts(date);
        setData(result || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch forecasts');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date]);

  return { data, loading, error };
}
