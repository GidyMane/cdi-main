import { useEffect, useState, useCallback } from 'react';

// ── Base URL ──────────────────────────────────────────────────────────────────
const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? 'https://multihazard.rosewillbome.com/api/v1/';
const api = (path: string) => `${BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(api(path));
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${path}`);
  return res.json() as Promise<T>;
}

// ── API shape types (matching real endpoints) ─────────────────────────────────

export interface ApiBasin {
  name: string;
  level: number;
  status: 'normal' | 'minor' | 'moderate' | 'severe' | 'extreme';
  population_at_risk: number;
  discharge_rate: number;
}

export interface ApiActualEvent {
  id: number;
  name: string;
  event_type: string;
  event_type_display: string;
  status: string;
  status_display: string;
  start_date: string;
  end_date: string | null;
  duration_days: number | null;
  affected_areas: any[];
  associated_season: any;
  estimated_affected_population: number | null;
  estimated_damage_usd: number | null;
  data_source: string;
  reliability_score: number;
  downloaded: boolean;
  processed: boolean;
  uploaded_to_geoserver: boolean;
  alert_level: string;
  total_affected_population: number;
  total_flood_extent_km2: number;
  wms_url: string | null;
  layer_name: string | null;
}

export interface ForecastImpact {
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

export interface ApiForecast {
  id: number;
  forecast_date: string;
  valid_date: string;
  leadtime_hours: number;
  downloaded: boolean;
  processed: boolean;
  uploaded_to_geoserver: boolean;
  alert_level: string;
  total_affected_population: number;
  total_flood_extent_km2: number;
  wms_url: string | null;
  layer_name: string | null;
  impacts: ForecastImpact[];
}

export interface ApiSeason {
  id: number;
  name: string;
  season_type: 'rainy' | 'dry';
  season_type_display: string;
  start_month: number;
  end_month: number;
  start_day: number;
  end_day: number;
  flood_analysis_frequency: string;
  analysis_frequency_display: string;
  primary_hazards: string[];
  affected_regions: string[];
  description: string;
}

export interface ApiDistrictFlood {
  id: number;
  name: string;
  flood_risk_level: 'low' | 'medium' | 'high' | 'critical';
  population_affected: number;
  flood_extent_km2: number;
  max_discharge: number;
  leadtime_hours: number;
}

// ── Derived / processed types for UI ─────────────────────────────────────────

export interface FloodSummary {
  totalAffectedPopulation: number;
  totalFloodExtentKm2: number;
  criticalDistrictCount: number;
  highDistrictCount: number;
  mediumDistrictCount: number;
  lowDistrictCount: number;
  affectedRoadsKm: number;
  affectedBuildingsCount: number;
  latestForecastDate: string | null;
  latestAlertLevel: string;
  forecastLeadtimes: number[];
}

export interface FloodData {
  basins: ApiBasin[];
  actualEvents: ApiActualEvent[];
  forecasts: ApiForecast[];
  seasons: ApiSeason[];
  districts: ApiDistrictFlood[];
  summary: FloodSummary;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// ── Aggregate summary from forecasts + districts ──────────────────────────────

function buildSummary(
  forecasts: ApiForecast[],
  districts: ApiDistrictFlood[],
): FloodSummary {
  const latest = forecasts[0] ?? null;

  // Aggregate impacts across all leadtimes of the latest forecast date
  const latestDateForecasts = latest
    ? forecasts.filter(f => f.forecast_date === latest.forecast_date)
    : [];

  // Use 24h forecast impacts for primary stats
  const primary = latestDateForecasts.find(f => f.leadtime_hours === 24) ?? latest;
  const districtImpacts = (primary?.impacts ?? []).filter(i => i.district_name !== null);

  const affectedRoadsKm = districtImpacts.reduce((s, i) => s + (i.affected_roads_km ?? 0), 0);
  const affectedBuildingsCount = districtImpacts.reduce((s, i) => s + (i.affected_buildings_count ?? 0), 0);

  // Deduplicate districts to get highest risk level per district
  const districtMap = new Map<string, ApiDistrictFlood>();
  const riskOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  for (const d of districts) {
    const existing = districtMap.get(d.name);
    if (!existing || riskOrder[d.flood_risk_level] > riskOrder[existing.flood_risk_level]) {
      districtMap.set(d.name, d);
    }
  }
  const uniqueDistricts = Array.from(districtMap.values());

  return {
    totalAffectedPopulation: primary?.total_affected_population ?? 0,
    totalFloodExtentKm2: primary?.total_flood_extent_km2 ?? 0,
    criticalDistrictCount: uniqueDistricts.filter(d => d.flood_risk_level === 'critical').length,
    highDistrictCount:     uniqueDistricts.filter(d => d.flood_risk_level === 'high').length,
    mediumDistrictCount:   uniqueDistricts.filter(d => d.flood_risk_level === 'medium').length,
    lowDistrictCount:      uniqueDistricts.filter(d => d.flood_risk_level === 'low').length,
    affectedRoadsKm:       Math.round(affectedRoadsKm),
    affectedBuildingsCount,
    latestForecastDate:    latest?.forecast_date ?? null,
    latestAlertLevel:      latest?.alert_level ?? 'none',
    forecastLeadtimes:     [...new Set(forecasts.map(f => f.leadtime_hours))].sort((a, b) => a - b),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useFloodData(): FloodData {
  const [basins,       setBasins]       = useState<ApiBasin[]>([]);
  const [actualEvents, setActualEvents] = useState<ApiActualEvent[]>([]);
  const [forecasts,    setForecasts]    = useState<ApiForecast[]>([]);
  const [seasons,      setSeasons]      = useState<ApiSeason[]>([]);
  const [districts,    setDistricts]    = useState<ApiDistrictFlood[]>([]);
  const [summary,      setSummary]      = useState<FloodSummary>({
    totalAffectedPopulation: 0, totalFloodExtentKm2: 0,
    criticalDistrictCount: 0, highDistrictCount: 0,
    mediumDistrictCount: 0, lowDistrictCount: 0,
    affectedRoadsKm: 0, affectedBuildingsCount: 0,
    latestForecastDate: null, latestAlertLevel: 'none',
    forecastLeadtimes: [24, 48, 72],
  });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [tick,    setTick]    = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [basinsRes, eventsRes, forecastsRes, seasonsRes, districtsRes] =
          await Promise.allSettled([
            get<ApiBasin[]>('floods/basins/'),
            get<{ count: number; results: ApiActualEvent[] }>('floods/actual-events/'),
            get<{ count: number; results: ApiForecast[] }>('floods/forecasts/'),
            get<{ count: number; results: ApiSeason[] }>('floods/seasons/'),
            get<{ date: string | null; districts: ApiDistrictFlood[] }>('floods/districts/'),
          ]);

        if (cancelled) return;

        const b   = basinsRes.status       === 'fulfilled' ? basinsRes.value                       : [];
        const ev  = eventsRes.status       === 'fulfilled' ? (eventsRes.value?.results   ?? [])    : [];
        const fc  = forecastsRes.status    === 'fulfilled' ? (forecastsRes.value?.results ?? [])   : [];
        const se  = seasonsRes.status      === 'fulfilled' ? (seasonsRes.value?.results   ?? [])   : [];
        const di  = districtsRes.status    === 'fulfilled' ? (districtsRes.value?.districts ?? []) : [];

        setBasins(b);
        setActualEvents(ev);
        setForecasts(fc);
        setSeasons(se);
        setDistricts(di);
        setSummary(buildSummary(fc, di));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load flood data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tick]);

  return { basins, actualEvents, forecasts, seasons, districts, summary, loading, error, refetch };
}