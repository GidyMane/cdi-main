import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import type { FeatureCollection } from "geojson";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WindComponent {
  header: {
    Ni: number;
    Nj: number;
    longitudeOfFirstGridPointInDegrees: number;
    latitudeOfFirstGridPointInDegrees: number;  // max lat (top)
    longitudeOfLastGridPointInDegrees: number;
    latitudeOfLastGridPointInDegrees: number;   // min lat (bottom)
  };
  data: number[];
}

interface WindField {
  uDat: number[];
  vDat: number[];
  lo1: number; la1: number;   // top-left corner
  lo2: number; la2: number;   // bottom-right corner
  nx: number;  ny: number;
  dx: number;  dy: number;
}

interface WindParticle {
  /** Normalised position [0,1] within the wind field's lon/lat bounding box */
  nLon: number;
  nLat: number;
  /** Current geographic position (derived from nLon/nLat each frame) */
  lon: number;
  lat: number;
  age: number;
  maxAge: number;
  speed: number;
  phase: number;
}

// ── Colour ramp ───────────────────────────────────────────────────────────────

function windColorBase(speed: number): string {
  if (speed >= 7) return "rgba(255,238,153,";
  if (speed >= 5) return "rgba(126,240,255,";
  if (speed >= 3) return "rgba(79,196,255,";
  if (speed >= 1) return "rgba(137,226,255,";
  return                  "rgba(210,245,255,";
}

// ── Bilinear interpolation ────────────────────────────────────────────────────

function interpWind(dat: number[], lon: number, lat: number, field: WindField): number {
  const { lo1, la1, nx, ny, dx, dy } = field;
  const ci = (lon - lo1) / dx;
  const ri = (la1 - lat) / dy;
  const c0 = Math.floor(ci), c1 = Math.min(c0 + 1, nx - 1);
  const r0 = Math.floor(ri), r1 = Math.min(r0 + 1, ny - 1);
  if (c0 < 0 || r0 < 0 || c0 >= nx || r0 >= ny) return 0;
  const fc = ci - c0, fr = ri - r0;
  const idx = (r: number, c: number) => r * nx + c;
  const v00 = dat[idx(r0, c0)], v10 = dat[idx(r1, c0)];
  const v01 = dat[idx(r0, c1)], v11 = dat[idx(r1, c1)];
  if (v00 == null || v10 == null || v01 == null || v11 == null) return 0;
  return v00*(1-fc)*(1-fr) + v01*fc*(1-fr) + v10*(1-fc)*fr + v11*fc*fr;
}

// ── Coordinate helper ─────────────────────────────────────────────────────────

function lonLatToPixel(lon: number, lat: number, map: L.Map): L.Point {
  return map.latLngToContainerPoint(L.latLng(lat, lon));
}

// ── Uganda boundary clip path (rebuilt every frame from current map view) ─────

function buildUgandaClipPath(geoData: FeatureCollection, map: L.Map): Path2D {
  const path = new Path2D();

  geoData.features.forEach((f) => {
    const g = f.geometry;
    if (!g) return;

    const addRing = (ring: number[][]) => {
      if (!ring.length) return;
      const first = lonLatToPixel(ring[0][0], ring[0][1], map);
      path.moveTo(first.x, first.y);
      for (let i = 1; i < ring.length; i++) {
        const pt = lonLatToPixel(ring[i][0], ring[i][1], map);
        path.lineTo(pt.x, pt.y);
      }
      path.closePath();
    };

    if (g.type === "Polygon") {
      (g.coordinates as number[][][]).forEach(addRing);
    } else if (g.type === "MultiPolygon") {
      (g.coordinates as number[][][][]).forEach((poly) => poly.forEach(addRing));
    }
  });

  return path;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useWindAnimation
 *
 * Renders animated wind-particle streaks on a <canvas> overlay above a Leaflet
 * map, clipped to the Uganda boundary. Particles stay locked to the map on
 * pan and zoom because positions are reprojected from geographic coordinates
 * every frame.
 *
 * Usage:
 *   const { canvasRef: windCanvasRef, loadWindField, clearWindField } =
 *     useWindAnimation(weatherforcastMapRef, geoData);
 *
 * Render:
 *   <canvas ref={windCanvasRef}
 *           className="absolute inset-0 w-full h-full pointer-events-none"
 *           style={{ zIndex: 451 }} />
 *
 * @param mapRef   - ref to the Leaflet map instance
 * @param geoData  - FeatureCollection with district polygons (for clip path)
 */
export function useWindAnimation(
  mapRef: React.RefObject<L.Map | null>,
  geoData: FeatureCollection | null | undefined,
) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const frameRef     = useRef<number | null>(null);
  const fieldRef     = useRef<WindField | null>(null);
  const particlesRef = useRef<WindParticle[]>([]);
  const enabledRef   = useRef(true);

  // ── Sync canvas pixel buffer to its CSS size ──────────────────────────────
  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { offsetWidth: w, offsetHeight: h } = canvas;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width  = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
  }, []);

  // ── Particle factory — stores normalised geo position ─────────────────────
  const newParticle = useCallback((): WindParticle => {
    const field = fieldRef.current;
    if (!field) return { nLon: 0, nLat: 0, lon: 0, lat: 0, age: 0, maxAge: 90, speed: 0, phase: 0 };
    const nLon = Math.random();
    const nLat = Math.random();
    const lon  = field.lo1 + nLon * (field.lo2 - field.lo1);
    const lat  = field.la2 + nLat * (field.la1 - field.la2);
    return {
      nLon, nLat, lon, lat,
      age:    Math.floor(Math.random() * 60),
      maxAge: 70 + Math.floor(Math.random() * 100),
      speed:  0,
      phase: Math.random() * Math.PI * 2,
    };
  }, []);

  const resetParticle = useCallback((p: WindParticle) => {
    const field = fieldRef.current;
    if (!field) return;
    p.nLon   = Math.random();
    p.nLat   = Math.random();
    p.lon    = field.lo1 + p.nLon * (field.lo2 - field.lo1);
    p.lat    = field.la2 + p.nLat * (field.la1 - field.la2);
    p.age    = 0;
    p.maxAge = 70 + Math.floor(Math.random() * 100);
    p.phase  = Math.random() * Math.PI * 2;
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const startAnimation = useCallback(() => {
    if (frameRef.current) return; // already running

    // Sync canvas size immediately before the first frame
    syncCanvasSize();

    const tick = () => {
      const canvas = canvasRef.current;
      const map    = mapRef.current;
      if (!canvas || !map) { frameRef.current = requestAnimationFrame(tick); return; }

      // Keep canvas pixel buffer in sync every frame
      syncCanvasSize();

      const field = fieldRef.current;
      if (!field) { frameRef.current = requestAnimationFrame(tick); return; }

      const ctx = canvas.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.offsetWidth;
      const cssHeight = canvas.offsetHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Rebuild clip path every frame so it tracks pan/zoom
      const clipPath = geoData ? buildUgandaClipPath(geoData, map) : null;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3, 9, 19, 0.075)";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.save();
      if (clipPath) ctx.clip(clipPath, "evenodd");
      ctx.globalCompositeOperation = "lighter";

      particlesRef.current.forEach((p) => {
        const u     = interpWind(field.uDat, p.lon, p.lat, field);
        const v     = interpWind(field.vDat, p.lon, p.lat, field);
        const speed = Math.sqrt(u * u + v * v);
        p.speed = speed;

        // Advance geographic position
        const dt     = 0.0021;
        const newLon = p.lon + u * dt;
        const newLat = p.lat + v * dt;

        // Update normalised position
        p.nLon = (newLon - field.lo1) / (field.lo2 - field.lo1);
        p.nLat = (newLat - field.la2) / (field.la1 - field.la2);

        // Reproject both old and new positions to current pixel coords
        const prevPx = lonLatToPixel(p.lon, p.lat, map);
        const newPx  = lonLatToPixel(newLon, newLat, map);

        p.lon = newLon;
        p.lat = newLat;
        p.age++;

        // Reset stale / out-of-bounds / stalled particles
        if (
          p.age > p.maxAge || speed < 0.05 ||
          newPx.x < -10 || newPx.x > cssWidth  + 10 ||
          newPx.y < -10 || newPx.y > cssHeight + 10
        ) {
          resetParticle(p);
          return;
        }

        const colorBase = windColorBase(speed);
        const life = Math.sin(Math.min(1, p.age / Math.max(p.maxAge, 1)) * Math.PI);
        const pulse = 0.78 + Math.sin(p.age * 0.12 + p.phase) * 0.22;
        const opacity = Math.min(0.62, (0.16 + (speed / 8) * 0.42) * life * pulse);

        ctx.beginPath();
        ctx.strokeStyle = `${colorBase}${opacity})`;
        ctx.lineWidth   = Math.max(0.65, Math.min(1.8, speed * 0.28));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(prevPx.x, prevPx.y);
        ctx.lineTo(newPx.x, newPx.y);
        ctx.stroke();
      });

      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [mapRef, geoData, syncCanvasSize, resetParticle]);

  const stopAnimation = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetch wind-velocity JSON from `apiUrl`, build the particle field, and
   * start the animation.
   *
   * Expected JSON shape (leaflet-velocity / GRIB2JSON):
   * [
   *   { header: { Ni, Nj, longitudeOfFirst..., latitudeOfFirst..., ... }, data: [...] },  // U
   *   { header: { ... }, data: [...] }   // V
   * ]
   */
  const loadWindField = useCallback(
    async (apiUrl: string) => {
      stopAnimation();
      fieldRef.current     = null;
      particlesRef.current = [];

      try {
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: WindComponent[] = await res.json();
        if (!data || data.length < 2) {
          console.warn("[Wind FX] API returned insufficient data");
          return;
        }

        const uHdr = data[0].header;
        const nx   = uHdr.Ni;
        const ny   = uHdr.Nj;
        const lo1  = uHdr.longitudeOfFirstGridPointInDegrees;
        const la1  = uHdr.latitudeOfFirstGridPointInDegrees;
        const lo2  = uHdr.longitudeOfLastGridPointInDegrees;
        const la2  = uHdr.latitudeOfLastGridPointInDegrees;
        const dx   = (lo2 - lo1) / Math.max(nx - 1, 1);
        const dy   = (la1 - la2) / Math.max(ny - 1, 1);

        fieldRef.current = {
          uDat: data[0].data,
          vDat: data[1].data,
          lo1, la1, lo2, la2, nx, ny, dx, dy,
        };

        particlesRef.current = Array.from({ length: 560 }, () => newParticle());

        if (enabledRef.current) startAnimation();
      } catch (e) {
        console.warn("[Wind FX] Failed to load wind field:", e);
      }
    },
    [stopAnimation, newParticle, startAnimation],
  );

  /** Stop animation and discard the current wind field */
  const clearWindField = useCallback(() => {
    stopAnimation();
    fieldRef.current     = null;
    particlesRef.current = [];
  }, [stopAnimation]);

  /**
   * Load wind data directly from your weather dashboard API response.
   *
   * Accepts either:
   *  - The full paginated response: { results: [{ wind_speed, wind_direction, ... }] }
   *  - A single result object:      { wind_speed, wind_direction, ... }
   *
   * Wind direction is meteorological degrees (0° = from North, 90° = from East).
   * A uniform wind field is synthesised covering Uganda's bounding box.
   */
  const loadWindFromWeatherAPI = useCallback(
    (apiData: any) => {
      stopAnimation();
      fieldRef.current     = null;
      particlesRef.current = [];

      // Unwrap paginated response if needed
      const record = apiData?.results?.[0] ?? apiData;
      if (!record) {
        console.warn("[Wind FX] No weather record found in data");
        return;
      }

      const speed     = record.wind_speed     ?? 0;   // m/s
      const dirDeg    = record.wind_direction  ?? 0;   // meteorological degrees
      const dirRad    = (dirDeg * Math.PI) / 180;

      // Meteorological convention: direction is where wind comes FROM
      // so we negate to get the vector the wind is blowing TOWARDS
      const u = -speed * Math.sin(dirRad);  // east component
      const v = -speed * Math.cos(dirRad);  // north component

      // Synthesise a uniform 10×10 grid covering Uganda
      const lo1 = 29.5, lo2 = 35.0;   // Uganda lon extent
      const la1 =  4.2, la2 = -1.5;   // Uganda lat extent (la1 = top/max)
      const nx = 10, ny = 10;
      const dx = (lo2 - lo1) / (nx - 1);
      const dy = (la1 - la2) / (ny - 1);
      const size = nx * ny;

      fieldRef.current = {
        uDat: Array(size).fill(u),
        vDat: Array(size).fill(v),
        lo1, la1, lo2, la2, nx, ny, dx, dy,
      };

      particlesRef.current = Array.from({ length: 560 }, () => newParticle());

      if (enabledRef.current) startAnimation();
    },
    [stopAnimation, newParticle, startAnimation],
  );

  /** Toggle animation on/off without discarding the field */
  const setEnabled = useCallback(
    (on: boolean) => {
      enabledRef.current = on;
      if (on && fieldRef.current && particlesRef.current.length) startAnimation();
      else stopAnimation();
    },
    [startAnimation, stopAnimation],
  );

  // ── ResizeObserver — sync canvas when container changes size ──────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => syncCanvasSize());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [syncCanvasSize]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopAnimation();
  }, [stopAnimation]);

  return {
    canvasRef,
    loadWindField,
    loadWindFromWeatherAPI,
    clearWindField,
    startAnimation,
    stopAnimation,
    setEnabled,
  };
}
