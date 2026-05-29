/**
 * useRainAnimation.ts — v4
 *
 * Drop placement strategy:
 *   Instead of placing drops only at WCS grid cell centers (which misses small
 *   districts), we iterate every district polygon, sample random points inside
 *   it, look up the rainfall value at each point from the grid, and place drops
 *   proportional to intensity. Every district with any rain gets drops.
 *
 * Data structures:
 *   SoA Float32Arrays for cache-efficient per-frame updates.
 *   Clip path cached as Path2D, rebuilt only on moveend/zoomend.
 *   Frame rate throttled to 30fps.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
} from "geojson";
import { fromArrayBuffer } from "geotiff";
import { fetchUgandaBoundary } from "./clippedWmsLayer";

// ── Tuning ────────────────────────────────────────────────────────────────────

const RAIN_THRESHOLD = 0.1;
const NODATA_MAX = 10_000;
const MAX_DROPS = 1200;
const MIN_DROPS = 3; // minimum drops per rainy district
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const OPACITY_BUCKETS = 4;
const UG_BBOX = "29.5,-1.6,35.2,4.3";
const SAMPLES_PER_DROP = 8; // random point attempts per drop slot

// ── Types ─────────────────────────────────────────────────────────────────────

interface RainfallHeader {
  nx: number;
  ny: number;
  west: number;
  east: number;
  south: number;
  north: number;
  dx: number;
  dy: number;
}
interface RainfallGrid {
  header: RainfallHeader;
  data: Float32Array;
}

interface DropArrays {
  count: number;
  x: Float32Array;
  y: Float32Array;
  speed: Float32Array;
  length: Float32Array;
  drift: Float32Array;
  opacity: Float32Array;
  minX: Float32Array;
  maxX: Float32Array;
  minY: Float32Array;
  maxY: Float32Array;
}

export interface UseRainAnimationOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  mapRef: React.RefObject<L.Map | null>;
  layerName: string | null;
  wcsUrl: string;
  wmsUrl: string;
  isRainParam: boolean;
  rasterReady: boolean;
  districtGeoJSON: FeatureCollection | null;
}

// ── Geometry helpers ──────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon for a single ring [lng,lat][] */
function pointInRing(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

/** Point-in-polygon for Polygon or MultiPolygon feature */
function pointInFeature(lng: number, lat: number, feature: Feature): boolean {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") {
    const rings = (g as Polygon).coordinates;
    if (!pointInRing(lng, lat, rings[0])) return false;
    for (let h = 1; h < rings.length; h++)
      if (pointInRing(lng, lat, rings[h])) return false;
    return true;
  }
  if (g.type === "MultiPolygon") {
    for (const poly of (g as MultiPolygon).coordinates) {
      if (!pointInRing(lng, lat, poly[0])) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++)
        if (pointInRing(lng, lat, poly[h])) {
          inHole = true;
          break;
        }
      if (!inHole) return true;
    }
  }
  return false;
}

/** Bounding box of a feature's geometry */
function featureBbox(feature: Feature): [number, number, number, number] {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  const visit = (coords: any) => {
    if (typeof coords[0] === "number") {
      if (coords[0] < minLng) minLng = coords[0];
      if (coords[0] > maxLng) maxLng = coords[0];
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
    } else coords.forEach(visit);
  };
  visit((feature.geometry as any).coordinates);
  return [minLng, minLat, maxLng, maxLat];
}

// ── Grid lookup ───────────────────────────────────────────────────────────────

function gridValueAt(lng: number, lat: number, grid: RainfallGrid): number {
  const { nx, ny, west, north, dx, dy } = grid.header;
  const col = Math.floor((lng - west) / dx);
  const row = Math.floor((north - lat) / dy);
  if (col < 0 || col >= nx || row < 0 || row >= ny) return 0;
  return grid.data[row * nx + col];
}

// ── Clip path ─────────────────────────────────────────────────────────────────

function buildCanvasClipPath(boundary: FeatureCollection, map: L.Map): Path2D {
  const path = new Path2D();
  const addRing = (ring: number[][]) => {
    if (!ring.length) return;
    const p0 = map.latLngToContainerPoint(L.latLng(ring[0][1], ring[0][0]));
    path.moveTo(p0.x, p0.y);
    for (let i = 1; i < ring.length; i++) {
      const p = map.latLngToContainerPoint(L.latLng(ring[i][1], ring[i][0]));
      path.lineTo(p.x, p.y);
    }
    path.closePath();
  };
  for (const f of boundary.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") (g.coordinates as number[][][]).forEach(addRing);
    else if (g.type === "MultiPolygon")
      (g.coordinates as number[][][][]).forEach((p) => p.forEach(addRing));
  }
  return path;
}

// ── GeoTIFF fetch ─────────────────────────────────────────────────────────────

async function fetchAndParseGrid(
  wcsUrl: string,
  layerName: string,
): Promise<RainfallGrid> {
  const params = new URLSearchParams({
    service: "WCS",
    version: "1.0.0",
    request: "GetCoverage",
    coverage: layerName,
    crs: "EPSG:4326",
    bbox: UG_BBOX,
    width: "62",
    height: "64",
    format: "GeoTIFF",
  });
  const res = await fetch(`${wcsUrl}?${params}`);
  if (!res.ok) throw new Error(`WCS ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("xml") || ct.includes("text/plain")) {
    const text = await res.text();
    const m = text.match(
      /<(?:ows:)?ExceptionText>(.*?)<\/(?:ows:)?ExceptionText>/s,
    );
    throw new Error(m ? m[1].trim() : "GeoServer WCS error");
  }
  const buffer = await res.arrayBuffer();
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const rasters = await image.readRasters();
  const raw = rasters[0] as ArrayLike<number>;
  const bbox = image.getBoundingBox();
  const nx = image.getWidth(),
    ny = image.getHeight();
  const [west, south, east, north] = bbox;
  const fileDir = (image as any).fileDirectory;
  const nodata =
    fileDir?.GDAL_NODATA != null ? parseFloat(fileDir.GDAL_NODATA) : null;
  const data = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = (raw as any)[i] as number;
    data[i] =
      (nodata !== null && v === nodata) || isNaN(v) || v < 0 || v > NODATA_MAX
        ? 0
        : Math.round(v * 100) / 100;
  }
  return {
    header: {
      nx,
      ny,
      west,
      east,
      south,
      north,
      dx: (east - west) / nx,
      dy: (north - south) / ny,
    },
    data,
  };
}

// ── Drop builder — district-first approach ────────────────────────────────────
// For each district, sample random points inside it, look up rainfall from
// the grid, and allocate drops proportional to average intensity.
// This guarantees every rainy district gets drops regardless of grid resolution.

function buildDropArrays(
  grid: RainfallGrid,
  districts: FeatureCollection,
  map: L.Map,
  canvasW: number,
  canvasH: number,
): DropArrays {
  const empty = new Float32Array(0);
  const emptyResult: DropArrays = {
    count: 0,
    x: empty,
    y: empty,
    speed: empty,
    length: empty,
    drift: empty,
    opacity: empty,
    minX: empty,
    maxX: empty,
    minY: empty,
    maxY: empty,
  };

  // Pass 1: for each district, compute average rainfall by sampling grid cells
  type DistrictRain = {
    feature: Feature;
    avgRain: number;
    bbox: [number, number, number, number];
    screenBbox: { minX: number; maxX: number; minY: number; maxY: number };
  };
  const rainyDistricts: DistrictRain[] = [];

  for (const feature of districts.features) {
    const bbox = featureBbox(feature);
    const [minLng, minLat, maxLng, maxLat] = bbox;

    // Sample a grid of points inside the district bbox
    const SAMPLE_COLS = 6,
      SAMPLE_ROWS = 6;
    const dLng = (maxLng - minLng) / SAMPLE_COLS;
    const dLat = (maxLat - minLat) / SAMPLE_ROWS;
    let sum = 0,
      count = 0;

    for (let r = 0; r < SAMPLE_ROWS; r++) {
      for (let c = 0; c < SAMPLE_COLS; c++) {
        const lng = minLng + (c + 0.5) * dLng;
        const lat = minLat + (r + 0.5) * dLat;
        if (!pointInFeature(lng, lat, feature)) continue;
        const v = gridValueAt(lng, lat, grid);
        sum += v;
        count++;
      }
    }

    const avgRain = count > 0 ? sum / count : 0;
    if (avgRain <= RAIN_THRESHOLD) continue;

    // Screen bbox of this district
    const nwPt = map.latLngToContainerPoint(L.latLng(maxLat, minLng));
    const sePt = map.latLngToContainerPoint(L.latLng(minLat, maxLng));
    const screenBbox = {
      minX: Math.min(nwPt.x, sePt.x),
      maxX: Math.max(nwPt.x, sePt.x),
      minY: Math.min(nwPt.y, sePt.y),
      maxY: Math.max(nwPt.y, sePt.y),
    };

    // Skip if entirely off-screen
    if (screenBbox.maxX < -80 || screenBbox.minX > canvasW + 80) continue;
    if (screenBbox.maxY < -80 || screenBbox.minY > canvasH + 80) continue;

    rainyDistricts.push({ feature, avgRain, bbox, screenBbox });
  }

  if (rainyDistricts.length === 0) return emptyResult;

  // Pass 2: allocate drops — MIN_DROPS guaranteed + proportional extra
  const totalRain = rainyDistricts.reduce((s, d) => s + d.avgRain, 0);
  const extraBudget = Math.max(
    0,
    MAX_DROPS - rainyDistricts.length * MIN_DROPS,
  );
  const allocations = rainyDistricts.map(
    (d) => MIN_DROPS + Math.round((d.avgRain / totalRain) * extraBudget),
  );
  // Clamp total
  let total = allocations.reduce((s, a) => s + a, 0);
  if (total > MAX_DROPS) {
    let excess = total - MAX_DROPS;
    for (let i = allocations.length - 1; i >= 0 && excess > 0; i--) {
      const trim = Math.min(excess, allocations[i] - MIN_DROPS);
      allocations[i] -= trim;
      excess -= trim;
    }
    total = allocations.reduce((s, a) => s + a, 0);
  }

  // Pass 3: place drops by sampling random points inside each district polygon
  const d: DropArrays = {
    count: total,
    x: new Float32Array(total),
    y: new Float32Array(total),
    speed: new Float32Array(total),
    length: new Float32Array(total),
    drift: new Float32Array(total),
    opacity: new Float32Array(total),
    minX: new Float32Array(total),
    maxX: new Float32Array(total),
    minY: new Float32Array(total),
    maxY: new Float32Array(total),
  };

  let idx = 0;
  for (let di = 0; di < rainyDistricts.length; di++) {
    const { feature, bbox, screenBbox } = rainyDistricts[di];
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const lngRange = maxLng - minLng;
    const latRange = maxLat - minLat;
    const sw = screenBbox;

    for (let i = 0; i < allocations[di]; i++, idx++) {
      // Find a random point inside the polygon
      let px = 0,
        py = 0,
        found = false;
      for (let attempt = 0; attempt < SAMPLES_PER_DROP; attempt++) {
        const lng = minLng + Math.random() * lngRange;
        const lat = minLat + Math.random() * latRange;
        if (pointInFeature(lng, lat, feature)) {
          const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
          px = pt.x;
          py = pt.y;
          found = true;
          break;
        }
      }
      // Fallback: use screen bbox center with jitter
      if (!found) {
        px = sw.minX + Math.random() * (sw.maxX - sw.minX);
        py = sw.minY + Math.random() * (sw.maxY - sw.minY);
      }

      d.x[idx] = px;
      d.y[idx] = py;
      d.speed[idx] = 1.8 + Math.random() * 1.2;
      d.length[idx] = 8 + Math.random() * 6;
      d.drift[idx] = -0.2 + Math.random() * 0.4;
      d.opacity[idx] = 0.25 + Math.random() * 0.3;
      d.minX[idx] = sw.minX;
      d.maxX[idx] = sw.maxX;
      d.minY[idx] = sw.minY;
      d.maxY[idx] = sw.maxY;
    }
  }

  console.log(
    `[RainAnimation] ${total} drops across ${rainyDistricts.length} rainy districts`,
  );
  return d;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRainAnimation({
  canvasRef,
  mapRef,
  layerName,
  wcsUrl,
  wmsUrl,
  isRainParam,
  rasterReady,
  districtGeoJSON,
}: UseRainAnimationOptions) {
  const [cursorRainValue, setCursorRainValue] = useState<string | null>(null);

  const gridRef = useRef<RainfallGrid | null>(null);
  const boundaryRef = useRef<FeatureCollection | null>(null);
  const districtRef = useRef<FeatureCollection | null>(null);
  const dropsRef = useRef<DropArrays | null>(null);
  const rafRef = useRef<number | null>(null);
  const clipPathRef = useRef<Path2D | null>(null);
  const lastFrameRef = useRef<number>(0);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  districtRef.current = districtGeoJSON;

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current,
      map = mapRef.current;
    if (!canvas || !map) return;
    const c = map.getContainer();
    canvas.width = c.clientWidth;
    canvas.height = c.clientHeight;
  }, [canvasRef, mapRef]);

  const rebuildClipPath = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      clipPathRef.current = null;
      return;
    }
    const boundary = districtRef.current || boundaryRef.current;
    clipPathRef.current = boundary ? buildCanvasClipPath(boundary, map) : null;
  }, [mapRef]);

  const buildDrops = useCallback(() => {
    const canvas = canvasRef.current,
      map = mapRef.current,
      grid = gridRef.current;
    const districts = districtRef.current;
    if (!canvas || !map || !grid || !districts) {
      dropsRef.current = null;
      return;
    }
    dropsRef.current = buildDropArrays(
      grid,
      districts,
      map,
      canvas.width,
      canvas.height,
    );
  }, [canvasRef, mapRef]);

  const refreshPositions = useCallback(() => {
    resizeCanvas();
    buildDrops();
    rebuildClipPath();
  }, [resizeCanvas, buildDrops, rebuildClipPath]);

  const stopLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas)
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, [canvasRef]);

  const startLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    resizeCanvas();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      if (ts - lastFrameRef.current < FRAME_MS) return;
      lastFrameRef.current = ts;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const d = dropsRef.current;
      if (!d || d.count === 0) return;

      ctx.save();
      if (clipPathRef.current) ctx.clip(clipPathRef.current);

      // Advance all drops
      for (let i = 0; i < d.count; i++) {
        d.y[i] += d.speed[i];
        d.x[i] += d.drift[i] * 0.25;
        if (d.x[i] < d.minX[i]) d.x[i] = d.minX[i];
        if (d.x[i] > d.maxX[i]) d.x[i] = d.maxX[i];
        if (d.y[i] >= d.maxY[i] - d.length[i]) {
          d.x[i] = d.minX[i] + Math.random() * (d.maxX[i] - d.minX[i]);
          d.y[i] = d.minY[i] + Math.random() * 8;
        }
      }

      // Batch draw by opacity bucket
      for (let b = 0; b < OPACITY_BUCKETS; b++) {
        const lo = b / OPACITY_BUCKETS,
          hi = (b + 1) / OPACITY_BUCKETS;
        const mid = (lo + hi) / 2;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(190,230,255,${mid.toFixed(2)})`;
        ctx.lineWidth = 1.0;
        for (let i = 0; i < d.count; i++) {
          if (d.opacity[i] < lo || d.opacity[i] >= hi) continue;
          const tailY = Math.min(d.y[i] + d.length[i], d.maxY[i]);
          ctx.moveTo(d.x[i], d.y[i]);
          ctx.lineTo(d.x[i] + d.drift[i], tailY);
        }
        ctx.stroke();
      }
      ctx.restore();
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [canvasRef, resizeCanvas]);

  useEffect(() => {
    if (!isRainParam || !layerName || !rasterReady) {
      stopLoop();
      if (!isRainParam || !layerName) {
        gridRef.current = null;
        dropsRef.current = null;
        clipPathRef.current = null;
        setCursorRainValue(null);
      }
      return;
    }
    let cancelled = false;
    fetchUgandaBoundary()
      .then((b) => {
        if (!cancelled) {
          boundaryRef.current = b;
          rebuildClipPath();
        }
      })
      .catch((e) => console.warn("[RainAnimation] boundary:", e.message));
    fetchAndParseGrid(wcsUrl, layerName)
      .then((grid) => {
        if (cancelled) return;
        gridRef.current = grid;
        resizeCanvas();
        buildDrops();
        rebuildClipPath();
        startLoop();
      })
      .catch((e) => {
        if (!cancelled) {
          console.warn("[RainAnimation] WCS:", e.message);
          resizeCanvas();
          startLoop();
        }
      });
    return () => {
      cancelled = true;
      stopLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerName, isRainParam, wcsUrl, rasterReady]);

  useEffect(() => {
    function attach(m: L.Map) {
      m.on("moveend", refreshPositions);
      m.on("zoomend", refreshPositions);
      return () => {
        m.off("moveend", refreshPositions);
        m.off("zoomend", refreshPositions);
      };
    }
    const map = mapRef.current;
    if (map) return attach(map);
    const iv = setInterval(() => {
      const m = mapRef.current;
      if (!m) return;
      clearInterval(iv);
      attach(m);
    }, 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = useCallback(
    (latlng: L.LatLng) => {
      if (!isRainParam || !layerName) {
        setCursorRainValue(null);
        return;
      }
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
      cursorTimer.current = setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        const point = map.latLngToContainerPoint(latlng);
        const size = map.getSize(),
          bounds = map.getBounds();
        const sw = bounds.getSouthWest(),
          ne = bounds.getNorthEast();
        const params = new URLSearchParams({
          service: "WMS",
          version: "1.1.1",
          request: "GetFeatureInfo",
          layers: layerName,
          query_layers: layerName,
          styles: "precipitation_style",
          bbox: `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`,
          width: String(size.x),
          height: String(size.y),
          srs: "EPSG:4326",
          x: String(Math.round(point.x)),
          y: String(Math.round(point.y)),
          info_format: "application/json",
          feature_count: "1",
        });
        fetch(`${wmsUrl}?${params}`)
          .then((r) => r.text())
          .then((text) => {
            let value: number | null = null;
            if (
              !text.includes("ServiceException") &&
              !text.includes("ExceptionReport")
            ) {
              try {
                const json = JSON.parse(text),
                  props = json.features?.[0]?.properties ?? {};
                const keys = [
                  "GRAY_INDEX",
                  "Band1",
                  "Band_1",
                  "band1",
                  "value",
                  "VALUE",
                  "RASTERVALU",
                  "rainfall_mm",
                ];
                for (const k of keys) {
                  if (props[k] != null && !isNaN(Number(props[k]))) {
                    value = Number(props[k]);
                    break;
                  }
                }
                if (value === null)
                  for (const k in props) {
                    if (!isNaN(Number(props[k]))) {
                      value = Number(props[k]);
                      break;
                    }
                  }
              } catch (_) {}
            }
            setCursorRainValue(
              value !== null ? `${value.toFixed(2)} mm/day` : null,
            );
          })
          .catch(() => setCursorRainValue(null));
      }, 120);
    },
    [isRainParam, layerName, wmsUrl, mapRef],
  );

  useEffect(
    () => () => {
      stopLoop();
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    },
    [stopLoop],
  );

  return { cursorRainValue, handleMouseMove, resizeCanvas };
}
