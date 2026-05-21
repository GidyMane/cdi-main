import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RainyDistrict {
  name: string;
  meanMm: number;
  rainyPct?: number;
  speedScale?: number; // 1 = normal, >1 = faster (heavy rain)
}

interface Drop {
  nx: number;
  ny: number;
  size: number;
  speed: number;
  opacity: number;
  angle: number;
}

type Bbox = { x0: number; y0: number; x1: number; y1: number };

interface RainZone {
  geometry: Polygon | MultiPolygon;
  r: number; g: number; b: number;
  layerDrops: [Drop[], Drop[], Drop[]]; // pre-sorted — no filter() per frame
  _path: Path2D | null;                  // cached; null means needs rebuild
  _bbox: Bbox | null;
}

// ── Layer definitions ─────────────────────────────────────────────────────────
// Three depth layers: background (slow, tiny) → foreground (fast, larger).
// Speeds are normalised-y per frame at 60 fps, scaled by delta-time.

const LAYERS = [
  { fraction: 0.45, speedBase: 0.032, speedVar: 0.008, sizeBase: 1.4, sizeVar: 0.5, opBase: 0.30, opVar: 0.10, angle: 0.06 },
  { fraction: 0.35, speedBase: 0.055, speedVar: 0.010, sizeBase: 2.2, sizeVar: 0.7, opBase: 0.52, opVar: 0.12, angle: 0.10 },
  { fraction: 0.20, speedBase: 0.082, speedVar: 0.014, sizeBase: 3.2, sizeVar: 1.0, opBase: 0.75, opVar: 0.15, angle: 0.14 },
] as const;

const BASE_DROPS = 130;

// ── Intensity colour ──────────────────────────────────────────────────────────

function rainColor(mm: number): [number, number, number] {
  if (mm >= 300) return [  8,  48, 107];
  if (mm >= 100) return [ 33, 113, 181];
  if (mm >= 50)  return [ 66, 146, 198];
  if (mm >= 25)  return [107, 174, 214];
  if (mm >= 10)  return [158, 202, 225];
  return                 [198, 219, 239];
}

// ── GeoJSON → canvas helpers (results are cached per zone) ────────────────────

function buildPath(geo: Polygon | MultiPolygon, map: L.Map): Path2D {
  const path = new Path2D();
  const ring = (pts: number[][]) => {
    const px = pts.map(([lo, la]) => map.latLngToContainerPoint(L.latLng(la, lo)));
    if (!px.length) return;
    path.moveTo(px[0].x, px[0].y);
    for (let i = 1; i < px.length; i++) path.lineTo(px[i].x, px[i].y);
    path.closePath();
  };
  if (geo.type === "Polygon") geo.coordinates.forEach(ring);
  else geo.coordinates.forEach((p) => p.forEach(ring));
  return path;
}

function buildBbox(geo: Polygon | MultiPolygon, map: L.Map): Bbox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const check = ([lo, la]: number[]) => {
    const p = map.latLngToContainerPoint(L.latLng(la, lo));
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  };
  if (geo.type === "Polygon") geo.coordinates[0]?.forEach(check);
  else geo.coordinates.forEach((p) => p[0]?.forEach(check));
  return { x0, y0, x1, y1 };
}

// ── Drop factory ──────────────────────────────────────────────────────────────

function newDrop(layer: typeof LAYERS[number], scatter: boolean, speedScale: number): Drop {
  const v = (b: number, s: number) => b + (Math.random() - 0.5) * s * 2;
  return {
    nx:      Math.random(),
    ny:      scatter ? Math.random() : -(Math.random() * 0.9),
    size:    Math.max(0.8, v(layer.sizeBase, layer.sizeVar)),
    speed:   Math.max(0.008, v(layer.speedBase, layer.speedVar)) * speedScale,
    opacity: Math.max(0.05, v(layer.opBase, layer.opVar)),
    angle:   (Math.random() - 0.5) * layer.angle * 2,
  };
}

// ── Draw a single raindrop ────────────────────────────────────────────────────
// Layer-aware: bg drops use a cheap solid fill to minimise gradient GC pressure.
// Mid drops get a gradient body only. Foreground drops get the full teardrop.

function drawDrop(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  d: Drop,
  r: number, g: number, b: number,
  li: number,
) {
  const s = d.size;
  const w = s * 0.38;
  const tailH = s * 1.85;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(d.angle);

  if (li === 0) {
    // Background — cheap pill shape, no gradient
    ctx.globalAlpha = d.opacity * 0.7;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.ellipse(0, -(tailH * 0.3), w * 0.55, s * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (li === 1) {
    // Mid — gradient body, no specular
    const grad = ctx.createLinearGradient(0, -tailH, 0, s * 0.5);
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.5, `rgba(${r},${g},${b},${d.opacity * 0.5})`);
    grad.addColorStop(1, `rgba(${r},${g},${b},${d.opacity})`);
    ctx.beginPath();
    ctx.moveTo(0, -tailH);
    ctx.bezierCurveTo( w * 0.5, -tailH * 0.3,  w,  s * 0.1, 0, s * 0.5);
    ctx.bezierCurveTo(-w,  s * 0.1, -w * 0.5, -tailH * 0.3, 0, -tailH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  } else {
    // Foreground — full teardrop with specular highlight
    const grad = ctx.createLinearGradient(0, -tailH, 0, s * 0.5);
    grad.addColorStop(0,   `rgba(${r},${g},${b},0)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},${d.opacity * 0.4})`);
    grad.addColorStop(1,   `rgba(${r},${g},${b},${d.opacity})`);
    ctx.beginPath();
    ctx.moveTo(0, -tailH);
    ctx.bezierCurveTo( w * 0.5, -tailH * 0.3,  w,  s * 0.1, 0, s * 0.5);
    ctx.bezierCurveTo(-w,  s * 0.1, -w * 0.5, -tailH * 0.3, 0, -tailH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Specular highlight
    const hx = -w * 0.18;
    const hy = -s * 0.04;
    const hGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, w * 0.44);
    hGrad.addColorStop(0, `rgba(255,255,255,${d.opacity * 0.55})`);
    hGrad.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.beginPath();
    ctx.ellipse(hx, hy, w * 0.44, s * 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = hGrad;
    ctx.fill();
  }

  ctx.restore();
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRainAnimation(
  mapRef: React.RefObject<L.Map | null>,
  geoData: FeatureCollection | null | undefined,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zonesRef  = useRef<RainZone[]>([]);
  const frameRef  = useRef<number | null>(null);

  const buildByName = useCallback(() => {
    const out: Record<string, Feature> = {};
    geoData?.features?.forEach((f) => {
      const p = f.properties ?? {};
      const n = (p.name ?? p.Name ?? p.NAME ?? p.district_name ?? "")
        .toLowerCase().trim() as string;
      if (n) out[n] = f;
    });
    return out;
  }, [geoData]);

  // DPR-aware canvas sizing
  const syncSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cw  = c.offsetWidth;
    const ch  = c.offsetHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width  = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
  }, []);

  // Invalidate cached path/bbox on map pan or zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const invalidate = () => {
      zonesRef.current.forEach((z) => { z._path = null; z._bbox = null; });
    };
    map.on("move zoom", invalidate);
    return () => { map.off("move zoom", invalidate); };
  }, [mapRef]);

  // Build zones from rainy-district list
  const setRainyDistricts = useCallback(
    (districts: RainyDistrict[]) => {
      if (!districts.length) { zonesRef.current = []; return; }
      const byName = buildByName();
      const zones: RainZone[] = [];

      districts.forEach((d) => {
        const feat = byName[d.name.toLowerCase().trim()];
        if (!feat) return;
        const geo = feat.geometry as Polygon | MultiPolygon;
        if (geo.type !== "Polygon" && geo.type !== "MultiPolygon") return;

        const [r, g, b] = rainColor(d.meanMm);
        const pct       = Math.max(0, Math.min(100, d.rainyPct ?? 50));
        const sScale    = d.speedScale ?? 1;
        const total     = Math.max(10, Math.round(BASE_DROPS * (pct / 100)));

        const layerDrops: [Drop[], Drop[], Drop[]] = [[], [], []];
        LAYERS.forEach((layer, li) => {
          const n = Math.round(total * layer.fraction);
          for (let i = 0; i < n; i++)
            layerDrops[li as 0 | 1 | 2].push(newDrop(layer, true, sScale));
        });

        zones.push({ geometry: geo, r, g, b, layerDrops, _path: null, _bbox: null });
      });

      zonesRef.current = zones;
    },
    [buildByName],
  );

  // ── Animation loop ────────────────────────────────────────────────────────
  const startAnimation = useCallback(() => {
    if (frameRef.current) return;
    syncSize();

    let lastTs = 0;

    const tick = (ts: number) => {
      const map    = mapRef.current;
      const canvas = canvasRef.current;
      if (!map || !canvas) { frameRef.current = requestAnimationFrame(tick); return; }

      syncSize();

      // Delta-time: normalise to 60 fps; cap to avoid jump when tab was hidden
      const dt = lastTs > 0 ? Math.min((ts - lastTs) / 16.667, 2) : 1;
      lastTs = ts;

      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      zonesRef.current.forEach((z) => {
        if (!z._bbox) z._bbox = buildBbox(z.geometry, map);
        const bb = z._bbox;
        if (!isFinite(bb.x0) || bb.x1 <= bb.x0 || bb.y1 <= bb.y0) return;
        if (!z._path) z._path = buildPath(z.geometry, map);

        const bw = bb.x1 - bb.x0;
        const bh = bb.y1 - bb.y0;

        ctx.save();
        ctx.clip(z._path, "evenodd");

        // Back-to-front (bg → mid → fg) for correct depth ordering
        for (let li = 0; li < 3; li++) {
          const drops = z.layerDrops[li as 0 | 1 | 2];
          for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            const px = bb.x0 + d.nx * bw;
            const py = bb.y0 + d.ny * bh;

            drawDrop(ctx, px, py, d, z.r, z.g, z.b, li);

            d.ny += d.speed * dt;
            d.nx += Math.sin(d.angle) * d.speed * 0.16 * dt;

            if (d.ny > 1 + (d.size * 3) / bh) {
              d.nx = Math.random();
              d.ny = -(Math.random() * 0.8);
            }
            if (d.nx < -0.05) d.nx += 1.1;
            if (d.nx > 1.05)  d.nx -= 1.1;
          }
        }

        ctx.restore();
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [mapRef, syncSize]);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
      }
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(syncSize);
    ro.observe(c);
    return () => ro.disconnect();
  }, [syncSize]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  return {
    canvasRef,
    setRainyDistricts: (districts: RainyDistrict[]) => {
      setRainyDistricts(districts);
      if (districts.length) startAnimation();
      else stopAnimation();
    },
    startAnimation,
    stopAnimation,
  };
}
