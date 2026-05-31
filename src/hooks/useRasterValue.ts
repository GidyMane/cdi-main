/**
 * useRasterValue.ts
 *
 * Fetches a GeoTIFF from GeoServer WCS and samples it at the centroid of
 * every district polygon in the provided GeoJSON, returning a lookup map of
 * { districtName (lowercase) → converted value }.
 *
 * Re-fetches automatically when `layerName` changes — so passing the active
 * WCS layer name (e.g. from the slider) causes recalculation on every frame.
 *
 * Supported parameters and their unit conversions:
 *
 *   temperature  → temperature_2m / gfs_temperature_2m  (Kelvin → °C)
 *   rainfall     → precipitation / gfs_precipitation    (mm, no conversion)
 *   humidity     → humidity / gfs_humidity              (%, no conversion)
 *   wind         → wind_u_10m / gfs_wind_u_10m          (m/s → km/h)
 */

import { useEffect, useRef, useState } from "react";
import { fromArrayBuffer } from "geotiff";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

// ── Constants ─────────────────────────────────────────────────────────────────

const UG_BBOX = "29.5,-1.6,35.2,4.3";
const GRID_W = 62;
const GRID_H = 64;

/** WCS layer name for each UI parameter (ICON nowcast) */
const PARAM_TO_LAYER: Record<string, string> = {
  temperature:   "temperature_2m",
  rainfall:      "precipitation",
  precipitation: "precipitation",
  humidity:      "humidity",
  wind:          "wind_u_10m",
};

/**
 * Detect which parameter type a WCS layer name belongs to.
 * Used to apply the correct unit conversion when a specific layer name
 * (e.g. "temperature_2m", "gfs_temperature_2m") is passed directly.
 */
function detectParam(layerName: string): string | null {
  const l = layerName.toLowerCase();
  console.log("layer name ",l)
  if (l.includes("temperature")) return "temperature";
  if (l.includes("precipitation") || l.includes("precip")) return "rainfall";
  if (l.includes("humidity")) return "humidity";
  if (l.includes("wind")) return "wind";
  return null;
}

/** Unit conversion applied after reading the raw pixel value */
const PARAM_CONVERT: Record<string, (v: number) => number> = {
  // ICON/GFS stores temperature in Kelvin; convert to Celsius
  temperature:   (v) => (v > 200 ? Math.round((v - 273.15) * 10) / 10 : Math.round(v * 10) / 10),
  rainfall:      (v) => Math.round(v * 100) / 100,
  precipitation: (v) => Math.round(v * 100) / 100,
  humidity:      (v) => Math.round(v * 10) / 10,
  // m/s → km/h
  wind:          (v) => Math.round(v * 3.6 * 10) / 10,
};

// ── GeoTIFF grid types ────────────────────────────────────────────────────────

interface Grid {
  data: Float32Array;
  nx: number;
  ny: number;
  west: number;
  north: number;
  dx: number;
  dy: number;
  nodata: number | null;
}

// ── Fetch + parse GeoTIFF ─────────────────────────────────────────────────────

async function fetchGrid(wcsUrl: string, layerName: string, signal?: AbortSignal): Promise<Grid> {
  console.log("second layerName ",layerName)
  const params = new URLSearchParams({
    service:  "WCS",
    version:  "1.0.0",
    request:  "GetCoverage",
    coverage: layerName,
    crs:      "EPSG:4326",
    bbox:     UG_BBOX,
    width:    String(GRID_W),
    height:   String(GRID_H),
    format:   "GeoTIFF",
  });

  const url = `${wcsUrl}?${params}`;
  console.log(`[useRasterValue] fetching ${layerName} from`, url);

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`WCS HTTP ${res.status} for ${layerName}`);

  const ct = res.headers.get("content-type") ?? "";
  console.log(`[useRasterValue] response content-type:`, ct);

  // GeoServer returns XML on error even with format=GeoTIFF
  if (ct.includes("xml") || ct.includes("exception")) {
    const text = await res.text();
    const m = text.match(/<(?:ows:)?ExceptionText>(.*?)<\/(?:ows:)?ExceptionText>/s);
    throw new Error(m ? m[1].trim() : `GeoServer WCS error: ${text.slice(0, 200)}`);
  }

  const buffer = await res.arrayBuffer();
  console.log(`[useRasterValue] GeoTIFF buffer size:`, buffer.byteLength, "bytes");

  const tiff   = await fromArrayBuffer(buffer);
  const image  = await tiff.getImage();
  const rasters = await image.readRasters();
  const raw    = rasters[0] as ArrayLike<number>;

  const [west, south, east, north] = image.getBoundingBox();
  const nx = image.getWidth();
  const ny = image.getHeight();
  const fileDir = (image as any).fileDirectory;
  const nodata  = fileDir?.GDAL_NODATA != null ? parseFloat(fileDir.GDAL_NODATA) : null;

  console.log(`[useRasterValue] grid ${nx}×${ny}, bbox=[${west},${south},${east},${north}], nodata=${nodata}`);

  // Sample a few raw values to detect Kelvin vs Celsius
  const midVal = (raw as any)[Math.floor(raw.length / 2)] as number;
  console.log(`[useRasterValue] sample raw pixel (mid):`, midVal, midVal > 200 ? "→ Kelvin, will convert" : "→ already °C");

  const data = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = (raw as any)[i] as number;
    data[i] =
      (nodata !== null && v === nodata) || isNaN(v) || v < -1e9 || v > 1e9
        ? NaN
        : v;
  }

  return { data, nx, ny, west, north, dx: (east - west) / nx, dy: (north - south) / ny, nodata };
}

// ── Sample grid at a geographic point ────────────────────────────────────────

function sampleGrid(lng: number, lat: number, grid: Grid): number | null {
  const col = Math.floor((lng - grid.west)  / grid.dx);
  const row = Math.floor((grid.north - lat) / grid.dy);
  if (col < 0 || col >= grid.nx || row < 0 || row >= grid.ny) return null;
  const v = grid.data[row * grid.nx + col];
  return isNaN(v) ? null : v;
}

// ── Polygon centroid (simple average of exterior ring) ────────────────────────

function ringCentroid(ring: number[][]): [number, number] {
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; }
  return [sumLng / ring.length, sumLat / ring.length];
}

function featureCentroid(feature: Feature): [number, number] | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "Polygon") {
    return ringCentroid((g as Polygon).coordinates[0]);
  }
  if (g.type === "MultiPolygon") {
    // Use the largest polygon (most coordinates)
    const polys = (g as MultiPolygon).coordinates;
    const biggest = polys.reduce((a, b) =>
      a[0].length >= b[0].length ? a : b
    );
    return ringCentroid(biggest[0]);
  }
  return null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseRasterValueResult {
  /** districtName.toLowerCase() → converted value (°C, mm, %, km/h) */
  values: Record<string, number>;
  loading: boolean;
  error: string | null;
}

/**
 * @param parameter  - "temperature" | "rainfall" | "humidity" | "wind"
 * @param wcsUrl     - GeoServer WCS endpoint (GEOSERVER_WEATHER_WCS)
 * @param geoJSON    - Uganda district FeatureCollection
 * @param layerName  - Optional: explicit WCS coverage name to fetch.
 *                     When provided, overrides the default layer for `parameter`
 *                     AND triggers a re-fetch whenever it changes (e.g. on slider move).
 *                     Pass the active raster layer name from the map to keep
 *                     district values in sync with the displayed frame.
 */
export function useRasterValue(
  parameter: string,
  wcsUrl: string,
  geoJSON: FeatureCollection | null,
  layerName?: string | null,
): UseRasterValueResult {
  const [values, setValues]   = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const param = parameter?.toLowerCase().trim();

    // Resolve which WCS layer to fetch:
    // 1. Explicit layerName prop (e.g. "temperature_2m", "gfs_temperature_2m")
    // 2. Default layer for the parameter
    const resolvedLayer = layerName?.trim() || PARAM_TO_LAYER[param];

    // Resolve which conversion to apply:
    // If an explicit layerName was given, detect its param type from the name
    const resolvedParam = layerName ? (detectParam(layerName) ?? param) : param;
    const convert = PARAM_CONVERT[resolvedParam];

    if (!resolvedLayer || !convert || !geoJSON?.features?.length || !wcsUrl) {
      setValues({});
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    fetchGrid(wcsUrl, resolvedLayer, controller.signal)
      .then((grid) => {
        if (controller.signal.aborted) return;

        const result: Record<string, number> = {};
        let sampled = 0;

        for (const feature of geoJSON.features) {
          const name = feature?.properties?.name as string | undefined;
          if (!name) continue;

          const centroid = featureCentroid(feature);
          if (!centroid) continue;

          const [lng, lat] = centroid;
          const raw = sampleGrid(lng, lat, grid);
          if (raw === null) continue;

          result[name.toLowerCase()] = convert(raw);
          sampled++;
        }

        console.log(
          `[useRasterValue] "${resolvedLayer}" → ${sampled} districts. ` +
          `Sample: ${Object.entries(result).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(", ")}`
        );

        setValues(result);
        setLoading(false);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        console.error(`[useRasterValue] FAILED "${resolvedLayer}":`, e.message);
        setError(e.message);
        setLoading(false);
      });

    return () => { controller.abort(); };
  }, [parameter, wcsUrl, geoJSON, layerName]); // re-runs when layerName changes

  return { values, loading, error };
}
