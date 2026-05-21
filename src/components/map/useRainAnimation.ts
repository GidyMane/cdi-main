import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import type { FeatureCollection, Feature, Polygon, MultiPolygon } from "geojson";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RainyDistrict {
  name: string;
  meanMm: number;
  rainyPct?: number;
  speedScale?: number;
  lineWidth?: number; // base stroke width — heavier rain gets thicker lines
}

interface RainDrop {
  len: number;
  speed: number;   // px/frame at 60 fps — scaled by delta-time
  opacity: number;
  angle: number;
  width: number;   // stroke width
}

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

interface RainZone {
  geometry: Polygon | MultiPolygon;
  r: number; g: number; b: number;
  drops: RainDrop[];
  normDrops: { nx: number; ny: number }[]; // normalised [0,1] positions
  _path: Path2D | null;   // cached clip path; null = needs rebuild after map move
  _bbox: Bbox | null;
}

// ── Colour ramp ───────────────────────────────────────────────────────────────

function rainColor(meanMm: number): [number, number, number] {
  if (meanMm >= 300) return [  3,  20,  58];
  if (meanMm >= 150) return [  8,  48, 107];
  if (meanMm >= 50)  return [ 33, 113, 181];
  if (meanMm >= 10)  return [107, 174, 214];
  return                    [198, 219, 239];
}

// ── GeoJSON → canvas helpers ──────────────────────────────────────────────────

function buildPath(geo: Polygon | MultiPolygon, map: L.Map): Path2D {
  const path = new Path2D();
  const addRing = (ring: number[][]) => {
    const pts = ring.map(([lo, la]) => map.latLngToContainerPoint(L.latLng(la, lo)));
    if (!pts.length) return;
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
  };
  if (geo.type === "Polygon") geo.coordinates.forEach(addRing);
  else geo.coordinates.forEach((p) => p.forEach(addRing));
  return path;
}

function buildBbox(geo: Polygon | MultiPolygon, map: L.Map): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const check = ([lo, la]: number[]) => {
    const p = map.latLngToContainerPoint(L.latLng(la, lo));
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  };
  if (geo.type === "Polygon") geo.coordinates[0]?.forEach(check);
  else geo.coordinates.forEach((p) => p[0]?.forEach(check));
  return { minX, minY, maxX, maxY };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRainAnimation(
  mapRef: React.RefObject<L.Map | null>,
  geoData: FeatureCollection | null | undefined,
) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const zonesRef   = useRef<RainZone[]>([]);
  const frameRef   = useRef<number | null>(null);
  const enabledRef = useRef(true);

  // ── District-name lookup ──────────────────────────────────────────────────
  const buildByName = useCallback(() => {
    const out: Record<string, Feature> = {};
    geoData?.features?.forEach((f) => {
      const p = f.properties ?? {};
      const n = (
        p.name ?? p.Name ?? p.NAME ??
        p.DNAME2019 ?? p.dname2019 ??
        p.district_name ?? p.DISTRICT ??
        p.ADM2_EN ?? p.adm2_en ?? ""
      ).toLowerCase().trim() as string;
      if (n) out[n] = f;
    });
    return out;
  }, [geoData]);

  // ── DPR-aware canvas sizing ───────────────────────────────────────────────
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

  // ── Invalidate path/bbox cache on map move or zoom ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const invalidate = () => {
      zonesRef.current.forEach((z) => { z._path = null; z._bbox = null; });
    };
    map.on("move zoom", invalidate);
    return () => { map.off("move zoom", invalidate); };
  }, [mapRef]);

  // ── Build zones ───────────────────────────────────────────────────────────
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
        const pct      = d.rainyPct ?? 60;
        const sScale   = d.speedScale ?? 1;
        const count    = Math.max(8, Math.round((pct / 100) * 90));

        const lw = d.lineWidth ?? 1;

        const normDrops = Array.from({ length: count }, () => ({
          nx: Math.random(),
          ny: Math.random(),           // scatter across visible area on init
        }));

        const drops: RainDrop[] = Array.from({ length: count }, () => ({
          len:     Math.random() * 10 + 8,              // 8–18 px — consistent streak length
          speed:   (Math.random() * 3 + 3.5) * sScale, // 3.5–6.5 px/frame
          opacity: Math.random() * 0.30 + 0.15,        // subtle: 0.15–0.45
          angle:   0.18 + (Math.random() - 0.5) * 0.06, // ~10° lean, very consistent
          width:   Math.max(0.3, lw + (Math.random() - 0.5) * 0.25),
        }));

        zones.push({ geometry: geo, r, g, b, drops, normDrops, _path: null, _bbox: null });
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

      // Delta-time normalised to 60 fps; cap at 2× after tab-hide
      const dt = lastTs > 0 ? Math.min((ts - lastTs) / 16.667, 2) : 1;
      lastTs = ts;

      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;

      // DPR transform so all draw calls use CSS-pixel coordinates
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);

      zonesRef.current.forEach((z) => {
        // Use cached bbox/path; rebuild only after map move/zoom
        if (!z._bbox) z._bbox = buildBbox(z.geometry, map);
        const bb = z._bbox;
        if (!isFinite(bb.minX) || bb.maxX <= bb.minX || bb.maxY <= bb.minY) return;
        if (!z._path) z._path = buildPath(z.geometry, map);

        const w = bb.maxX - bb.minX;
        const h = bb.maxY - bb.minY;

        ctx.save();
        ctx.clip(z._path, "evenodd");

        const { r, g, b, drops, normDrops } = z;

        for (let i = 0; i < drops.length; i++) {
          const d  = drops[i];
          const nd = normDrops[i];

          const px = bb.minX + nd.nx * w;
          const py = bb.minY + nd.ny * h;

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r},${g},${b},${d.opacity})`;
          ctx.lineWidth   = d.width;
          ctx.moveTo(px, py);
          ctx.lineTo(px + Math.sin(d.angle) * d.len, py + d.len);
          ctx.stroke();

          // Advance normalised position (scaled by delta-time)
          nd.ny += (d.speed / h) * dt;
          nd.nx += (Math.sin(d.angle) * d.speed * 0.35 / w) * dt;

          if (nd.ny > 1 + d.len / h) {
            nd.nx = Math.random();
            nd.ny = -(Math.random() * 0.5);
          }
          if (nd.nx < -0.05) nd.nx += 1.1;
          if (nd.nx > 1.05)  nd.nx -= 1.1;
        }

        ctx.restore();
      });

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [mapRef, syncSize]);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); }
    }
  }, []);

  const setEnabled = useCallback(
    (on: boolean) => {
      enabledRef.current = on;
      if (on && zonesRef.current.length) startAnimation();
      else stopAnimation();
    },
    [startAnimation, stopAnimation],
  );

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
      if (enabledRef.current && districts.length) startAnimation();
      else stopAnimation();
    },
    startAnimation,
    stopAnimation,
    setEnabled,
  };
}
