/**
 * useRainAnimation.ts — v5 (smooth, low-impact)
 *
 * Performance strategy:
 *  - Sprites: teardrops pre-rendered to ImageBitmap, reused every frame.
 *  - Mask canvas: district boundary pre-rendered to an OffscreenCanvas.
 *    Each frame draws drops onto a temp OffscreenCanvas, then composites
 *    with the mask using "destination-in" — no per-frame ctx.clip() on a
 *    complex Path2D.
 *  - SoA Float32Arrays: cache-friendly physics loop, no object allocation.
 *  - buildDropArrays runs in a microtask (setTimeout 0) so it doesn't block
 *    the main thread during pan/zoom.
 *  - refreshPositions is debounced (300ms) to avoid rebuilding on every
 *    intermediate pan event.
 *  - RAF throttled to 30fps.
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
const MAX_DROPS = 1000;
const MIN_DROPS = 5;
const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;
const UG_BBOX = "29.5,-1.6,35.2,4.3";
const SAMPLES_PER_DROP = 8;
const N_SPRITES = 12;
const REFRESH_DEBOUNCE_MS = 300;

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
  spriteIdx: Uint8Array;
}

interface Sprite {
  bitmap: ImageBitmap;
  w: number;
  h: number;
  bodyOffsetY: number;
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

function gridValueAt(lng: number, lat: number, grid: RainfallGrid): number {
  const { nx, ny, west, north, dx, dy } = grid.header;
  const col = Math.floor((lng - west) / dx);
  const row = Math.floor((north - lat) / dy);
  if (col < 0 || col >= nx || row < 0 || row >= ny) return 0;
  return grid.data[row * nx + col];
}

// ── Mask canvas — pre-rendered boundary fill ──────────────────────────────────
// Instead of ctx.clip(Path2D) every frame (expensive on complex polygons),
// we pre-render the district boundary as a filled white shape on an
// OffscreenCanvas. Each frame we draw drops onto a temp canvas, then
// composite with the mask using "destination-in" — only pixels inside the
// boundary survive. One compositing operation replaces N clip evaluations.

function buildMaskCanvas(
  boundary: FeatureCollection,
  map: L.Map,
  w: number,
  h: number,
): OffscreenCanvas {
  const oc = new OffscreenCanvas(w, h);
  const ctx = oc.getContext("2d")!;
  ctx.fillStyle = "#fff";

  const addRing = (ring: number[][]) => {
    if (!ring.length) return;
    ctx.beginPath();
    const p0 = map.latLngToContainerPoint(L.latLng(ring[0][1], ring[0][0]));
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ring.length; i++) {
      const p = map.latLngToContainerPoint(L.latLng(ring[i][1], ring[i][0]));
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  };

  for (const f of boundary.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") (g.coordinates as number[][][]).forEach(addRing);
    else if (g.type === "MultiPolygon")
      (g.coordinates as number[][][][]).forEach((p) => p.forEach(addRing));
  }
  return oc;
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

// ── Sprite cache ──────────────────────────────────────────────────────────────

let _spriteCache: Sprite[] | null = null;
export function invalidateSpriteCache() {
  _spriteCache = null;
}

async function getSprites(): Promise<Sprite[]> {
  if (_spriteCache) return _spriteCache;
  const sprites: Sprite[] = [];
  for (let s = 0; s < N_SPRITES; s++) {
    const bodyH = 4 + (s % 4) * 2;
    const opacity = 0.35 + (s % 3) * 0.15;
    const tailH = bodyH * 1.2;
    const bodyR = Math.max(2, bodyH * 0.28);
    const w = Math.ceil(bodyR * 2 + 4);
    const h = Math.ceil(bodyH + tailH + 4);
    const bodyOffsetY = Math.ceil(tailH + 2);
    const oc = new OffscreenCanvas(w, h);
    const ctx = oc.getContext("2d")!;
    const cx = w / 2;

    const tailGrad = ctx.createLinearGradient(cx, 2, cx, bodyOffsetY);
    tailGrad.addColorStop(0, `rgba(180,225,255,0)`);
    tailGrad.addColorStop(
      1,
      `rgba(200,235,255,${(opacity * 0.55).toFixed(2)})`,
    );
    ctx.beginPath();
    ctx.strokeStyle = tailGrad;
    ctx.lineWidth = 1.2;
    ctx.moveTo(cx, 2);
    ctx.lineTo(cx, bodyOffsetY);
    ctx.stroke();

    const tipX = cx,
      tipY = bodyOffsetY,
      midY = tipY + bodyH * 0.35,
      botY = tipY + bodyH;
    const grad = ctx.createRadialGradient(
      cx,
      tipY + bodyH * 0.55,
      0,
      cx,
      tipY + bodyH * 0.55,
      bodyR * 1.6,
    );
    grad.addColorStop(0, `rgba(240,250,255,${(opacity * 0.95).toFixed(2)})`);
    grad.addColorStop(0.4, `rgba(180,225,255,${(opacity * 0.75).toFixed(2)})`);
    grad.addColorStop(1, `rgba(140,200,255,0)`);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.bezierCurveTo(
      tipX - bodyR * 0.5,
      midY,
      cx - bodyR,
      botY - bodyH * 0.15,
      cx,
      botY,
    );
    ctx.bezierCurveTo(
      cx + bodyR,
      botY - bodyH * 0.15,
      tipX + bodyR * 0.5,
      midY,
      tipX,
      tipY,
    );
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      tipX - bodyR * 0.2,
      tipY + bodyH * 0.3,
      bodyR * 0.22,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(255,255,255,${(opacity * 0.5).toFixed(2)})`;
    ctx.fill();

    sprites.push({ bitmap: await createImageBitmap(oc), w, h, bodyOffsetY });
  }
  _spriteCache = sprites;
  return sprites;
}

// ── Drop builder ──────────────────────────────────────────────────────────────

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
    spriteIdx: new Uint8Array(0),
  };

  type DR = {
    feature: Feature;
    avgRain: number;
    bbox: [number, number, number, number];
    screenBbox: { minX: number; maxX: number; minY: number; maxY: number };
  };
  const rainyDistricts: DR[] = [];

  for (const feature of districts.features) {
    const bbox = featureBbox(feature);
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const dLng = (maxLng - minLng) / 6,
      dLat = (maxLat - minLat) / 6;
    let sum = 0,
      count = 0;
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++) {
        const lng = minLng + (c + 0.5) * dLng,
          lat = minLat + (r + 0.5) * dLat;
        if (!pointInFeature(lng, lat, feature)) continue;
        sum += gridValueAt(lng, lat, grid);
        count++;
      }
    const avgRain = count > 0 ? sum / count : 0;
    if (avgRain <= RAIN_THRESHOLD) continue;
    const nwPt = map.latLngToContainerPoint(L.latLng(maxLat, minLng));
    const sePt = map.latLngToContainerPoint(L.latLng(minLat, maxLng));
    const screenBbox = {
      minX: Math.min(nwPt.x, sePt.x),
      maxX: Math.max(nwPt.x, sePt.x),
      minY: Math.min(nwPt.y, sePt.y),
      maxY: Math.max(nwPt.y, sePt.y),
    };
    if (screenBbox.maxX < -80 || screenBbox.minX > canvasW + 80) continue;
    if (screenBbox.maxY < -80 || screenBbox.minY > canvasH + 80) continue;
    rainyDistricts.push({ feature, avgRain, bbox, screenBbox });
  }

  if (rainyDistricts.length === 0) return emptyResult;

  const totalRain = rainyDistricts.reduce((s, d) => s + d.avgRain, 0);
  const extraBudget = Math.max(
    0,
    MAX_DROPS - rainyDistricts.length * MIN_DROPS,
  );
  const allocations = rainyDistricts.map(
    (d) => MIN_DROPS + Math.round((d.avgRain / totalRain) * extraBudget),
  );
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
    spriteIdx: new Uint8Array(total),
  };

  let idx = 0;
  for (let di = 0; di < rainyDistricts.length; di++) {
    const { feature, bbox, screenBbox: sw } = rainyDistricts[di];
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const lngR = maxLng - minLng,
      latR = maxLat - minLat;
    for (let i = 0; i < allocations[di]; i++) {
      let px = 0,
        py = 0,
        found = false;
      for (let a = 0; a < SAMPLES_PER_DROP * 4; a++) {
        const lng = minLng + Math.random() * lngR;
        const lat = minLat + Math.random() * latR;
        if (!pointInFeature(lng, lat, feature)) continue;
        if (gridValueAt(lng, lat, grid) <= RAIN_THRESHOLD) continue;
        const pt = map.latLngToContainerPoint(L.latLng(lat, lng));
        px = pt.x;
        py = pt.y;
        found = true;
        break;
      }
      if (!found) continue;
      d.x[idx] = px;
      d.y[idx] = py;
      d.speed[idx] = 3.0 + Math.random() * 2.0;
      d.length[idx] = 6 + Math.random() * 5;
      d.drift[idx] = -0.2 + Math.random() * 0.4;
      d.opacity[idx] = 0.25 + Math.random() * 0.3;
      d.minX[idx] = sw.minX;
      d.maxX[idx] = sw.maxX;
      d.minY[idx] = sw.minY;
      d.maxY[idx] = sw.maxY;
      d.spriteIdx[idx] = Math.floor(Math.random() * N_SPRITES);
      idx++;
    }
  }
  d.count = idx;
  console.log(
    `[RainAnimation] ${idx} drops across ${rainyDistricts.length} rainy districts`,
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
  const spritesRef = useRef<Sprite[] | null>(null);
  const rafRef = useRef<number | null>(null);
  // Mask canvas — pre-rendered boundary, rebuilt on resize/zoom
  const maskRef = useRef<OffscreenCanvas | null>(null);
  // Temp canvas for compositing drops before masking
  const tempRef = useRef<OffscreenCanvas | null>(null);
  const lastFrameRef = useRef<number>(0);
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  districtRef.current = districtGeoJSON;

  useEffect(() => {
    getSprites()
      .then((s) => {
        spritesRef.current = s;
      })
      .catch(() => {});
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current,
      map = mapRef.current;
    if (!canvas || !map) return;
    const c = map.getContainer();
    canvas.width = c.clientWidth;
    canvas.height = c.clientHeight;
  }, [canvasRef, mapRef]);

  // Rebuild the mask OffscreenCanvas from the boundary
  const rebuildMask = useCallback(() => {
    const canvas = canvasRef.current,
      map = mapRef.current;
    if (!canvas || !map) {
      maskRef.current = null;
      return;
    }
    const boundary = districtRef.current || boundaryRef.current;
    if (!boundary) {
      maskRef.current = null;
      return;
    }
    maskRef.current = buildMaskCanvas(
      boundary,
      map,
      canvas.width,
      canvas.height,
    );
    // Resize temp canvas to match
    if (
      !tempRef.current ||
      tempRef.current.width !== canvas.width ||
      tempRef.current.height !== canvas.height
    ) {
      tempRef.current = new OffscreenCanvas(canvas.width, canvas.height);
    }
  }, [canvasRef, mapRef]);

  // Debounced refresh — rebuilds drops + mask after pan/zoom settles
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      resizeCanvas();
      // Rebuild drops in a macrotask so it doesn't block the current frame
      setTimeout(() => {
        const canvas = canvasRef.current,
          map = mapRef.current;
        const grid = gridRef.current,
          districts = districtRef.current;
        if (canvas && map && grid && districts) {
          dropsRef.current = buildDropArrays(
            grid,
            districts,
            map,
            canvas.width,
            canvas.height,
          );
        }
        rebuildMask();
      }, 0);
    }, REFRESH_DEBOUNCE_MS);
  }, [resizeCanvas, rebuildMask, canvasRef, mapRef]);

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

      const d = dropsRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!d || d.count === 0) return;

      // ── Physics: advance drops (pure typed-array math, no allocation) ──
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

      const sprites = spritesRef.current;
      const mask = maskRef.current;
      const temp = tempRef.current;

      if (sprites && mask && temp) {
        // ── Draw drops onto temp canvas ────────────────────────────────────
        const tctx = temp.getContext("2d")!;
        tctx.clearRect(0, 0, temp.width, temp.height);
        for (let i = 0; i < d.count; i++) {
          const sp = sprites[d.spriteIdx[i]];
          tctx.drawImage(
            sp.bitmap,
            (d.x[i] - sp.w / 2) | 0,
            (d.y[i] - sp.bodyOffsetY) | 0,
          );
        }
        // ── Apply mask: keep only pixels inside boundary ───────────────────
        // "destination-in" keeps temp pixels where mask is non-transparent.
        tctx.globalCompositeOperation = "destination-in";
        tctx.drawImage(mask, 0, 0);
        tctx.globalCompositeOperation = "source-over";
        // ── Blit masked result to visible canvas ───────────────────────────
        ctx.drawImage(temp, 0, 0);
      } else if (sprites) {
        // Mask not ready yet — draw unclipped (brief flash on first load)
        for (let i = 0; i < d.count; i++) {
          const sp = sprites[d.spriteIdx[i]];
          ctx.drawImage(
            sp.bitmap,
            (d.x[i] - sp.w / 2) | 0,
            (d.y[i] - sp.bodyOffsetY) | 0,
          );
        }
      } else {
        // Sprites not ready — simple line fallback
        ctx.strokeStyle = "rgba(190,230,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < d.count; i++) {
          ctx.moveTo(d.x[i], d.y[i]);
          ctx.lineTo(
            d.x[i] + d.drift[i],
            Math.min(d.y[i] + d.length[i], d.maxY[i]),
          );
        }
        ctx.stroke();
      }
    };
    rafRef.current = requestAnimationFrame(frame);
  }, [canvasRef, resizeCanvas]);

  // Main effect
  useEffect(() => {
    if (!isRainParam || !layerName || !rasterReady) {
      stopLoop();
      if (!isRainParam || !layerName) {
        gridRef.current = null;
        dropsRef.current = null;
        maskRef.current = null;
        tempRef.current = null;
        setCursorRainValue(null);
      }
      return;
    }
    let cancelled = false;
    fetchUgandaBoundary()
      .then((b) => {
        if (!cancelled) {
          boundaryRef.current = b;
        }
      })
      .catch((e) => console.warn("[RainAnimation] boundary:", e.message));
    fetchAndParseGrid(wcsUrl, layerName)
      .then((grid) => {
        if (cancelled) return;
        gridRef.current = grid;
        resizeCanvas();
        // Build drops in a macrotask — doesn't block the current render
        setTimeout(() => {
          if (cancelled) return;
          const canvas = canvasRef.current,
            map = mapRef.current;
          const districts = districtRef.current;
          if (canvas && map && districts) {
            dropsRef.current = buildDropArrays(
              grid,
              districts,
              map,
              canvas.width,
              canvas.height,
            );
          }
          rebuildMask();
          startLoop();
        }, 0);
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

  // Map move/zoom — debounced refresh
  useEffect(() => {
    function attach(m: L.Map) {
      m.on("moveend", scheduleRefresh);
      m.on("zoomend", scheduleRefresh);
      return () => {
        m.off("moveend", scheduleRefresh);
        m.off("zoomend", scheduleRefresh);
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

  // Cursor GetFeatureInfo
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
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [stopLoop],
  );

  return { cursorRainValue, handleMouseMove, resizeCanvas };
}
