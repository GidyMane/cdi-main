import { useEffect, useState, useCallback } from 'react';
import { floodAPI } from '../services/api';
import type {
  FloodDashboard,
  BasinStatus,
  BasinTrend,
  District,
  FloodForecast,
  FloodForecastFull,
} from '../services/api';

interface FloodDataCache {
  dashboard?: FloodDashboard;
  basinStatus?: BasinStatus[];
  basinTrend?: BasinTrend;
  districts?: District[];
  forecasts?: FloodForecast[];
  forecastsFull?: FloodForecastFull[];
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

export function useFloodData(date?: string, leadtimeHours?: number, basin?: string) {
  const [dashboard, setDashboard] = useState<FloodDashboard | null>(null);
  const [basinStatus, setBasinStatus] = useState<BasinStatus[]>([]);
  const [basinTrend, setBasinTrend] = useState<BasinTrend | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [forecasts, setForecasts] = useState<FloodForecast[]>([]);
  const [forecastsFull, setForecastsFull] = useState<FloodForecastFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<FloodDataError>({});

  const cachePrefix = `${date ?? "latest"}:${leadtimeHours ?? "all"}:${basin ?? "all"}`;
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
          ? floodAPI.getDashboard({ date, leadtimeHours })
          : Promise.resolve(floodDataCache.dashboard),
        !useCache || !isCacheValid(cacheKey('basinStatus'))
          ? floodAPI.getBasinStatus({ date, leadtimeHours })
          : Promise.resolve(floodDataCache.basinStatus),
        !useCache || !isCacheValid(cacheKey('basinTrend'))
          ? floodAPI.getBasinTrend(basin, { date, leadtimeHours })
          : Promise.resolve(floodDataCache.basinTrend),
        !useCache || !isCacheValid(cacheKey('districts'))
          ? floodAPI.getDistricts({ date, leadtimeHours }).then(res => res?.districts || [])
          : Promise.resolve(floodDataCache.districts),
        // Always fetch full forecasts (not cached differently)
        floodAPI.getForecasts(date, leadtimeHours),
      ]);

      floodDataCache.lastFetch = floodDataCache.lastFetch || {};
      const errors: FloodDataError = {};

      // Dashboard — error only on rejection (network/server failure), not on null response
      const dashboardResult = results[0];
      if (dashboardResult.status === 'fulfilled') {
        floodDataCache.dashboard = (dashboardResult.value ?? null) as FloodDashboard;
        floodDataCache.lastFetch[cacheKey('dashboard')] = Date.now();
        setDashboard(dashboardResult.value as FloodDashboard ?? null);
      } else {
        errors.dashboard = true;
        setDashboard(null);
      }

      // Basin Status — empty array is valid (no basins), only rejected = error
      const basinStatusResult: any = results[1];
      if (basinStatusResult.status === 'fulfilled') {
        const val = Array.isArray(basinStatusResult.value) ? basinStatusResult.value : [];
        floodDataCache.basinStatus = val;
        floodDataCache.lastFetch[cacheKey('basinStatus')] = Date.now();
        setBasinStatus(val);
      } else {
        errors.basinStatus = true;
        setBasinStatus([]);
      }

      // Basin Trend — null is valid when no basin is selected or data not yet available
      const basinTrendResult: any = results[2];
      if (basinTrendResult.status === 'fulfilled') {
        floodDataCache.basinTrend = basinTrendResult.value ?? null;
        floodDataCache.lastFetch[cacheKey('basinTrend')] = Date.now();
        setBasinTrend(basinTrendResult.value ?? null);
      } else {
        errors.basinTrend = true;
        setBasinTrend(null);
      }

      // Districts — empty array is valid
      const districtsResult: any = results[3];
      if (districtsResult.status === 'fulfilled') {
        const val = Array.isArray(districtsResult.value) ? districtsResult.value : [];
        floodDataCache.districts = val;
        floodDataCache.lastFetch[cacheKey('districts')] = Date.now();
        setDistricts(val);
      } else {
        errors.districts = true;
        setDistricts([]);
      }

      // Full Forecasts (from /floods/forecasts/)
      const forecastsResult: any = results[4];
      if (forecastsResult.status === 'fulfilled' && forecastsResult.value) {
        const full: FloodForecastFull[] = forecastsResult.value;
        floodDataCache.forecastsFull = full;
        floodDataCache.lastFetch[cacheKey('forecasts')] = Date.now();
        setForecastsFull(full);
        // Also populate legacy forecasts for any consumers that use it
        setForecasts(full as any);
      } else {
        errors.forecasts = true;
        setForecastsFull([]);
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
      setForecastsFull([]);
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
  }, [cacheKey, date, isCacheValid, leadtimeHours, basin]);

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
    forecastsFull,
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
 * Hook for fetching flood forecasts (full shape)
 */
export function useFloodForecasts(date?: string) {
  const [data, setData] = useState<FloodForecastFull[]>([]);
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