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
        setDashboard(null);
      }

      // Basin Status
      const basinStatusResult:any = results[1];
      if (basinStatusResult.status === 'fulfilled' && basinStatusResult.value?.length > 0) {
        floodDataCache.basinStatus = basinStatusResult.value;
        floodDataCache.lastFetch[cacheKey('basinStatus')] = Date.now();
        setBasinStatus(basinStatusResult?.value);
      } else {
        errors.basinStatus = true;
        setBasinStatus([]);
      }

      // Basin Trend
      const basinTrendResult:any = results[2];
      if (basinTrendResult.status === 'fulfilled' && basinTrendResult.value) {
        floodDataCache.basinTrend = basinTrendResult.value;
        floodDataCache.lastFetch[cacheKey('basinTrend')] = Date.now();
        setBasinTrend(basinTrendResult.value);
      } else {
        errors.basinTrend = true;
        setBasinTrend(null);
      }

      // Districts
      const districtsResult:any = results[3];
      if (districtsResult.status === 'fulfilled' && districtsResult.value?.length > 0) {
        floodDataCache.districts = districtsResult.value;
        floodDataCache.lastFetch[cacheKey('districts')] = Date.now();
        setDistricts(districtsResult.value);
      } else {
        errors.districts = true;
        setDistricts([]);
      }

      // Forecasts
      const forecastsResult:any = results[4];
      if (forecastsResult.status === 'fulfilled' && forecastsResult.value?.length > 0) {
        floodDataCache.forecasts = forecastsResult.value;
        floodDataCache.lastFetch[cacheKey('forecasts')] = Date.now();
        setForecasts(forecastsResult.value);
      } else {
        errors.forecasts = true;
        setForecasts([]);
      }

      setPartialErrors(errors);

      const failedApis = Object.entries(errors)
        .filter(([, failed]) => failed)
        .map(([key]) => key);
      if (failedApis.length > 0) {
        console.warn('[useFloodData] No data from:', failedApis.join(', '));
      }
    } catch (err) {
      console.error('[useFloodData] fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch flood data');
      setDashboard(null);
      setBasinStatus([]);
      setBasinTrend(null);
      setDistricts([]);
      setForecasts([]);
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
        setData(null);
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
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [date]);

  return { data, loading, error };
}
