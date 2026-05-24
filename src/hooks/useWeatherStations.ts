import { useEffect, useState, useCallback } from 'react';
import { stationsAPI } from '../services/api';
import type { WeatherStation, StationAlert } from '../types/data_types';

let stationsCache = {
  all: null as WeatherStation[] | null,
  lastFetch: 0,
};

export function useWeatherStations(region?: string, status?: "online" | "offline" | "maintenance") {
  const [stations, setStations] = useState<WeatherStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await stationsAPI.getAll(region, status);
      setStations(result || []);
      stationsCache.all = result;
      stationsCache.lastFetch = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stations');
      setStations([]);
    } finally {
      setLoading(false);
    }
  }, [region, status]);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const refetch = useCallback(() => {
    stationsCache = { all: null, lastFetch: 0 };
    fetchStations();
  }, [fetchStations]);

  return { stations, loading, error, refetch };
}

export function useStationAlerts() {
  const [alerts, setAlerts] = useState<StationAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await stationsAPI.getAlerts();
        setAlerts(result || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
  }, []);

  return { alerts, loading, error };
}
